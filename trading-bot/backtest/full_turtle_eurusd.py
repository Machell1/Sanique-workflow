"""Full Turtle system on EURUSD (with pyramiding, N-sizing and ratcheting stops).

This implements the *complete* Turtle mechanics, not just the entry:
  * N = ATR(20). One Unit is sized so a 1N move = 1% of current equity
    (=> 2% equity risked per unit at the 2N stop). Sizing compounds with equity.
  * Entry: Donchian breakout. System 1 = 20-bar break with the "skip if the last
    breakout was a winner" filter; System 2 = 55-bar break, always taken.
  * Pyramiding: add a unit every +0.5N in favour, up to `max_units` (4). Each add
    ratchets the whole position's protective stop to 2N from the latest fill.
  * Exit: the trailing opposite Donchian channel (System 1 = 10-bar, System 2 =
    20-bar) OR the 2N stop, whichever price reaches first. All units exit together.

Equity is marked-to-market each bar so the drawdown is realistic. Costs are a
per-side spread in price (EURUSD pips). Pessimistic intrabar order: adverse
(stop/exit) checked before favourable (adds).

CAVEAT: this is ONE instrument over ~2-3 years. Turtle was designed for a broad,
diversified futures portfolio held for weeks-months over many years, so the daily
sample here is tiny (low statistical power). Read the trade counts before drawing
conclusions.
"""
from __future__ import annotations

import glob
import os
from dataclasses import dataclass

import numpy as np
import pandas as pd

from scalper_backtest import wilder_atr

HERE = os.path.dirname(os.path.abspath(__file__))


@dataclass
class Cfg:
    system: int = 1
    entry_channel: int = 20
    exit_channel: int = 10
    atr_period: int = 20
    stop_n: float = 2.0
    add_step_n: float = 0.5
    max_units: int = 4
    risk_per_unit: float = 0.01     # 1% of equity per 1N
    s1_filter: bool = True
    spread_price: float = 0.0001    # per-side cost in price (1 pip on EURUSD)


def load_tf(symbol: str, rule: str | None):
    f = os.path.join(HERE, "data", "60m", f"{symbol}.csv")
    df = pd.read_csv(f, parse_dates=["time"]).set_index("time")
    if rule:
        df = df.resample(rule).agg(
            open=("open", "first"), high=("high", "max"),
            low=("low", "min"), close=("close", "last"),
        ).dropna()
    return df.reset_index()


