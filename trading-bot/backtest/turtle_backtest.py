"""Turtle-style Donchian breakout engine, same anti-overfit protocol as the scalper.

Faithful to the classic Turtle rules (adapted to intraday bars):
  * Entry: buy when price breaks the prior `entry_channel`-bar HIGH, sell when it
    breaks the prior `entry_channel`-bar LOW (a stop order at the channel edge).
  * Initial stop: `stop_n` x N, where N = ATR(atr_period). Turtle uses 2N.
  * Exit: trailing opposite Donchian channel (`exit_channel`-bar low for longs,
    high for shorts) OR the initial stop, whichever price reaches first. No fixed
    take-profit -> cut losses, let winners run.
  * Optional System-1 filter: skip an entry if the previous breakout was a winner.

No pyramiding here: we are testing the SIGN and robustness of the per-trade edge,
not return scaling. Adding units changes position size, not whether the entry has
an edge. Results are R-multiples (P&L / initial 2N risk). Pessimistic fills:
entries fill at the worse of channel level / bar open; exits at the worse of the
trigger / bar open.

Reuses data, indicators and stats from scalper_backtest.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass

import numpy as np
import pandas as pd

from scalper_backtest import load_dataset, wilder_atr, compute_stats, fmt, Stats


@dataclass
class TParams:
    entry_channel: int = 20
    exit_channel: int = 10
    atr_period: int = 20
    stop_n: float = 2.0
    cost_atr_frac: float = 0.0
    s1_filter: bool = False     # skip entry if the previous breakout was a winner
    max_hold_bars: int = 500
    long_only: bool = False
    short_only: bool = False


def simulate_turtle_symbol(df: pd.DataFrame, p: TParams, lo: int, hi: int):
    o = df["open"].to_numpy(float)
    h = df["high"].to_numpy(float)
    l = df["low"].to_numpy(float)
    c = df["close"].to_numpy(float)
    atr = wilder_atr(h, l, c, p.atr_period)

    high_s = pd.Series(h)
    low_s = pd.Series(l)
    # Channels use ONLY prior bars (shift 1) -> no look-ahead.
    entry_hi = high_s.shift(1).rolling(p.entry_channel).max().to_numpy()
    entry_lo = low_s.shift(1).rolling(p.entry_channel).min().to_numpy()
    exit_lo = low_s.shift(1).rolling(p.exit_channel).min().to_numpy()
    exit_hi = high_s.shift(1).rolling(p.exit_channel).max().to_numpy()

    n = len(c)
    start = max(lo, p.entry_channel + p.atr_period + 1)
    end = min(hi, n - 1)

    results = []
    last_was_winner = False
    i = start
    while i < end:
        a = atr[i]
        eh, el = entry_hi[i], entry_lo[i]
        if not np.isfinite(a) or a <= 0 or not np.isfinite(eh) or not np.isfinite(el):
            i += 1
            continue

        long_break = (h[i] >= eh) and not p.short_only
        short_break = (l[i] <= el) and not p.long_only
        if not (long_break or short_break):
            i += 1
            continue

        # System-1 filter: only take the breakout if the previous one lost.
        if p.s1_filter and last_was_winner:
            last_was_winner = False  # the skipped breakout "resets" the filter
            i += 1
            continue

        side = 1 if long_break else -1
        level = eh if side > 0 else el
        # Entry fill: the channel edge, or the open if it gapped through.
        entry = max(o[i], level) if side > 0 else min(o[i], level)

        risk = p.stop_n * a
        init_stop = entry - risk if side > 0 else entry + risk
        cost = p.cost_atr_frac * a

        exit_price = None
        exit_bar = i
        for k in range(i, min(i + p.max_hold_bars, n)):
            if side > 0:
                eff_stop = init_stop
                if np.isfinite(exit_lo[k]):
                    eff_stop = max(eff_stop, exit_lo[k])   # trailing channel exit
                if l[k] <= eff_stop:
                    exit_price = min(o[k], eff_stop) if k == i else eff_stop
                    # if the bar opened below the stop, fill at the open (worse)
                    if o[k] < eff_stop:
                        exit_price = o[k]
                    exit_bar = k
                    break
            else:
                eff_stop = init_stop
                if np.isfinite(exit_hi[k]):
                    eff_stop = min(eff_stop, exit_hi[k])
                if h[k] >= eff_stop:
                    exit_price = max(o[k], eff_stop) if k == i else eff_stop
                    if o[k] > eff_stop:
                        exit_price = o[k]
                    exit_bar = k
                    break

        if exit_price is None:
            exit_bar = min(i + p.max_hold_bars - 1, n - 1)
            exit_price = c[exit_bar]

        gross = (exit_price - entry) * side
        r = (gross - 2 * cost) / risk
        results.append(r)
        last_was_winner = r > 0
        i = max(exit_bar + 1, i + 1)

    return results


def run(data: dict, p: TParams, split: str):
    pooled, per = [], {}
    for sym, df in data.items():
        n = len(df)
        if split == "is":
            lo, hi = 0, int(n * 0.7)
        elif split == "oos":
            lo, hi = int(n * 0.7), n
        else:
            lo, hi = 0, n
        rs = simulate_turtle_symbol(df, p, lo, hi)
        per[sym] = compute_stats(rs)
        pooled.extend(rs)
    return compute_stats(pooled), per


def pos_count(per):
    pos = sum(1 for s in per.values() if s.n >= 10 and s.expectancy > 0)
    tot = sum(1 for s in per.values() if s.n >= 10)
    return pos, tot


CONFIGS = {
    "System1 20/10 stop2N": TParams(entry_channel=20, exit_channel=10, stop_n=2.0),
    "System1 20/10 +winner-filter": TParams(entry_channel=20, exit_channel=10, stop_n=2.0, s1_filter=True),
    "System2 55/20 stop2N": TParams(entry_channel=55, exit_channel=20, stop_n=2.0),
    "Fast 10/5 stop2N": TParams(entry_channel=10, exit_channel=5, stop_n=2.0),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--costs", default="0.02,0.03")
    args = ap.parse_args()
    costs = [float(x) for x in args.costs.split(",")]

    d60 = load_dataset("60m")
    d15 = load_dataset("15m")
    print(f"Loaded {len(d60)} symbols (60m), {len(d15)} (15m)\n")

    for name, base in CONFIGS.items():
        print(f"############ {name} ############")
        for cost in costs:
            p = TParams(**{**base.__dict__, "cost_atr_frac": cost})
            is60, _ = run(d60, p, "is")
            oos60, per_oos = run(d60, p, "oos")
            all15, per15 = run(d15, p, "all")
            po, to = pos_count(per_oos)
            p15, t15 = pos_count(per15)
            print(f"  cost={cost:.2f}/side")
            print(f"     IS  60m : {fmt(is60)}")
            print(f"     OOS 60m : {fmt(oos60)}   [+symbols {po}/{to}]")
            print(f"     ALL 15m : {fmt(all15)}   [+symbols {p15}/{t15}]")
        print()


if __name__ == "__main__":
    main()
