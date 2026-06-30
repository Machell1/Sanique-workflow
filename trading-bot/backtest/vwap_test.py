"""Test the VWAP discount/premium rule: buy only below VWAP, sell only above.

Same anti-overfit protocol as the rest of the harness (IS = first 70% of 60m,
untouched OOS = last 30%, independent 15m set, R-multiples, cost swept).

We test the rule two ways:
  * as a FILTER on the validated continuation entry (cont + VWAP), and
  * paired with a FADE entry (buy a dip that is below VWAP, sell a rip above) —
    which is the natural "buy discount / sell premium" mean-reversion strategy.
"""
from __future__ import annotations

from scalper_backtest import Params, load_dataset, run, fmt


def line(label, d60, d15, p):
    is60, _ = run(d60, p, "is")
    oos60, per_oos = run(d60, p, "oos")
    all15, per15 = run(d15, p, "all")
    po = sum(1 for s in per_oos.values() if s.n >= 20 and s.expectancy > 0)
    to = sum(1 for s in per_oos.values() if s.n >= 20)
    print(f"\n{label}")
    print(f"   IS  60m : {fmt(is60)}")
    print(f"   OOS 60m : {fmt(oos60)}   [+symbols {po}/{to}]")
    print(f"   ALL 15m : {fmt(all15)}")


def main():
    d60 = load_dataset("60m")
    d15 = load_dataset("15m")
    cost = 0.02
    common = dict(momentum_atr=2.0, momentum_bars=6, stop_atr=1.0, tp_atr=3.0, cost_atr_frac=cost)

    print("=== Permanent AVWAP filter — calibration sweep, cost 0.02/side ===")
    line("Continuation tp3 (baseline, no VWAP)",
         d60, d15, Params(direction="cont", entry_style="stop", **common))
    for mb in (4, 8, 12, 16):
        line(f"Continuation + AVWAP, calibrate >= {mb} bars",
             d60, d15, Params(direction="cont", entry_style="stop",
                              vwap_window=1, vwap_min_bars=mb, **common))


if __name__ == "__main__":
    main()
