"""Disciplined hypothesis search for the scalper, with anti-overfit protocol.

Protocol:
  1. Rank every grid config by IN-SAMPLE pooled expectancy (first 70% of the
     60m dataset), net of a realistic cost. Selection NEVER looks at OOS.
  2. For the top candidates, report the UNTOUCHED out-of-sample slice
     (last 30% of 60m) AND the fully independent 15m dataset (different period
     and timeframe).
  3. An "edge" must stay positive with a meaningful t-stat in BOTH holdouts and
     be positive on a majority of the 15 instruments. Anything that only shines
     in-sample is treated as overfit noise.

Costs are a per-side fraction of ATR; we select at a realistic 0.02 and then
re-check survivors at 0.0 / 0.03 / 0.05.
"""
from __future__ import annotations

import itertools

from scalper_backtest import Params, load_dataset, run, compute_stats, simulate_symbol, fmt

SELECT_COST = 0.02

GRID = {
    "direction": ["cont", "fade"],
    "entry_style": ["stop", "market"],
    "momentum_atr": [1.5, 2.0, 3.0],
    "momentum_bars": [6, 12],
    "stop_atr": [1.0, 2.0],
    "tp_atr": [1.5, 3.0],
}


def make_params(combo, cost):
    return Params(
        direction=combo["direction"],
        entry_style=combo["entry_style"],
        momentum_atr=combo["momentum_atr"],
        momentum_bars=combo["momentum_bars"],
        stop_atr=combo["stop_atr"],
        tp_atr=combo["tp_atr"],
        cost_atr_frac=cost,
    )


def pooled_for(data, p, split):
    pooled, _ = run(data, p, split)
    return pooled


def positive_symbol_fraction(data, p, split):
    _, per = run(data, p, split)
    pos = sum(1 for s in per.values() if s.n >= 20 and s.expectancy > 0)
    tot = sum(1 for s in per.values() if s.n >= 20)
    return pos, tot


def main():
    d60 = load_dataset("60m")
    d15 = load_dataset("15m")

    keys = list(GRID)
    combos = [dict(zip(keys, vals)) for vals in itertools.product(*GRID.values())]
    print(f"Evaluating {len(combos)} configs on IS (60m first 70%), cost={SELECT_COST}/side\n")

    ranked = []
    for combo in combos:
        p = make_params(combo, SELECT_COST)
        s = pooled_for(d60, p, "is")
        if s.n >= 200:
            ranked.append((s.expectancy, s.tstat, combo, s))
    ranked.sort(key=lambda x: x[0], reverse=True)

    print("Top 10 by in-sample expectancy (net of cost):")
    print(f"{'rank':>4} {'dir':>4} {'entry':>6} {'mAtr':>4} {'mBar':>4} {'sAtr':>4} {'tpAtr':>5}   IS")
    for idx, (_, _, combo, s) in enumerate(ranked[:10], 1):
        print(f"{idx:>4} {combo['direction']:>4} {combo['entry_style']:>6} "
              f"{combo['momentum_atr']:>4} {combo['momentum_bars']:>4} "
              f"{combo['stop_atr']:>4} {combo['tp_atr']:>5}   {fmt(s)}")

    print("\n=== Holdout check for the top 6 IS configs ===")
    for idx, (_, _, combo, s_is) in enumerate(ranked[:6], 1):
        p = make_params(combo, SELECT_COST)
        s_oos = pooled_for(d60, p, "oos")
        s_15 = pooled_for(d15, p, "all")
        pos60, tot60 = positive_symbol_fraction(d60, p, "oos")
        pos15, tot15 = positive_symbol_fraction(d15, p, "all")
        print(f"\n#{idx} {combo}")
        print(f"   IS  60m : {fmt(s_is)}")
        print(f"   OOS 60m : {fmt(s_oos)}   [+symbols {pos60}/{tot60}]")
        print(f"   ALL 15m : {fmt(s_15)}   [+symbols {pos15}/{tot15}]")
        # Cost sensitivity on the OOS slice.
        for c in (0.0, 0.03, 0.05):
            sc = pooled_for(d60, make_params(combo, c), "oos")
            print(f"     OOS 60m cost={c:.2f}: {fmt(sc)}")


if __name__ == "__main__":
    main()
