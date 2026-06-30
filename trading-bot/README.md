# Deriv MT5 trading bots

Two MetaTrader 5 Expert Advisors plus a Python reference implementation.

| File | What it is | Use it for |
| --- | --- | --- |
| [`mql5/DerivScalperEA.mq5`](mql5/DerivScalperEA.mq5) | **Multi-symbol momentum scalper** | The strategy you asked for: scan every (non-synthetic) symbol on M15, jump on fast movers with pending stop orders, lock profit instantly, cut losses fast. **Primary deliverable.** |
| [`mql5/XauusdTrendEA.mq5`](mql5/XauusdTrendEA.mq5) | Single-symbol XAUUSD trend EA | A calmer, lower-frequency trend strategy for gold only. |
| [`python/xauusd_bot.py`](python/xauusd_bot.py) | Python `MetaTrader5` bot | A reference/learning version of the gold trend logic. |

---

## Read this before anything else — about the "80% win rate"

You asked for a strategy that locks in green the moment it appears, cuts losers
just as fast, and reaches an **80% win rate**. Here is the honest engineering
reality:

- **A high win rate is easy to manufacture; a profitable bot is not.** If you
  take a tiny profit and run a wider stop, you will win most trades — but the
  occasional full-stop loss can erase many small wins. Win rate alone tells you
  nothing about whether you make money.
- **What actually matters is expectancy:** `win% × avg_win − loss% × avg_loss`.
  An 80% win rate with an average loss 5× the average win is a *losing* system.
- **No EA can guarantee 80% wins, including this one.** Markets, spread,
  slippage and gaps all work against very tight scalps, and Deriv (like every
  broker) earns the spread on every fill.

This EA is built to give your style the best honest shot:
- It enters **with** momentum (in front of fast movers) instead of fading it.
- It ratchets the stop to **break-even+lock the instant the trade is green**, so
  a winner is very hard to turn into a loser.
- It uses a **tight initial stop** so losers are cut fast.
- It keeps **average win ≈ average risk** (default trail/lock), so the math can
  actually work at a realistic 55–70% hit rate — and if you reach higher in the
  backtest, great.

**You must validate the real win rate and expectancy yourself in the Strategy
Tester and on a Deriv demo account before risking money.** If the backtest does
not show a positive, stable equity curve with acceptable drawdown, do not trade
it live. Tune the inputs to your account and the symbols you actually trade.

---

## The scalper strategy (`DerivScalperEA`)

Exactly the workflow you described, automated across many symbols:

1. **Scan the universe.** Every M15 bar the EA loops over all symbols in your
   Market Watch (or a whitelist you provide). **Synthetic indices are excluded**
   by name (Volatility, Crash, Boom, Step, Jump, Range Break, Vol over, Hybrid,
   1HZ, …) so it never trades them.
2. **Find a fast mover.** It measures the move over the last `InpMomentumBars`
   bars in **ATR units**. If price fell (or, optionally, rose) by at least
   `InpMomentumAtrMult` ATRs and the last candle agrees, the symbol qualifies.
3. **Place a pending STOP "in front" of price.** Falling fast → a **Sell Stop**
   just below the bid; rising fast → a **Buy Stop** just above the ask. The
   offset is as small as the broker's minimum-stop rule allows ("as close as
   possible"). While the order waits, it is **trailed to stay glued to price**
   and **auto-cancelled** after `InpPendingExpiryBars` if never triggered.
4. **Never let green turn red.** The moment the position is `InpLockTriggerAtr`
   ATRs in profit, the stop jumps to **break-even + a small lock buffer** (covers
   spread), then **trails tightly** (`InpTrailAtrMult` ATR) to capture more.
5. **Cut losses fast.** The initial stop is a tight `InpStopAtrMult` ATR, and a
   stagnant trade is force-closed after `InpMaxHoldingBars`.
6. **Portfolio guard rails.** Max simultaneous trades, max trades/day, daily-loss
   halt, max-drawdown halt, consecutive-loss circuit breaker and a spread filter.

### Why momentum *continuation* (not reversal)

