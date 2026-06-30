"""Entry point for the Turtle fund.

Paper mode (default): walk-forward over the cached historical daily data, with
the Selection / Manager / Risk agents running in the loop. Reproducible and
honest — it does not place real orders.

Live mode: intentionally a stub. Live trading needs a running MetaTrader 5
terminal (the `MetaTrader5` Python package, Windows-only) which is not available
in this environment. The loop structure is identical; only the data source and
the order-execution calls change.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os

from .fund import TurtleFund, FundConfig
from . import claude_client

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser(description="Turtle trend-following fund (agent loop)")
    ap.add_argument("--mode", choices=["paper", "live"], default="paper")
    ap.add_argument("--system", type=int, default=2, choices=[1, 2])
    ap.add_argument("--top-k", type=int, default=6)
    ap.add_argument("--max-enabled", type=int, default=5)
    ap.add_argument("--rebalance-days", type=int, default=20)
    args = ap.parse_args()

    if args.mode == "live":
        print("LIVE mode requires a running MetaTrader 5 terminal (MetaTrader5 package, "
              "Windows-only), which is not available here. Use --mode paper to backtest the "
              "exact same agent loop on cached data. Wire the broker calls in fund.py's "
              "execution step to go live.")
        return

    cfg = FundConfig(
        system=args.system,
        entry_channel=55 if args.system == 2 else 20,
        exit_channel=20 if args.system == 2 else 10,
        sel_top_k=args.top_k,
        max_enabled=args.max_enabled,
        rebalance_days=args.rebalance_days,
    )
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    logdir = os.path.join(HERE, "runs", stamp)

    print(f"Claude manager: {'ENABLED' if claude_client.is_enabled() else 'DISABLED (deterministic fallback)'}")
    fund = TurtleFund(cfg, logdir=logdir)
    print(f"Universe: {', '.join(sorted(fund.dfs))}")

    summary, equity_curve, trades, decisions = fund.run()
    print("\n=== Fund summary (paper, daily) ===")
    print(json.dumps(summary, indent=2))

    if decisions:
        print("\nLast manager decision:")
        print(json.dumps(decisions[-1], indent=2))
    print(f"\nLogs written to: {logdir}")


if __name__ == "__main__":
    main()
