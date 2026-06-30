"""Before/after confirmation of the EA's shipped config vs validated candidates.

Prints IS (60m first 70%), OOS (60m last 30%, untouched) and the independent
15m set, at two realistic cost levels, with the count of instruments that are
individually profitable. No selection happens here - these three configs are
fixed; we are simply reporting how each holds up.
"""
from __future__ import annotations

from scalper_backtest import Params, load_dataset, run, fmt

CONFIGS = {
    "ORIGINAL (stop1.0/tp1.5)": dict(momentum_atr=2.0, momentum_bars=6, stop_atr=1.0, tp_atr=1.5),
    "RECOMMENDED (stop1.0/tp3.0)": dict(momentum_atr=2.0, momentum_bars=6, stop_atr=1.0, tp_atr=3.0),
    "ROBUST (stop2.0/tp3.0)": dict(momentum_atr=2.0, momentum_bars=6, stop_atr=2.0, tp_atr=3.0),
}


def pos_count(data, p, split):
    _, per = run(data, p, split)
    pos = sum(1 for s in per.values() if s.n >= 20 and s.expectancy > 0)
    tot = sum(1 for s in per.values() if s.n >= 20)
    return pos, tot


def main():
    d60 = load_dataset("60m")
    d15 = load_dataset("15m")
    for name, base in CONFIGS.items():
        print(f"\n############ {name} ############")
        for cost in (0.02, 0.03):
            p = Params(direction="cont", entry_style="stop", cost_atr_frac=cost, **base)
            is60, _ = run(d60, p, "is")
            oos60, _ = run(d60, p, "oos")
            all15, _ = run(d15, p, "all")
            po, to = pos_count(d60, p, "oos")
            p15, t15 = pos_count(d15, p, "all")
            print(f"  cost={cost:.2f}/side")
            print(f"     IS  60m : {fmt(is60)}")
            print(f"     OOS 60m : {fmt(oos60)}   [+symbols {po}/{to}]")
            print(f"     ALL 15m : {fmt(all15)}   [+symbols {p15}/{t15}]")


if __name__ == "__main__":
    main()
