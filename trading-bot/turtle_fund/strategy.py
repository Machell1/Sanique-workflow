"""Stateful Turtle execution for a single symbol (System 1 or System 2).

Fed one bar at a time by the fund loop. Handles breakout entry, pyramiding,
ratcheting 2N stop and the trailing opposite-channel exit. Position sizing is
driven by the fund (a per-unit fraction of fund equity and the symbol's N), so
the fund can apply a risk multiplier and portfolio caps.

Pessimistic intrabar order: adverse (stop/channel exit) is checked before
favourable (pyramid adds). Cost is a per-side fraction of N.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .data import wilder_atr


class SymbolTrader:
    def __init__(self, symbol, df, *, entry_channel, exit_channel, atr_period=20,
                 stop_n=2.0, add_step_n=0.5, max_units=4, cost_atr_frac=0.02,
                 s1_filter=False):
        self.symbol = symbol
        self.o = df["open"].to_numpy(float)
        self.h = df["high"].to_numpy(float)
        self.l = df["low"].to_numpy(float)
        self.c = df["close"].to_numpy(float)
        self.atr = wilder_atr(self.h, self.l, self.c, atr_period)
        hs, ls = pd.Series(self.h), pd.Series(self.l)
        self.entry_hi = hs.shift(1).rolling(entry_channel).max().to_numpy()
        self.entry_lo = ls.shift(1).rolling(entry_channel).min().to_numpy()
        self.exit_lo = ls.shift(1).rolling(exit_channel).min().to_numpy()
        self.exit_hi = hs.shift(1).rolling(exit_channel).max().to_numpy()
        self.dates = df["time"].to_numpy()
        self.date_to_i = {d: i for i, d in enumerate(self.dates)}

        self.entry_channel = entry_channel
        self.atr_period = atr_period
        self.stop_n = stop_n
        self.add_step_n = add_step_n
        self.max_units = max_units
        self.cost = cost_atr_frac
        self.s1_filter = s1_filter

        self.pos = None
        self.last_winner = False
        self.warmup = entry_channel + atr_period + 2

    # --- queries -----------------------------------------------------------
    def has_position(self):
        return self.pos is not None

    def unrealized(self, i):
        if self.pos is None:
            return 0.0
        price = self.c[i]
        return sum(notional * (price - ep) * self.pos["side"]
                   for ep, notional in self.pos["units"])

    # --- main step ---------------------------------------------------------
    def update(self, i, *, allow_new_entry, unit_fraction, equity):
        """Advance one bar. Returns (realized_pnl_currency, list_of_events)."""
        events = []
        a = self.atr[i]
        if i < self.warmup or not np.isfinite(a) or a <= 0:
            return 0.0, events

        if self.pos is None:
            if not allow_new_entry:
                return 0.0, events
            long_b = np.isfinite(self.entry_hi[i]) and self.h[i] >= self.entry_hi[i]
            short_b = np.isfinite(self.entry_lo[i]) and self.l[i] <= self.entry_lo[i]
            if not (long_b or short_b):
                return 0.0, events
            if self.s1_filter and self.last_winner:
                self.last_winner = False           # filter consumes this breakout
                return 0.0, events
            side = 1 if long_b else -1
            level = self.entry_hi[i] if side > 0 else self.entry_lo[i]
            cost_px = self.cost * a
            fill = (max(self.o[i], level) if side > 0 else min(self.o[i], level)) + side * cost_px
            unit_notional = unit_fraction * equity / a
            self.pos = {
                "side": side, "N": a, "eq_open": equity, "unit_notional": unit_notional,
                "units": [(fill, unit_notional)],
                "anchor": fill, "stop": fill - side * self.stop_n * a,
            }
            events.append(("ENTER", side, fill, unit_notional))
            return 0.0, events

        # In a position: adverse check first.
        pos = self.pos
        side = pos["side"]
        cost_px = self.cost * pos["N"]
        if side > 0:
            eff = pos["stop"]
            if np.isfinite(self.exit_lo[i]):
                eff = max(eff, self.exit_lo[i])
            hit = self.l[i] <= eff
            exit_px = (self.o[i] if self.o[i] < eff else eff) - cost_px
        else:
            eff = pos["stop"]
            if np.isfinite(self.exit_hi[i]):
                eff = min(eff, self.exit_hi[i])
            hit = self.h[i] >= eff
            exit_px = (self.o[i] if self.o[i] > eff else eff) + cost_px

        if hit:
            realized = sum(notional * (exit_px - ep) * side for ep, notional in pos["units"])
            self.last_winner = realized > 0
            events.append(("EXIT", side, exit_px, realized))
            self.pos = None
            return realized, events

        # Favourable: pyramid adds.
        while len(pos["units"]) < self.max_units:
            k = len(pos["units"])
            next_level = pos["anchor"] + side * self.add_step_n * pos["N"] * k
            reached = (self.h[i] >= next_level) if side > 0 else (self.l[i] <= next_level)
            if not reached:
                break
            fill = next_level + side * cost_px
            pos["units"].append((fill, pos["unit_notional"]))
            pos["stop"] = fill - side * self.stop_n * pos["N"]
            events.append(("ADD", side, fill, pos["unit_notional"]))
        return 0.0, events

    def force_close(self, i):
        if self.pos is None:
            return 0.0
        side = self.pos["side"]
        exit_px = self.c[i] - side * self.cost * self.pos["N"]
        realized = sum(notional * (exit_px - ep) * side for ep, notional in self.pos["units"])
        self.last_winner = realized > 0
        self.pos = None
        return realized
