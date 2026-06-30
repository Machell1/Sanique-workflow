"""Faithful, reproducible backtest harness for the Deriv scalper logic.

Design goals (anti-overfitting, anti-fake-results):
  * Real data only (see fetch_data.py). Results are reported in R-multiples so
    they are instrument-agnostic and comparable across price scales.
  * Costs are modelled as a fraction of ATR per side (auto-scales per
    instrument) and always swept, never hidden.
  * Every configuration is judged on an OUT-OF-SAMPLE slice and on
    cross-instrument consistency, not on a single cherry-picked curve.
  * Statistics include a t-stat on per-trade R, so "edge" must be
    statistically distinguishable from zero, not just positive.

Simulation is bar-level (OHLC). Where intrabar order is ambiguous we take the
pessimistic branch (stop assumed hit before target). Pending-order trailing is
NOT modelled (M15/H1 bars lack the intrabar path); per the entry-edge question
that affects fill timing, not the sign of the per-trade expectancy.
"""
from __future__ import annotations

import argparse
import glob
import os
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")


# ---------------------------------------------------------------------------
# Parameters
# ---------------------------------------------------------------------------


@dataclass
class Params:
    momentum_bars: int = 6
    momentum_atr: float = 2.0
    atr_period: int = 14
    direction: str = "cont"      # 'cont' (continuation) or 'fade' (reversion)
    entry_style: str = "stop"    # 'stop', 'market', 'limit'
    entry_offset_atr: float = 0.05
    pending_expiry_bars: int = 2
    stop_atr: float = 1.0
    tp_atr: float = 1.5          # 0 => no fixed TP (trail/time only)
    lock_trigger_atr: float = 0.25
    trail_atr: float = 0.5
    max_hold_bars: int = 8
    cost_atr_frac: float = 0.0   # per-side cost as a fraction of ATR
    # Optional filters
    trend_ema: int = 0           # >0 => only trade with the EMA(trend_ema) slope
    long_only: bool = False
    short_only: bool = False
    vwap_window: int = 0         # >0 => only buy below VWAP (discount), sell above (premium)


# ---------------------------------------------------------------------------
# Indicators
# ---------------------------------------------------------------------------


def wilder_atr(high, low, close, period):
    prev_close = np.empty_like(close)
    prev_close[0] = close[0]
    prev_close[1:] = close[:-1]
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev_close), np.abs(low - prev_close)))
    atr = np.full_like(close, np.nan)
    if len(close) <= period:
        return atr
    atr[period] = tr[1 : period + 1].mean()
    alpha = 1.0 / period
    for i in range(period + 1, len(close)):
        atr[i] = atr[i - 1] + alpha * (tr[i] - atr[i - 1])
    return atr


