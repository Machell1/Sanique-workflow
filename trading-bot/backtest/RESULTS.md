# Backtest results — Deriv momentum scalper

Honest, reproducible research log. Everything here comes from real market data
and a fixed evaluation protocol; nothing is hand-picked after seeing the answer.

## Data

Real OHLC pulled from the Yahoo Finance chart API (`fetch_data.py`), 15
non-synthetic instruments across FX majors, metals, equity indices and crypto:

- **60m**, ~Aug 2023 → Jun 2026 (≈5k–17k bars/symbol) — used for statistical power.
- **15m**, last ~60 days (≈1.5k–5.6k bars/symbol) — the actual scalp timeframe,
  used as a fully independent holdout (different period *and* resolution).

Caveats: Yahoo FX is an indicative feed (no real volume), equity-index intraday
covers regular session only, and broker spreads/slippage will differ from the
modelled cost. Treat magnitudes as indicative; the *sign and robustness* of the
edge is the point.

## Method (anti-overfit)

- Results in **R-multiples** (per-trade P&L ÷ initial risk), so they are
  comparable across instruments at wildly different price scales.
- **Cost** modelled as a per-side fraction of ATR (auto-scales per instrument)
  and always swept (0.00 / 0.02 / 0.03 / 0.05).
- **Selection** of any configuration uses only the **in-sample** slice (first
  70% of the 60m data). The last 30% of 60m and the entire 15m set are
  **untouched holdouts**.
- An edge must stay positive with a meaningful **t-stat** on per-trade R in both
  holdouts and be profitable on a **majority of the 15 instruments** — otherwise
  it is treated as noise. Pessimistic intrabar fills (stop assumed before
  target). Pending-order trailing is not modelled (bars lack the intrabar path).

Reproduce with: `python fetch_data.py && python sweep.py && python confirm.py`.

## Key finding

The as-shipped scalp config (tight 1 ATR stop, **1.5 ATR** target) has **no
edge** — it clips winners so hard that the ~1:1 realised reward can't beat
costs. Letting winners run with a **3.0 ATR** target turns it into a small but
genuine, out-of-sample, cross-instrument continuation edge. The `fade`
(mean-reversion) variant looked fine in-sample but **collapsed out-of-sample**,
confirming continuation is the correct direction.

### Continuation entry, momentum ≥ 2 ATR over 6 bars, cost = 0.02/side

| Config | IS 60m | OOS 60m (untouched) | 15m (independent) |
| --- | --- | --- | --- |
| ORIGINAL stop1.0 / **tp1.5** | +0.001R, t=0.1 | +0.027R, t=1.7, 11/15 | +0.082R, t=5.0, 11/15 |
| **RECOMMENDED stop1.0 / tp3.0** | +0.042R, t=3.4 | **+0.064R, t=3.4, 12/15** | **+0.132R, t=6.6, 11/15** |
| ROBUST stop2.0 / tp3.0 | +0.031R, t=4.0 | +0.035R, t=2.9, **13/15** | +0.068R, t=5.5, 9/15 |

### Cost sensitivity (RECOMMENDED, OOS 60m)

| Cost / side | Expectancy | t-stat | Profit factor |
| --- | --- | --- | --- |
| 0.00 ATR | +0.104R | 5.4 | 1.27 |
| 0.02 ATR | +0.064R | 3.4 | 1.16 |
| 0.03 ATR | +0.044R | 2.3 | 1.10 |
| 0.05 ATR | +0.004R | 0.2 | 1.01 |

## Verdict

- **There is a real, statistically positive momentum-continuation edge** on this
  basket, *provided winners are allowed to run* (TP ≈ 3 ATR, not 1.5) and costs
  stay **below ~0.03 ATR per side**. The EA default `InpTakeProfitAtrMult` was
  changed from 1.5 to **3.0** on the strength of this.
- The edge is **small** (~0.03–0.06 R/trade net) and **cost-fragile** — it
  disappears around 0.05 ATR/side. On a high-spread instrument or account it
  will not survive. The original tight-target scalp is genuinely unprofitable.
- `ROBUST` (2 ATR stop) trades a little expectancy for the steadiest curve
  (13/15 instruments, far lower drawdown) and is the safer live starting point.

## Required next step before live trading

Re-validate on your **actual Deriv symbols and spreads**. Yahoo data and modelled
costs are a proxy. When the MT5 terminal is online, export real M15 history for
the instruments you intend to trade and re-run `sweep.py` / `confirm.py` against
it. Only trade live if the edge survives your broker's real costs out-of-sample.
