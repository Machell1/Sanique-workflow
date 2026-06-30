"""Data loading for the turtle fund (daily bars from the backtest data cache)."""
from __future__ import annotations

import glob
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_60M = os.path.join(HERE, "..", "backtest", "data", "60m")


def load_daily(symbols: list[str] | None = None) -> dict[str, pd.DataFrame]:
    """Return {symbol: daily OHLC DataFrame (time, open, high, low, close)}.

    Resampled from the cached 60m series produced by backtest/fetch_data.py.
    """
    out: dict[str, pd.DataFrame] = {}
    files = sorted(glob.glob(os.path.join(DATA_60M, "*.csv")))
    for f in files:
        sym = os.path.splitext(os.path.basename(f))[0]
        if symbols and sym not in symbols:
            continue
        df = pd.read_csv(f, parse_dates=["time"]).set_index("time")
        d = (
            df.resample("1D")
            .agg(open=("open", "first"), high=("high", "max"),
                 low=("low", "min"), close=("close", "last"))
            .dropna()
            .reset_index()
        )
        # Drop timezone so date comparisons are uniform across the fund.
        d["time"] = pd.to_datetime(d["time"]).dt.tz_localize(None)
        if len(d) > 120:
            out[sym] = d
    return out


def wilder_atr(high, low, close, period: int) -> np.ndarray:
    high = np.asarray(high, float)
    low = np.asarray(low, float)
    close = np.asarray(close, float)
    prev = np.empty_like(close)
    prev[0] = close[0]
    prev[1:] = close[:-1]
    tr = np.maximum(high - low, np.maximum(np.abs(high - prev), np.abs(low - prev)))
    atr = np.full_like(close, np.nan)
    if len(close) <= period:
        return atr
    atr[period] = tr[1 : period + 1].mean()
    a = 1.0 / period
    for i in range(period + 1, len(close)):
        atr[i] = atr[i - 1] + a * (tr[i] - atr[i - 1])
    return atr
