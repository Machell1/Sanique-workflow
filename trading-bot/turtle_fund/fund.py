"""Turtle fund orchestrator — agents running in a walk-forward loop.

Each loop tick is a trading day. On a rebalance cadence the Selection agent ranks
trend quality (causally) and the Manager agent (Claude or fallback) picks which
symbols to enable and a risk multiplier. The Risk agent enforces hard portfolio
caps and a drawdown halt. The Execution layer runs the Turtle state machine on
the enabled symbols and manages open positions to their exit.

This runs in PAPER mode over historical data (reproducible, honest). A live mode
would replace the date loop with a broker poll (see run_fund.py).
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass

import numpy as np

from .data import load_daily
from .strategy import SymbolTrader
from .selection import SelectionAgent
from .agents import ManagerAgent, RiskAgent
from . import claude_client


@dataclass
class FundConfig:
    system: int = 2                 # System 2 (55/20) was the best Turtle variant
    entry_channel: int = 55
    exit_channel: int = 20
    atr_period: int = 20
    stop_n: float = 2.0
    max_units: int = 4
    cost_atr_frac: float = 0.02
    risk_per_unit: float = 0.005    # 0.5% equity per 1N, per unit (keeps drawdown tolerable)
    rebalance_days: int = 20        # re-select / re-manage cadence
    sel_window: int = 100
    sel_min_er: float = 0.12        # LOOSE trendiness gate (broad trading; aggressive top-k hurt)
    sel_top_k: int = 12
    max_enabled: int = 10
    max_total_units: int = 16
    max_per_direction: int = 10
    hard_dd_halt: float = 0.40      # catastrophe-only; halting mid-drawdown kills trend-following
    start_date: str = ""            # optional ISO date to begin trading (for IS/OOS splits)


class TurtleFund:
    def __init__(self, cfg: FundConfig, universe: list[str] | None = None, logdir: str | None = None):
        self.cfg = cfg
        self.dfs = load_daily(universe)
        s1 = cfg.system == 1
        self.traders = {
            sym: SymbolTrader(
                sym, df, entry_channel=cfg.entry_channel, exit_channel=cfg.exit_channel,
                atr_period=cfg.atr_period, stop_n=cfg.stop_n, max_units=cfg.max_units,
                cost_atr_frac=cfg.cost_atr_frac, s1_filter=s1,
            )
            for sym, df in self.dfs.items()
        }
        self.selector = SelectionAgent(cfg.sel_window, cfg.sel_min_er, cfg.sel_top_k)
        self.manager = ManagerAgent(cfg.max_enabled)
        self.risk = RiskAgent(max_total_units=cfg.max_total_units,
                              max_per_direction=cfg.max_per_direction,
                              hard_dd_halt=cfg.hard_dd_halt)
        self.logdir = logdir

    # --- portfolio unit bookkeeping ---------------------------------------
    def _unit_counts(self):
        total = long = short = 0
        for t in self.traders.values():
            if t.pos is not None:
                u = len(t.pos["units"])
                total += u
                if t.pos["side"] > 0:
                    long += u
                else:
                    short += u
        return total, long, short

    def run(self):
        cfg = self.cfg
        # Master calendar = union of all symbols' dates.
        all_dates = sorted({d for df in self.dfs.values() for d in df["time"].to_numpy()})
        last_i = {sym: None for sym in self.traders}
        start_cut = np.datetime64(cfg.start_date) if cfg.start_date else None

        equity = 1.0
        peak = 1.0
        max_dd = 0.0
        enabled: list[str] = []
        risk_mult = 1.0

        equity_curve = []
        trades = []
        decisions = []
        rebalance_counter = 0

        for d in all_dates:
            # Advance per-symbol pointers for symbols that have a bar today.
            todays = []
            for sym, t in self.traders.items():
                i = t.date_to_i.get(d)
                if i is not None:
                    last_i[sym] = i
                    todays.append(sym)

            # Before the (optional) start date: warm up channels/pointers only.
            if start_cut is not None and np.datetime64(d) < start_cut:
                continue

            # Drawdown from MTM peak (computed below) governs halts/derisking.
            mtm = equity + sum(self.traders[s].unrealized(last_i[s])
                               for s in self.traders if last_i[s] is not None)
            peak = max(peak, mtm)
            drawdown = (peak - mtm) / peak if peak > 0 else 0.0

            # Rebalance: selection + manager decision.
            if rebalance_counter % cfg.rebalance_days == 0:
                cands = self.selector.rank(self.dfs, d)
                if cands:
                    dec = self.manager.decide(equity=equity, peak=peak, drawdown=drawdown,
                                              open_positions=self._unit_counts()[0], candidates=cands)
                    enabled, risk_mult = dec.enabled, dec.risk_multiplier
                    decisions.append({"date": str(d)[:10], "enabled": enabled,
                                      "risk_multiplier": risk_mult, "source": dec.source,
                                      "rationale": dec.rationale,
                                      "candidates": [c.symbol for c in cands]})
            rebalance_counter += 1

            halted = self.risk.trading_halted(drawdown)

            # Execute per symbol that has a bar today.
            for sym in todays:
                t = self.traders[sym]
                i = last_i[sym]
                total_u, long_u, short_u = self._unit_counts()
                allow = (sym in enabled) and (not halted) and (total_u < cfg.max_total_units)
                realized, events = t.update(
                    i, allow_new_entry=allow,
                    unit_fraction=cfg.risk_per_unit * risk_mult, equity=equity,
                )
                if realized:
                    equity += realized
                for ev in events:
                    kind, side, price, val = ev
                    trades.append({"date": str(d)[:10], "symbol": sym, "event": kind,
                                   "side": "long" if side > 0 else "short",
                                   "price": round(float(price), 5),
                                   "value": round(float(val), 5)})

            mtm = equity + sum(self.traders[s].unrealized(last_i[s])
                               for s in self.traders if last_i[s] is not None)
            peak = max(peak, mtm)
            max_dd = max(max_dd, (peak - mtm) / peak if peak > 0 else 0.0)
            equity_curve.append({"date": str(d)[:10], "equity": round(mtm, 5),
                                 "enabled": ",".join(enabled), "risk": risk_mult})

        # Close any residual open positions at the last seen bar.
        for sym, t in self.traders.items():
            if t.pos is not None and last_i[sym] is not None:
                equity += t.force_close(last_i[sym])

        summary = self._summarize(equity, max_dd, trades, all_dates)
        summary["claude_enabled"] = claude_client.is_enabled()
        self._write_logs(equity_curve, trades, decisions, summary)
        return summary, equity_curve, trades, decisions

    def _summarize(self, equity, max_dd, trades, all_dates):
        exits = [t for t in trades if t["event"] == "EXIT"]
        pnls = np.array([t["value"] for t in exits], float)
        years = max((np.datetime64(all_dates[-1]) - np.datetime64(all_dates[0]))
                    / np.timedelta64(365, "D"), 1e-9)
        n = len(pnls)
        win = float((pnls > 0).mean()) * 100 if n else 0.0
        pos = pnls[pnls > 0].sum() if n else 0.0
        neg = -pnls[pnls < 0].sum() if n else 0.0
        pf = (pos / neg) if neg > 0 else float("inf")
        cagr = (equity ** (1.0 / years) - 1.0) if equity > 0 else float("nan")
        return {
            "final_equity": round(equity, 4),
            "total_return_pct": round((equity - 1) * 100, 1),
            "cagr_pct": round(cagr * 100, 1),
            "max_drawdown_pct": round(max_dd * 100, 1),
            "round_trips": n,
            "win_rate_pct": round(win, 1),
            "profit_factor": round(pf, 2) if np.isfinite(pf) else None,
            "years": round(float(years), 2),
        }

    def _write_logs(self, equity_curve, trades, decisions, summary):
        if not self.logdir:
            return
        os.makedirs(self.logdir, exist_ok=True)
        import csv

        with open(os.path.join(self.logdir, "equity_curve.csv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["date", "equity", "enabled", "risk"])
            w.writeheader()
            w.writerows(equity_curve)
        with open(os.path.join(self.logdir, "trades.csv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["date", "symbol", "event", "side", "price", "value"])
            w.writeheader()
            w.writerows(trades)
        with open(os.path.join(self.logdir, "decisions.jsonl"), "w") as f:
            for d in decisions:
                f.write(json.dumps(d) + "\n")
        with open(os.path.join(self.logdir, "summary.json"), "w") as f:
            json.dump(summary, f, indent=2)
