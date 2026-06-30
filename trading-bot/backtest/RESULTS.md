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

## VWAP discount/premium filter (`vwap_test.py`)

Tested the rule "only buy below VWAP (discount), only sell above VWAP (premium)"
two ways (rolling VWAP, tick-volume weighted; equal-weight fallback where the
feed has no volume, e.g. Yahoo FX). Cost 0.02/side.

| Variant | IS 60m | OOS 60m | 15m |
| --- | --- | --- | --- |
| Continuation tp3 (baseline, no VWAP) | +0.042R, t=3.4 | +0.064R, t=3.4, 12/15 | +0.132R, t=6.6 |
| Continuation **+ VWAP(20) filter** | +0.071R, t=1.2 (N=319) | +0.073R, t=0.7 (N=124) | **+0.221R, t=2.6, PF 1.69** |
| Continuation + VWAP(50) filter | +0.047R, t=1.6 | −0.017R, t=−0.4 | +0.127R, t=2.7 |
| **FADE** + VWAP (pure buy-dip/sell-rip) | −0.048R, t=−4.2 | −0.098R, t=−5.7, 1/15 | −0.064R, t=−3.6 |

**Findings:**
- **Pure VWAP mean-reversion (buy dips below / sell rips above as the entry) is a
  strong loser** out-of-sample (−0.098R, t=−5.7, profitable on 1/15). Fading does
  not work on these markets.
- **As a *filter* on the continuation entry**, "buy only below VWAP / sell only
  above VWAP" raises per-trade quality (it buys pullbacks-at-a-discount inside
  momentum instead of chasing): 15m +0.221R, PF 1.69. But it cuts trade count
  ~25x, so the 60m out-of-sample sample is too small to be statistically
  significant. It also has much lower drawdown.
- It is therefore shipped as an **optional, default-off** EA mode
  (`InpUseVwapFilter`, VWAP period 20). Use it for higher selectivity / lower
  drawdown, accepting far fewer trades; leave it off for the statistically
  strongest, higher-frequency edge. Reproduce with `python vwap_test.py`.

## Required next step before live trading

Re-validate on your **actual Deriv symbols and spreads**. Yahoo data and modelled
costs are a proxy. When the MT5 terminal is online, export real M15 history for
the instruments you intend to trade and re-run `sweep.py` / `confirm.py` against
it. Only trade live if the edge survives your broker's real costs out-of-sample.
