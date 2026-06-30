"""Fairness check: run the Turtle system on its NATIVE timeframe (daily bars).

The classic Turtle system was designed for daily bars and multi-week trends, so
testing it on 60m/15m is out of its element. Here we resample the 60m series to
daily OHLC (~500-750 bars/symbol over ~2-3 years) and re-run. Sample sizes are
smaller, so treat this as indicative; the protocol (IS/OOS, R-multiples, cost
sweep, per-instrument count) is unchanged.
"""
from __future__ import annotations

import glob
import os

import pandas as pd

from scalper_backtest import compute_stats, fmt
from turtle_backtest import TParams, simulate_turtle_symbol, pos_count

HERE = os.path.dirname(os.path.abspath(__file__))


def load_daily():
    data = {}
    for f in sorted(glob.glob(os.path.join(HERE, "data", "60m", "*.csv"))):
        sym = os.path.splitext(os.path.basename(f))[0]
        df = pd.read_csv(f, parse_dates=["time"]).set_index("time")
        d = df.resample("1D").agg(
            open=("open", "first"), high=("high", "max"),
            low=("low", "min"), close=("close", "last"),
        ).dropna().reset_index()
        if len(d) > 120:
            data[sym] = d
    return data


def run(data, p, split):
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


CONFIGS = {
    "System1 20/10 (daily)": dict(entry_channel=20, exit_channel=10, atr_period=20, stop_n=2.0),
    "System2 55/20 (daily)": dict(entry_channel=55, exit_channel=20, atr_period=20, stop_n=2.0),
}


def main():
    data = load_daily()
    print(f"Loaded {len(data)} symbols as daily bars "
          f"(median {int(pd.Series([len(v) for v in data.values()]).median())} bars)\n")
    for name, base in CONFIGS.items():
        print(f"############ {name} ############")
        for cost in (0.0, 0.02):
            p = TParams(cost_atr_frac=cost, max_hold_bars=400, **base)
            allp, per_all = run(data, p, "all")
            isp, _ = run(data, p, "is")
            oosp, per_oos = run(data, p, "oos")
            pa, ta = pos_count(per_all)
            po, to = pos_count(per_oos)
            print(f"  cost={cost:.2f}/side")
            print(f"     ALL : {fmt(allp)}   [+symbols {pa}/{ta}]")
            print(f"     IS  : {fmt(isp)}")
            print(f"     OOS : {fmt(oosp)}   [+symbols {po}/{to}]")
        print()


if __name__ == "__main__":
    main()