def simulate(df: pd.DataFrame, cfg: Cfg):
    o = df["open"].to_numpy(float)
    h = df["high"].to_numpy(float)
    l = df["low"].to_numpy(float)
    c = df["close"].to_numpy(float)
    atr = wilder_atr(h, l, c, cfg.atr_period)

    hs, ls = pd.Series(h), pd.Series(l)
    ent_hi = hs.shift(1).rolling(cfg.entry_channel).max().to_numpy()
    ent_lo = ls.shift(1).rolling(cfg.entry_channel).min().to_numpy()
    ex_lo = ls.shift(1).rolling(cfg.exit_channel).min().to_numpy()
    ex_hi = hs.shift(1).rolling(cfg.exit_channel).max().to_numpy()

    n = len(c)
    equity = 1.0
    peak = 1.0
    max_dd = 0.0
    eq_curve = []
    trades = []           # realized per-round-trip return (fraction of equity)

    pos = None            # dict
    last_winner = False
    start = cfg.entry_channel + cfg.atr_period + 2

    def mtm(price):
        if pos is None:
            return equity
        pnl = 0.0
        for (ep, _) in pos["units"]:
            pnl += cfg.risk_per_unit * (price - ep) / pos["N"] * pos["side"]
        return pos["eq_open"] * (1.0 + pnl)

    for i in range(start, n):
        a = atr[i]
        if not np.isfinite(a) or a <= 0:
            eq_curve.append(equity)
            continue

        if pos is None:
            long_b = np.isfinite(ent_hi[i]) and h[i] >= ent_hi[i]
            short_b = np.isfinite(ent_lo[i]) and l[i] <= ent_lo[i]
            if long_b or short_b:
                if cfg.system == 1 and cfg.s1_filter and last_winner:
                    last_winner = False
                else:
                    side = 1 if long_b else -1
                    lvl = ent_hi[i] if side > 0 else ent_lo[i]
                    fill = (max(o[i], lvl) if side > 0 else min(o[i], lvl)) + side * cfg.spread_price
                    pos = {
                        "side": side, "N": a, "eq_open": equity,
                        "units": [(fill, cfg.risk_per_unit)],
                        "last_fill": fill,
                        "stop": fill - side * cfg.stop_n * a,
                    }
            eq_curve.append(equity)
            continue

        side = pos["side"]
        # --- adverse first: protective stop / channel exit (pessimistic) ---
        if side > 0:
            eff = pos["stop"]
            if np.isfinite(ex_lo[i]):
                eff = max(eff, ex_lo[i])
            hit = l[i] <= eff
            exit_px = (o[i] if o[i] < eff else eff) - cfg.spread_price
        else:
            eff = pos["stop"]
            if np.isfinite(ex_hi[i]):
                eff = min(eff, ex_hi[i])
            hit = h[i] >= eff
            exit_px = (o[i] if o[i] > eff else eff) + cfg.spread_price

        if hit:
            pnl = 0.0
            for (ep, _) in pos["units"]:
                pnl += cfg.risk_per_unit * (exit_px - ep) / pos["N"] * side
            ret = pnl  # fraction of eq_open
            equity = pos["eq_open"] * (1.0 + ret)
            trades.append(ret)
            last_winner = ret > 0
            pos = None
            peak = max(peak, equity)
            max_dd = max(max_dd, (peak - equity) / peak)
            eq_curve.append(equity)
            continue

        # --- favourable: pyramid adds ---
        while len(pos["units"]) < cfg.max_units:
            next_level = pos["units"][0][0] + side * cfg.add_step_n * pos["N"] * len(pos["units"])
            reached = (h[i] >= next_level) if side > 0 else (l[i] <= next_level)
            if not reached:
                break
            fill = next_level + side * cfg.spread_price
            pos["units"].append((fill, cfg.risk_per_unit))
            pos["last_fill"] = fill
            pos["stop"] = fill - side * cfg.stop_n * pos["N"]

        e_now = mtm(c[i])
        peak = max(peak, e_now)
        max_dd = max(max_dd, (peak - e_now) / peak)
        eq_curve.append(e_now)

    # Close any open position at the last close.
    if pos is not None:
        side = pos["side"]
        exit_px = c[-1] - side * cfg.spread_price
        pnl = sum(cfg.risk_per_unit * (exit_px - ep) / pos["N"] * side for ep, _ in pos["units"])
        equity = pos["eq_open"] * (1.0 + pnl)
        trades.append(pnl)

    return equity, np.array(trades), max_dd, np.array(eq_curve)


def report(name, df, cfg, years):
    eq, trades, max_dd, _ = simulate(df, cfg)
    n = len(trades)
    if n == 0:
        print(f"  {name:22s} no trades")
        return
    total_ret = eq - 1.0
    cagr = eq ** (1.0 / years) - 1.0 if years > 0 and eq > 0 else float("nan")
    win = float((trades > 0).mean())
    pos = trades[trades > 0].sum()
    neg = -trades[trades < 0].sum()
    pf = pos / neg if neg > 0 else float("inf")
    avg = trades.mean()
    sd = trades.std(ddof=1) if n > 1 else 0.0
    t = avg / (sd / np.sqrt(n)) if sd > 0 else 0.0
    print(f"  {name:22s} trades={n:4d}  ret={total_ret*100:+7.1f}%  CAGR={cagr*100:+6.1f}%  "
          f"maxDD={max_dd*100:5.1f}%  win={win*100:4.1f}%  PF={pf:4.2f}  t={t:+.2f}")


def main():
    sym = "EURUSD"
    timeframes = [("daily", "1D"), ("H4", "4h"), ("60m", None)]
    # approximate span in years per timeframe (from the 60m file)
    base = load_tf(sym, None)
    years = (base["time"].iloc[-1] - base["time"].iloc[0]).days / 365.25
    print(f"EURUSD span ~{years:.2f} years\n")

    for tf_name, rule in timeframes:
        df = load_tf(sym, rule)
        print(f"==== {sym} {tf_name} ({len(df)} bars) ====")
        for spread in (0.00005, 0.0001):  # 0.5 pip and 1 pip per side
            print(f" spread={spread/0.0001:.1f} pip/side")
            report("System1 20/10 (filter)", df, Cfg(system=1, entry_channel=20, exit_channel=10,
                                                     s1_filter=True, spread_price=spread), years)
            report("System1 20/10 (no filt)", df, Cfg(system=1, entry_channel=20, exit_channel=10,
                                                      s1_filter=False, spread_price=spread), years)
            report("System2 55/20", df, Cfg(system=2, entry_channel=55, exit_channel=20,
                                            s1_filter=False, spread_price=spread), years)
        print()


if __name__ == "__main__":
    main()
