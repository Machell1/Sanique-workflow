"""Where does the full Turtle work best? Scan every instrument + timeframe.

Runs the full Turtle (pyramiding/N-sizing/ratcheting stops) on all 15 instruments
at daily and H4, ranked by compounded return. Cost is a per-side fraction of N so
it is fair across instruments at very different price scales.

CAVEATS: ~2-3 years per instrument => daily samples are small (often 15-40
trades). This is a DESCRIPTIVE ranking of where breakout trend-following happened
to pay over this window, not a predictive, out-of-sample claim. Crypto/metals in
2024-25 trended hard; FX majors chopped. Past trend is not future trend.
"""
from __future__ import annotations

import glob
import os

import pandas as pd

from full_turtle_eurusd import Cfg, simulate, load_tf

HERE = os.path.dirname(os.path.abspath(__file__))
COST = 0.02  # per-side fraction of ATR


def all_symbols():
    return sorted(os.path.splitext(os.path.basename(f))[0]
                  for f in glob.glob(os.path.join(HERE, "data", "60m", "*.csv")))


def metrics(df, cfg, years):
    eq, trades, max_dd, _ = simulate(df, cfg)
    n = len(trades)
    if n == 0:
        return None
    cagr = eq ** (1.0 / years) - 1.0 if years > 0 and eq > 0 else float("nan")
    pos = trades[trades > 0].sum()
    neg = -trades[trades < 0].sum()
    pf = pos / neg if neg > 0 else float("inf")
    win = float((trades > 0).mean()) * 100
    return dict(n=n, ret=(eq - 1) * 100, cagr=cagr * 100, dd=max_dd * 100, win=win, pf=pf)


def scan(rule_name, rule):
    rows = []
    for sym in all_symbols():
        df = load_tf(sym, rule)
        if len(df) < 150:
            continue
        years = (df["time"].iloc[-1] - df["time"].iloc[0]).days / 365.25
        for sysname, cfg in (
            ("S1", Cfg(system=1, entry_channel=20, exit_channel=10, s1_filter=True,
                       spread_price=0.0, cost_atr_frac=COST)),
            ("S2", Cfg(system=2, entry_channel=55, exit_channel=20, s1_filter=False,
                       spread_price=0.0, cost_atr_frac=COST)),
        ):
            m = metrics(df, cfg, years)
            if m:
                rows.append((sym, sysname, m))
    rows.sort(key=lambda r: r[2]["ret"], reverse=True)
    print(f"\n==================== {rule_name} (cost {COST} ATR/side) ====================")
    print(f"{'sym':8s} {'sys':3s} {'trades':>6s} {'return':>9s} {'CAGR':>8s} {'maxDD':>7s} {'win':>6s} {'PF':>6s}")
    for sym, sysname, m in rows:
        print(f"{sym:8s} {sysname:3s} {m['n']:6d} {m['ret']:+8.1f}% {m['cagr']:+7.1f}% "
              f"{m['dd']:6.1f}% {m['win']:5.1f}% {m['pf']:6.2f}")


def main():
    for name, rule in (("DAILY", "1D"), ("H4", "4h")):
        scan(name, rule)


if __name__ == "__main__":
    main()
