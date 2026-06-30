"""Manager and Risk agents for the turtle fund.

ManagerAgent  -- decides which shortlisted symbols to enable and a risk
                 multiplier, using Claude when ANTHROPIC_API_KEY is set, with a
                 transparent deterministic fallback otherwise. This is the
                 "Claude runs/manages the fund" layer; every decision (and its
                 rationale) is logged.
RiskAgent     -- hard, non-negotiable portfolio caps (total units, per-direction,
                 drawdown halt). The manager can only be MORE conservative than
                 these; it can never override them.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from . import claude_client


@dataclass
class ManagerDecision:
    enabled: list[str]
    risk_multiplier: float
    rationale: str
    source: str  # "claude" or "fallback"


SYSTEM_PROMPT = (
    "You are the portfolio manager of a Turtle trend-following fund. "
    "You trade ONLY strongly trending instruments and you protect capital first. "
    "Given the fund state and a ranked shortlist of trend candidates, choose which "
    "symbols to enable for new entries and a single risk_multiplier in [0.3, 1.0] "
    "(lower it when drawdown is elevated or trend quality is weak). "
    "Respond ONLY with compact JSON: "
    '{"enabled": ["SYM", ...], "risk_multiplier": 0.x, "rationale": "one sentence"}.'
)


class ManagerAgent:
    # dd_softstop defaults high: empirically, trimming risk mid-drawdown hurt
    # trend-following. The RiskAgent's catastrophe halt is the real backstop. A
    # Claude manager may still choose to de-risk; the deterministic fallback won't.
    def __init__(self, max_enabled: int = 10, dd_softstop: float = 0.99):
        self.max_enabled = max_enabled
        self.dd_softstop = dd_softstop

    def decide(self, *, equity, peak, drawdown, open_positions, candidates) -> ManagerDecision:
        shortlist = [
            {"symbol": c.symbol, "er": round(c.er, 3),
             "mom_sigma": round(c.mom_sigma, 2), "direction": c.direction}
            for c in candidates
        ]
        if claude_client.is_enabled():
            user = json.dumps({
                "equity": round(equity, 4),
                "drawdown": round(drawdown, 4),
                "open_positions": open_positions,
                "max_enabled": self.max_enabled,
                "candidates": shortlist,
            })
            reply = claude_client.ask_json(SYSTEM_PROMPT, user)
            decision = self._validate(reply, candidates)
            if decision is not None:
                return decision
        return self._fallback(drawdown, candidates)

    def _validate(self, reply, candidates):
        if not isinstance(reply, dict):
            return None
        valid = {c.symbol for c in candidates}
        enabled = [s for s in reply.get("enabled", []) if s in valid][: self.max_enabled]
        try:
            rm = float(reply.get("risk_multiplier", 1.0))
        except (TypeError, ValueError):
            return None
        rm = max(0.3, min(1.0, rm))
        if not enabled:
            return None
        return ManagerDecision(enabled, rm, str(reply.get("rationale", ""))[:200], "claude")

    def _fallback(self, drawdown, candidates):
        enabled = [c.symbol for c in candidates][: self.max_enabled]
        rm = 1.0
        # Only trim risk in DEEP drawdowns - trend-following must endure normal ones.
        if drawdown >= self.dd_softstop:
            rm = 0.7
        if drawdown >= self.dd_softstop * 1.5:
            rm = 0.5
        rationale = (f"Enable top {len(enabled)} trend candidates; "
                     f"risk x{rm} (drawdown {drawdown:.1%}).")
        return ManagerDecision(enabled, rm, rationale, "fallback")


class RiskAgent:
    def __init__(self, *, max_total_units=12, max_per_direction=8, hard_dd_halt=0.25):
        self.max_total_units = max_total_units
        self.max_per_direction = max_per_direction
        self.hard_dd_halt = hard_dd_halt

    def trading_halted(self, drawdown: float) -> bool:
        return drawdown >= self.hard_dd_halt

    def can_open(self, *, total_units, long_units, short_units, side) -> bool:
        if total_units >= self.max_total_units:
            return False
        if side > 0 and long_units >= self.max_per_direction:
            return False
        if side < 0 and short_units >= self.max_per_direction:
            return False
        return True