def rolling_vwap(high, low, close, volume, window):
    """Rolling volume-weighted average price over `window` bars.

    Uses real volume where available; for feeds without volume (e.g. Yahoo FX)
    it falls back to equal weights, i.e. a rolling typical-price average — the
    same discount/premium notion an MT5 tick-volume VWAP approximates.
    Causal: bar i uses bars [i-window+1 .. i].
    """
    tp = (np.asarray(high, float) + np.asarray(low, float) + np.asarray(close, float)) / 3.0
    vol = np.asarray(volume, float)
    if not np.isfinite(vol).any() or np.nansum(vol) <= 0:
        vol = np.ones_like(tp)
    vol = np.where(np.isfinite(vol) & (vol > 0), vol, 0.0)
    pv = pd.Series(tp * vol).rolling(window, min_periods=max(2, window // 2)).sum().to_numpy()
    vv = pd.Series(vol).rolling(window, min_periods=max(2, window // 2)).sum().to_numpy()
    out = np.full_like(tp, np.nan)
    nz = vv > 0
    out[nz] = pv[nz] / vv[nz]
    return out


def ema(values, period):
    out = np.full_like(values, np.nan)
    if period <= 0 or len(values) == 0:
        return out
    k = 2.0 / (period + 1.0)
    out[0] = values[0]
    for i in range(1, len(values)):
        out[i] = values[i] * k + out[i - 1] * (1 - k)
    return out


# ---------------------------------------------------------------------------
# Core single-symbol simulation
# ---------------------------------------------------------------------------


def simulate_symbol(df: pd.DataFrame, p: Params, lo: int, hi: int):
    """Return a list of per-trade R-multiples for bars in [lo, hi)."""
    o = df["open"].to_numpy(float)
    h = df["high"].to_numpy(float)
    l = df["low"].to_numpy(float)
    c = df["close"].to_numpy(float)
    atr = wilder_atr(h, l, c, p.atr_period)
    trend = ema(c, p.trend_ema) if p.trend_ema > 0 else None
    vwap = (rolling_vwap(h, l, c, df["volume"].to_numpy(float)
                         if "volume" in df else np.ones(len(c)), p.vwap_window)
            if p.vwap_window > 0 else None)

    n = len(c)
    mb = p.momentum_bars
    results = []
    start = max(lo, mb + p.atr_period + 1)
    end = min(hi, n - 1)

    i = start
    while i < end:
        a = atr[i]
        if not np.isfinite(a) or a <= 0:
            i += 1
            continue

        move = c[i - (mb - 1)] - c[i]      # positive => price fell over the window
        move_atr = move / a
        bear_candle = c[i] < o[i]
        bull_candle = c[i] > o[i]

        falling = (move_atr >= p.momentum_atr) and bear_candle
        rising = (-move_atr >= p.momentum_atr) and bull_candle
        if not (falling or rising):
            i += 1
            continue

        # Map the detected move to a trade side.
        if p.direction == "cont":
            go_long = rising
            go_short = falling
        else:  # fade
            go_long = falling
            go_short = rising

        if p.long_only:
            go_short = False
        if p.short_only:
            go_long = False

        # VWAP filter: buy only at a discount (below VWAP), sell only at a premium.
        if vwap is not None:
            v = vwap[i]
            if np.isfinite(v):
                if go_long and c[i] > v:
                    go_long = False
                if go_short and c[i] < v:
                    go_short = False

        if not (go_long or go_short):
            i += 1
            continue

        # Trend filter (slope of trend EMA over the lookback window).
        if trend is not None and np.isfinite(trend[i]) and np.isfinite(trend[i - mb]):
            up = trend[i] > trend[i - mb]
            if go_long and not up:
                i += 1
                continue
            if go_short and up:
                i += 1
                continue

        side = 1 if go_long else -1
        offset = p.entry_offset_atr * a
        ref = c[i]  # proxy for bid/ask at decision time

        # Entry price per style.
        if p.entry_style == "market":
            entry = o[i + 1] if i + 1 < n else c[i]
            entry_bar = i + 1
            filled = entry_bar < n
        else:
            if p.entry_style == "stop":
                entry = ref + offset if side > 0 else ref - offset
            else:  # limit
                entry = ref - offset if side > 0 else ref + offset
            # Scan forward for a fill within the expiry window.
            filled = False
            entry_bar = -1
            for j in range(i + 1, min(i + 1 + p.pending_expiry_bars, n)):
                if p.entry_style == "stop":
                    hit = (h[j] >= entry) if side > 0 else (l[j] <= entry)
                else:  # limit
                    hit = (l[j] <= entry) if side > 0 else (h[j] >= entry)
                if hit:
                    filled = True
                    entry_bar = j
                    break
            if not filled:
                i += 1
                continue

        risk = p.stop_atr * a
        if side > 0:
            sl = entry - risk
            tp = entry + p.tp_atr * a if p.tp_atr > 0 else None
        else:
            sl = entry + risk
            tp = entry - p.tp_atr * a if p.tp_atr > 0 else None

        lock_trigger = p.lock_trigger_atr * a
        trail_dist = p.trail_atr * a
        cost = p.cost_atr_frac * a

        exit_price = None
        exit_bar = entry_bar
        for k in range(entry_bar, min(entry_bar + p.max_hold_bars, n)):
            # Check protective stop / target using the SL valid at bar start.
            if side > 0:
                if l[k] <= sl:                      # pessimistic: stop first
                    exit_price = sl
                    exit_bar = k
                    break
                if tp is not None and h[k] >= tp:
                    exit_price = tp
                    exit_bar = k
                    break
            else:
                if h[k] >= sl:
                    exit_price = sl
                    exit_bar = k
                    break
                if tp is not None and l[k] <= tp:
                    exit_price = tp
                    exit_bar = k
                    break

            # End-of-bar management: lock to break-even then trail (one-way).
            price = c[k]
            if side > 0:
                profit = price - entry
                if profit >= lock_trigger:
                    sl = max(sl, entry)
                    sl = max(sl, price - trail_dist)
            else:
                profit = entry - price
                if profit >= lock_trigger:
                    sl = min(sl, entry)
                    sl = min(sl, price + trail_dist)

        if exit_price is None:  # time exit
            exit_bar = min(entry_bar + p.max_hold_bars - 1, n - 1)
            exit_price = c[exit_bar]

        gross = (exit_price - entry) * side
        net = gross - 2 * cost
        r = net / risk
        results.append(r)

        i = max(exit_bar + 1, i + 1)  # one trade per symbol at a time

    return results


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


@dataclass
class Stats:
    n: int = 0
    win_rate: float = 0.0
    expectancy: float = 0.0
    tstat: float = 0.0
    profit_factor: float = 0.0
    total_r: float = 0.0
    max_dd_r: float = 0.0


def compute_stats(rs) -> Stats:
    arr = np.asarray(rs, float)
    s = Stats(n=len(arr))
    if s.n == 0:
        return s
    s.win_rate = float((arr > 0).mean())
    s.expectancy = float(arr.mean())
    sd = float(arr.std(ddof=1)) if s.n > 1 else 0.0
    s.tstat = float(s.expectancy / (sd / np.sqrt(s.n))) if sd > 0 else 0.0
    pos = arr[arr > 0].sum()
    neg = -arr[arr < 0].sum()
    s.profit_factor = float(pos / neg) if neg > 0 else float("inf")
    eq = np.cumsum(arr)
    s.total_r = float(eq[-1])
    peak = np.maximum.accumulate(eq)
    s.max_dd_r = float((peak - eq).max())
    return s


# ---------------------------------------------------------------------------
# Dataset loading + run
# ---------------------------------------------------------------------------


def load_dataset(tf: str):
    files = sorted(glob.glob(os.path.join(DATA, tf, "*.csv")))
    data = {}
    for f in files:
        sym = os.path.splitext(os.path.basename(f))[0]
        df = pd.read_csv(f)
        if len(df) > 100:
            data[sym] = df
    return data


def run(data: dict, p: Params, split: str = "all"):
    """split: 'all', 'is' (first 70%), 'oos' (last 30%)."""
    per_symbol = {}
    pooled = []
    for sym, df in data.items():
        n = len(df)
        if split == "is":
            lo, hi = 0, int(n * 0.7)
        elif split == "oos":
            lo, hi = int(n * 0.7), n
        else:
            lo, hi = 0, n
        rs = simulate_symbol(df, p, lo, hi)
        per_symbol[sym] = compute_stats(rs)
        pooled.extend(rs)
    return compute_stats(pooled), per_symbol


def fmt(s: Stats) -> str:
    return (f"N={s.n:5d}  win={s.win_rate*100:5.1f}%  exp={s.expectancy:+.4f}R  "
            f"t={s.tstat:+.2f}  PF={s.profit_factor:4.2f}  totR={s.total_r:+8.1f}  "
            f"maxDD={s.max_dd_r:6.1f}R")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tf", default="60m")
    ap.add_argument("--cost", type=float, default=0.0)
    args = ap.parse_args()
    data = load_dataset(args.tf)
    print(f"Loaded {len(data)} symbols on {args.tf}: {', '.join(data)}")
    p = Params(cost_atr_frac=args.cost)
    pooled, per = run(data, p, "all")
    print("Baseline (cont/stop):", fmt(pooled))
