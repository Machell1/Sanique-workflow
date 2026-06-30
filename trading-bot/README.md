# XAUUSD Trend Expert Advisor for MetaTrader 5

A reworked, bug-fixed gold (XAUUSD) trading strategy delivered in two forms:

| File | What it is | Where it runs |
| --- | --- | --- |
| [`mql5/XauusdTrendEA.mq5`](mql5/XauusdTrendEA.mq5) | A native **MT5 Expert Advisor** | Inside the MT5 terminal (chart + Strategy Tester + VPS) |
| [`python/xauusd_bot.py`](python/xauusd_bot.py) | An external Python bot using the `MetaTrader5` API | A Python process next to a running MT5 terminal |

Both implement the **same strategy and risk rules**, so a Strategy-Tester
backtest of the EA is representative of the live behaviour of either one.

> ### Honest disclaimer — read this first
> **No trading bot can be guaranteed to be profitable.** Markets change, spreads
> and slippage eat edge, and past performance does not predict future results.
> What this rework does is replace the original prototype's incoherent,
> bug-ridden signal logic with a *coherent, testable* trend-following strategy
> and *strict, working* risk controls. Whether it is profitable on your broker,
> in the current regime, depends entirely on your own backtesting and forward
> testing. **Test on a demo account first. Trade live at your own risk.**

---

## Why the original prototype was broken

The original `improved_trading_bot.py` looked sophisticated but had fundamental
flaws that made it effectively random:

1. **It traded signals from arbitrary historical bars.** Pattern detectors
   scanned all 200 bars and the loop placed trades for *any* matching bar,
   not just the most recent closed one — so it could enter on a "signal" from
   hours ago.
2. **It used a stale historical close as the entry price**, then sent a market
   order at the live price, so SL/TP geometry rarely matched the intended risk.
3. **The "order block / FVG / engulfing / liquidity sweep" detectors were
   numerically meaningless** (e.g. `low[i+1] > high[i-1] * 0.97` matches almost
   everything; "order blocks" depended on `real_volume`, which is `0` on most
   gold CFD feeds).
4. **The indicators it computed (EMA/RSI/MACD) were never used** to make a
   decision — there was no trend or momentum filter on entries.
5. **It re-evaluated every 5 minutes** with no "new bar" gate, risking repeated
   entries on the same setup.
6. **Filling mode was hard-coded to FOK**, which many brokers reject.

## What the rework does instead

A single, transparent rule set that actually uses the indicators:

- **Trend filter:** only go long when `EMA(fast) > EMA(slow)` *and* price is
  above `EMA(trend=200)`; mirror for shorts.
- **Momentum filter:** RSI on the correct side of 50 and turning the right way,
  plus MACD main/signal agreement.
- **Pullback entry:** price must have pulled back near the fast EMA (within
  `PullbackAtr × ATR`) and then closed back through it with a candle in the
  trade's direction. This avoids chasing extended moves.
- **Decisions are made only on the last *closed* bar, once per new bar.**
- **ATR-based SL/TP**, **fixed-fractional position sizing**, **break-even at
  +1R**, **ATR trailing stop**, and a **time-based exit** for stale trades.

### Capital-protection layer

- Risk a fixed fraction of balance per trade (default **0.5%**).
- **Daily loss limit** (default 3% of day-start balance) → stop for the day.
- **Max drawdown** halt (default 15% from peak equity).
- **Max trades per day** (default 4) and a **consecutive-loss circuit breaker**
  (default 3).
- **Spread filter** and an optional **trading-session filter**.
- One open position at a time; orders tagged by **magic number** so the EA only
  manages its own trades.

---

## Installing the Expert Advisor (recommended)

1. In MetaTrader 5: **File → Open Data Folder → `MQL5/Experts`**.
2. Copy `XauusdTrendEA.mq5` into that folder.
3. Open **MetaEditor** (F4), select the file, and press **Compile** (F7).
   It should compile with 0 errors.
4. Back in the terminal, open a **XAUUSD M15** chart and drag
   **Navigator → Expert Advisors → XauusdTrendEA** onto it.
5. On the **Common** tab, tick **Allow Algo Trading**. Make sure the global
   **Algo Trading** button in the toolbar is enabled (green).
6. Set inputs (see below), press **OK**.

### Backtest before going live

Open **View → Strategy Tester**, choose `XauusdTrendEA`, symbol `XAUUSD`,
timeframe `M15`, model **"Every tick based on real ticks"**, pick a date range
of at least 1–2 years, and run. Optimise inputs on one period and validate on a
separate **out-of-sample** period before trusting the numbers.

### Going live on XAUUSD

After a satisfactory backtest **and** a demo-account forward test:

- Attach the EA to a live XAUUSD M15 chart with **Algo Trading** enabled.
- Keep the terminal (or a VPS) running 24/5.
- Start with the **smallest risk** you are comfortable losing.

### Key EA inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `InpRiskPercent` | 0.5 | % of balance risked per trade |
| `InpStopAtrMult` / `InpTakeProfitAtrMult` | 1.8 / 3.0 | SL / TP distance in ATRs |
| `InpDailyLossLimitPct` | 3.0 | Halt for the day after this daily loss |
| `InpMaxDrawdownPct` | 15.0 | Halt if equity falls this far from peak |
| `InpMaxTradesPerDay` | 4 | Cap on new entries per day |
| `InpMaxConsecLosses` | 3 | Pause after this many losses in a row |
| `InpMaxSpreadPoints` | 600 | Skip entries when spread is too wide |
| `InpMagicNumber` | 234000 | Tag for this EA's orders |

---

## Running the Python bot (alternative)

Use this only if you specifically want an external Python process. The EA is
the better fit for "run on MT5" and for backtesting.

```bash
cd trading-bot/python
pip install -r requirements.txt   # MetaTrader5 is Windows-only
python xauusd_bot.py
```

Configuration is via environment variables (see the `Config` dataclass in the
source). To auto-connect, set credentials before launching:

```bash
set MT5_LOGIN=12345678
set MT5_PASSWORD=your_password
set MT5_SERVER=YourBroker-Server
set MT5_SYMBOL=XAUUSD
set RISK_PERCENT=0.5
python xauusd_bot.py
```

If `MT5_LOGIN`/`MT5_PASSWORD`/`MT5_SERVER` are not set, the bot attaches to the
terminal session you are already logged into.

> The `MetaTrader5` Python package only runs on Windows alongside an installed
> MT5 terminal. The bot's strategy/indicator logic is pure pandas/numpy, so it
> is portable, but live trading requires the Windows terminal.

---

## Notes on broker symbol names

Some brokers name gold `GOLD`, `XAUUSD.`, `XAUUSDm`, etc. Set `MT5_SYMBOL`
(Python) or attach the EA to the correct chart so the symbol matches your
broker's Market Watch exactly.