You said "place a pending order in front" of a rapidly falling asset. That is a
**continuation** entry — you join the move rather than catch the falling knife.
That is also what the most repeatable Deriv scalping write-ups use: Buy/Sell
**Stop** orders beyond the recent extreme with tight risk. Set
`InpTradeBothSides = false` if you want to trade **only** falling assets (sells).

---

## Setting it up on Deriv

1. **Use a no-synthetics account.** In Deriv's Trader's Hub create an **MT5
   Financial** (or **Financial STP**) login. Those accounts contain only forex,
   metals, indices, crypto and stocks — *no synthetics at all*. (The EA's name
   blocklist is a second safety net in case synthetics are ever present.)
2. **Add the symbols you want scanned** to Market Watch (Ctrl+M → right-click →
   Symbols). The EA only scans what is in Market Watch. Major FX pairs and gold
   are the most liquid / scalp-friendly.
3. **Install the EA:** File → Open Data Folder → `MQL5/Experts`, copy
   `DerivScalperEA.mq5` there, open MetaEditor (F4) and Compile (F7).
4. **Attach it to one chart** (any symbol; M15 is fine — the EA scans all
   symbols regardless of which chart it sits on). Tick **Allow Algo Trading** and
   enable the global **Algo Trading** toolbar button.
5. **Backtest first.** Strategy Tester → `DerivScalperEA` → model "Every tick
   based on real ticks". Note: the Strategy Tester runs a **single symbol** at a
   time, so test your most-traded pairs individually to gauge per-symbol edge;
   the multi-symbol scanning is a live/forward-test feature.
6. **Demo forward-test** for a meaningful sample of trades, then go live with the
   **smallest** risk you can stomach.

### Key inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `InpScanMarketWatch` | true | Scan every Market Watch symbol |
| `InpSymbolWhitelist` | "" | Comma list to scan instead (e.g. `EURUSD,GBPUSD,XAUUSD`) |
| `InpSyntheticBlock` | Volatility,Crash,Boom,… | Name keywords to skip (synthetics) |
| `InpMomentumBars` / `InpMomentumAtrMult` | 6 / 2.0 | How big/fast a move must be to qualify |
| `InpTradeBothSides` | true | false = only short falling assets |
| `InpEntryOffsetAtr` | 0.05 | How far in front of price the pending sits |
| `InpPendingExpiryBars` | 2 | Cancel an untriggered pending after N bars |
| `InpStopAtrMult` | 1.0 | Initial (tight) stop distance |
| `InpTakeProfitAtrMult` | 1.5 | Fixed TP distance (0 = trail only) |
| `InpLockTriggerAtr` | 0.25 | Profit (ATR) at which the stop locks |
| `InpTrailAtrMult` | 0.5 | Trailing distance after lock |
| `InpMaxHoldingBars` | 8 | Force-close a stagnant trade |
| `InpRiskPercent` | 0.5 | Risk per trade (% of balance) |
| `InpMaxConcurrent` / `InpMaxTradesPerDay` | 3 / 20 | Portfolio caps |
| `InpDailyLossLimitPct` / `InpMaxDrawdownPct` | 3 / 15 | Hard halts |
| `InpMaxSpreadPoints` | 200 | Skip symbols when spread is too wide |

> **Tuning tip for win rate vs expectancy:** raising `InpTakeProfitAtrMult`
> *down* toward `InpStopAtrMult` and lowering `InpLockTriggerAtr` pushes the win
> rate up but shrinks average win. Backtest the combination — chase a positive
> equity curve, not a win-rate number.

---

## XAUUSD trend EA and Python bot

`XauusdTrendEA.mq5` and `python/xauusd_bot.py` implement the earlier, calmer
gold-only trend strategy (EMA trend + RSI/MACD momentum + ATR pullback, with the
same risk framework). They remain here as alternatives. The Python bot needs
Windows + an MT5 terminal (`pip install -r python/requirements.txt`).

---

## Broker symbol names

Deriv names forex normally (`EURUSD`, `GBPUSD`, `XAUUSD`) on MT5 Financial
accounts. If your broker uses suffixes (e.g. `EURUSD.`, `EURUSDm`), the EA still
works because it scans whatever is in Market Watch — just make sure the
synthetic blocklist still excludes any synthetic names your account exposes.
