# Deriv MT5 momentum scalper

A multi-symbol momentum-breakout scalper for MetaTrader 5 / Deriv.

| File | What it is |
| --- | --- |
| [`mql5/DerivScalperEA.mq5`](mql5/DerivScalperEA.mq5) | The Expert Advisor (compile in MetaEditor, run in MT5). |
| [`DerivScalperEA.md`](DerivScalperEA.md) | Single-file Markdown copy of the EA + setup notes. |
| [`backtest/`](backtest/) | Reproducible Python backtest harness + the research log (`RESULTS.md`). |

---

## Does it have an edge? (honest answer)

I tested this on **real market data** (15 non-synthetic instruments across FX,
metals, indices and crypto; Yahoo OHLC) with a strict anti-overfit protocol:
configs are selected on an in-sample slice and confirmed on an untouched
out-of-sample slice **and** an independent timeframe, in instrument-agnostic
R-multiples, with costs always swept. Full details and numbers are in
[`backtest/RESULTS.md`](backtest/RESULTS.md).

**What I found:**

- The original tight-scalp config (1 ATR stop, **1.5 ATR** target) has **no
  edge** — in-sample expectancy was statistically zero and went negative once
  costs reached 0.03 ATR/side. A high win rate there still loses money.
- **Letting winners run (take-profit 3.0 ATR instead of 1.5) produces a real,
  out-of-sample, continuation edge:** OOS +0.064R/trade (t≈3.4, profitable on
  12/15 instruments) and +0.13R/trade (t≈6.6) on the independent 15m set. The
  `fade` (reversion) variant collapsed out-of-sample, confirming continuation is
  the right direction. **The EA default was changed to `InpTakeProfitAtrMult = 3.0`.**
- The edge is **small (~0.03–0.06R/trade net) and cost-fragile** — it vanishes
  around 0.05 ATR/side. On a high-spread instrument or account it will not
  survive.

**So:** there is a measurable edge, but it is thin and depends on low costs and
on holding for the bigger move. This is not a guaranteed-profit machine, and an
80% win rate is not realistic — expectancy, not win rate, is what makes money.
**Re-validate on your real Deriv symbols/spreads before trading live** (see the
last section of `RESULTS.md`).

---

## The strategy

1. **Scan the universe.** Every bar the EA loops over all symbols in your Market
   Watch (or a whitelist). **Synthetic indices are excluded** by name
   (Volatility, Crash, Boom, Step, Jump, Range Break, Vol over, Hybrid, 1HZ, …).
2. **Find a fast mover.** It measures the move over the last `InpMomentumBars`
   bars in **ATR units**; a move ≥ `InpMomentumAtrMult` ATR with an agreeing
   candle qualifies.
3. **Place a pending STOP in front of price** — falling → **Sell Stop** below
   the bid; rising → **Buy Stop** above the ask, as close as the broker allows.
   It is trailed to stay glued to price and auto-cancels after
   `InpPendingExpiryBars`.
4. **Never let green turn red.** At `InpLockTriggerAtr` ATR of profit the stop
   jumps to break-even + a small lock buffer, then trails by `InpTrailAtrMult`.
5. **Cut losses fast** with a tight `InpStopAtrMult` ATR initial stop, and let
   the winners reach the `InpTakeProfitAtrMult` ATR target (the part that creates
   the edge). Stagnant trades are force-closed after `InpMaxHoldingBars`.
6. **Portfolio guard rails** — max concurrent, max trades/day, daily-loss halt,
   drawdown halt, consecutive-loss breaker, spread filter.

---

## Setting it up on Deriv

1. **Use a no-synthetics account** — a Deriv **MT5 Financial** (or **Financial
   STP**) login holds only forex, metals, indices, crypto and stocks. The EA's
   name blocklist is a second safety net.
2. **Add the symbols you want scanned** to Market Watch (Ctrl+M). The EA only
   scans what is there.
3. **Install:** File → Open Data Folder → `MQL5/Experts`, copy
   `DerivScalperEA.mq5`, open MetaEditor (F4), Compile (F7).
4. **Attach to any one chart** (it scans all symbols regardless). Tick **Allow
   Algo Trading** and enable the global Algo Trading button.
5. **Backtest first.** The Strategy Tester runs one symbol at a time, so test
   your main pairs individually; the multi-symbol scan is a live/forward-test
   feature. The included Python harness backtests a whole basket at once.
6. **Demo forward-test**, then go live with the **smallest** risk you can stomach.

### Key inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `InpScanMarketWatch` | true | Scan every Market Watch symbol |
| `InpSymbolWhitelist` | "" | Comma list to scan instead (e.g. `EURUSD,GBPUSD,XAUUSD`) |
| `InpSyntheticBlock` | Volatility,Crash,Boom,… | Name keywords to skip (synthetics) |
| `InpMomentumBars` / `InpMomentumAtrMult` | 6 / 2.0 | How big/fast a move must be |
| `InpTradeBothSides` | true | false = only short falling assets |
| `InpEntryOffsetAtr` | 0.05 | How far in front of price the pending sits |
| `InpPendingExpiryBars` | 2 | Cancel an untriggered pending after N bars |
| `InpStopAtrMult` | 1.0 | Initial (tight) stop distance |
| `InpTakeProfitAtrMult` | **3.0** | Target distance — 3.0 lets winners run (backtest-validated) |
| `InpLockTriggerAtr` | 0.25 | Profit (ATR) at which the stop locks to break-even |
| `InpTrailAtrMult` | 0.5 | Trailing distance after lock |
| `InpMaxHoldingBars` | 8 | Force-close a stagnant trade |
| `InpRiskPercent` | 0.5 | Risk per trade (% of balance) |
| `InpMaxConcurrent` / `InpMaxTradesPerDay` | 3 / 20 | Portfolio caps |
| `InpDailyLossLimitPct` / `InpMaxDrawdownPct` | 3 / 15 | Hard halts |
| `InpMaxSpreadPoints` | 200 | Skip symbols when spread is too wide |

> **Lower-drawdown alternative:** a 2 ATR stop with the 3 ATR target
> (`InpStopAtrMult = 2.0`) traded a little expectancy for the steadiest curve in
> testing (profitable on 13/15 instruments, far lower drawdown). Consider it if
> you prefer smoothness over the tight-stop version.

---

## Reproducing the backtest

```bash
cd backtest
pip install -r requirements.txt
python fetch_data.py     # pull real OHLC from Yahoo into backtest/data/
python sweep.py          # in-sample ranking + out-of-sample/holdout checks
python confirm.py        # before/after of the shipped vs validated config
```

See [`backtest/RESULTS.md`](backtest/RESULTS.md) for the methodology, the full
numbers, and the caveats (Yahoo data quality, modelled costs, no intrabar path).

## Research: agentic Turtle fund

[`turtle_fund/`](turtle_fund/) is a multi-agent (Selection → Manager → Risk →
Execution) trend-following "fund" loop, with an optional Claude manager. Its
README documents an important, honest finding: aggressively *selecting* the best
few symbols underperforms trading a diversified basket, and de-risking during
drawdowns guts trend-following. It is a research sandbox (paper mode, large
drawdowns, regime-dependent), not a profitable system.

## Broker symbol names

Deriv names forex normally (`EURUSD`, `GBPUSD`, `XAUUSD`). If your broker uses
suffixes (`EURUSD.`, `EURUSDm`), the EA still works because it scans whatever is
in Market Watch — just keep the synthetic blocklist accurate for your account.
