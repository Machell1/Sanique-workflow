"""Fetch real OHLC bars from the Yahoo Finance chart API.

No API key required. Saves one CSV per symbol/timeframe under data/<tf>/<sym>.csv.
This is real market data (Yahoo's indicative feed for FX); intraday history is
limited by Yahoo (15m ~ 60 days, 60m ~ 730 days). We deliberately use several
real instruments and two timeframes so an "edge" must survive out-of-sample and
cross-instrument checks rather than curve-fitting one series.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
import urllib.error
import urllib.parse

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

# Yahoo tickers grouped by asset class (diversified, non-synthetic).
SYMBOLS = {
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "USDJPY=X",
    "AUDUSD": "AUDUSD=X",
    "USDCAD": "USDCAD=X",
    "USDCHF": "USDCHF=X",
    "NZDUSD": "NZDUSD=X",
    "XAUUSD": "GC=F",     # gold futures
    "XAGUSD": "SI=F",     # silver futures
    "SPX": "^GSPC",
    "NDX": "^NDX",
    "DJI": "^DJI",
    "RUT": "^RUT",
    "BTCUSD": "BTC-USD",
    "ETHUSD": "ETH-USD",
}


def fetch(yahoo_symbol: str, interval: str, rng: str) -> pd.DataFrame | None:
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{urllib.parse.quote(yahoo_symbol)}?interval={interval}&range={rng}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"  ! {yahoo_symbol}: {exc}")
        return None

    result = payload.get("chart", {}).get("result")
    if not result:
        print(f"  ! {yahoo_symbol}: empty result")
        return None
    r = result[0]
    ts = r.get("timestamp")
    quote = r.get("indicators", {}).get("quote", [{}])[0]
    if not ts or "close" not in quote:
        print(f"  ! {yahoo_symbol}: no quote data")
        return None

    df = pd.DataFrame(
        {
            "time": pd.to_datetime(ts, unit="s", utc=True),
            "open": quote.get("open"),
            "high": quote.get("high"),
            "low": quote.get("low"),
            "close": quote.get("close"),
            "volume": quote.get("volume"),
        }
    )
    df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)
    return df


def main() -> None:
    jobs = [("15m", "60d"), ("60m", "730d")]
    for interval, rng in jobs:
        out_dir = os.path.join(DATA, interval)
        os.makedirs(out_dir, exist_ok=True)
        print(f"== {interval} / {rng} ==")
        for name, ysym in SYMBOLS.items():
            df = fetch(ysym, interval, rng)
            if df is None or len(df) < 100:
                print(f"  {name:8s} skipped ({0 if df is None else len(df)} rows)")
                continue
            path = os.path.join(out_dir, f"{name}.csv")
            df.to_csv(path, index=False)
            print(f"  {name:8s} {len(df):6d} rows  {df['time'].iloc[0]} -> {df['time'].iloc[-1]}")
            time.sleep(0.4)  # be polite to the endpoint


if __name__ == "__main__":
    main()
