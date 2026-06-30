# DerivScalperEA — Deriv MT5 multi-symbol momentum scalper

A single-file MetaTrader 5 Expert Advisor that scans every (non-synthetic)
symbol in your Market Watch on M15, jumps on fast movers with pending **stop**
orders placed in front of price, locks a green trade to break-even instantly so
it can't turn red, trails tightly, and cuts losers fast.

> **Honesty / disclaimer:** No EA can guarantee an 80% win rate or any profit.
> Win rate alone is meaningless without expectancy — an 80%-win system still
> loses money if the occasional full-stop loss outweighs the many small wins.
> This design biases toward a high hit-rate, but you **must** backtest in the
> Strategy Tester and forward-test on a Deriv **demo** account before trading
> live. Trade at your own risk.

---

## How it works

1. **Scan the universe** — every M15 bar it loops over all Market Watch symbols
   (or a whitelist). **Synthetics are excluded** by name (Volatility, Crash,
   Boom, Step, Jump, Range Break, Vol over, Hybrid, 1HZ, …).
2. **Find a fast mover** — measures the move over the last `InpMomentumBars`
   bars in **ATR units**. If price fell (or rose) at least `InpMomentumAtrMult`
   ATRs and the last candle agrees, the symbol qualifies.
   - **Anchored VWAP gate (always on):** a session-anchored VWAP (resets each
     day) must first **calibrate** — no trades until `InpVwapMinBars` bars into
     the session — then only **buys at a discount** (below AVWAP) and **sells at
     a premium** (above AVWAP) are allowed.
3. **Place a pending STOP in front of price** — falling → **Sell Stop** below
   the bid; rising → **Buy Stop** above the ask, as close as the broker allows.
   The order is trailed to stay glued to price and auto-cancels after
   `InpPendingExpiryBars`.
4. **Never let green turn red** — the instant the trade is `InpLockTriggerAtr`
   ATRs in profit, the stop jumps to break-even + a small lock buffer, then
   trails by `InpTrailAtrMult` ATR.
5. **Cut losses fast** — tight `InpStopAtrMult` ATR initial stop + a time exit.
6. **Portfolio guards** — max concurrent trades, max trades/day, daily-loss
   halt, drawdown halt, consecutive-loss breaker, spread filter.

## Install on Deriv MT5

1. Open a Deriv **MT5 Financial** (or **Financial STP**) login so no synthetics
   exist on the account.
2. Add the symbols you want scanned to Market Watch (Ctrl+M).
3. Save the code below as `DerivScalperEA.mq5` in
   **File → Open Data Folder → MQL5/Experts**.
4. Open MetaEditor (F4), select the file, press **Compile** (F7) — expect 0
   errors.
5. Attach it to any M15 chart, tick **Allow Algo Trading**, and enable the
   global **Algo Trading** toolbar button.
6. **Backtest** (Strategy Tester runs one symbol at a time) and **demo-test**
   before going live.

## Key inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `InpScanMarketWatch` | true | Scan every Market Watch symbol |
| `InpSymbolWhitelist` | "" | Comma list to scan instead (e.g. `EURUSD,GBPUSD,XAUUSD`) |
| `InpSyntheticBlock` | Volatility,Crash,Boom,… | Name keywords to skip (synthetics) |
| `InpMomentumBars` / `InpMomentumAtrMult` | 6 / 2.0 | How big/fast a move must be |
| `InpTradeBothSides` | true | false = only short falling assets |
| `InpVwapMinBars` | 8 | AVWAP calibration — don't trade until this many bars into the session |
| `InpVwapMaxBars` | 500 | Safety cap on bars scanned back to the session (day) open |
| `InpEntryOffsetAtr` | 0.05 | How far in front of price the pending sits |
| `InpPendingExpiryBars` | 2 | Cancel an untriggered pending after N bars |
| `InpStopAtrMult` | 1.0 | Initial (tight) stop distance |
| `InpTakeProfitAtrMult` | 3.0 | Fixed TP distance — 3.0 (backtest-validated) lets winners run; 0 = trail only |
| `InpLockTriggerAtr` | 0.25 | Profit (ATR) at which the stop locks |
| `InpTrailAtrMult` | 0.5 | Trailing distance after lock |
| `InpMaxHoldingBars` | 8 | Force-close a stagnant trade |
| `InpRiskPercent` | 0.5 | Risk per trade (% of balance) |
| `InpMaxConcurrent` / `InpMaxTradesPerDay` | 3 / 20 | Portfolio caps |
| `InpDailyLossLimitPct` / `InpMaxDrawdownPct` | 3 / 15 | Hard halts |
| `InpMaxSpreadPoints` | 200 | Skip symbols when spread is too wide |

---

## Full source — `DerivScalperEA.mq5`

```mql5
//+------------------------------------------------------------------+
//|                                                DerivScalperEA.mq5 |
//|   Multi-symbol momentum scalper for Deriv MT5 (Financial acct).  |
//|                                                                  |
//|   Concept (as requested):                                        |
//|     * Scan every tradable symbol in Market Watch (NOT synthetic  |
//|       indices) every M15 bar.                                    |
//|     * Find an asset that is moving FAST (rapidly falling or       |
//|       rising) measured in ATR units.                             |
//|     * Place a pending STOP order "in front" of price, as close   |
//|       as the broker allows, in the direction of the move.        |
//|     * The instant the trade is in profit, ratchet the stop to    |
//|       break-even+lock so a green trade can never turn red, then  |
//|       trail tightly to lock in more.                             |
//|     * Cut losers fast with a tight initial stop.                 |
//|                                                                  |
//|   Deriv note: run this on a *Financial* or *Financial STP* MT5   |
//|   login so synthetics are not even present. The synthetic name   |
//|   blocklist below is a second safety net.                        |
//|                                                                  |
//|   *** Honesty: an 80% win rate cannot be guaranteed by any EA.   |
//|   This design biases toward a high hit-rate (fast break-even +   |
//|   quick exits) but that does NOT guarantee profitability -       |
//|   occasional full-stop losers can outweigh many small wins.      |
//|   Backtest and demo-test before trading live. See README.md. *** |
//+------------------------------------------------------------------+
#property copyright "Deriv momentum scalper"
#property version   "1.00"
#property strict
#property description "Multi-symbol M15 momentum scalper for Deriv (excludes synthetics)."

#include <Trade/Trade.mqh>
#include <Trade/PositionInfo.mqh>
#include <Trade/OrderInfo.mqh>

//--- Symbol universe -------------------------------------------------
input group "=== Symbol Universe ==="
input bool   InpScanMarketWatch  = true;     // Scan every symbol shown in Market Watch
input string InpSymbolWhitelist  = "";       // Optional: only these (comma list), overrides scan
input string InpSyntheticBlock   = "Volatility,Crash,Boom,Step,Jump,Range Break,Vol over,Hybrid,Drift,DEX,Multi Step,Skew,1HZ,Basket"; // Skip names containing any of these

//--- Strategy --------------------------------------------------------
input group "=== Momentum Strategy ==="
input ENUM_TIMEFRAMES InpTimeframe   = PERIOD_M15; // Working timeframe
input int    InpMomentumBars     = 6;     // Lookback bars for the move
input double InpMomentumAtrMult  = 2.0;   // Move must be >= this many ATRs to count as "rapid"
input int    InpAtrPeriod        = 14;    // ATR period
input bool   InpTradeBothSides   = true;  // Trade rallies too (false = only falling assets -> sells)

//--- Anchored VWAP (always on, core part of the strategy) -----------
input group "=== Anchored VWAP (AVWAP) ==="
input int    InpVwapMinBars       = 8;    // Calibration: don't trade until this many bars into the session
input int    InpVwapMaxBars       = 500;  // Safety cap: max bars scanned back to the session (day) open

//--- Pending entry ---------------------------------------------------
input group "=== Pending Entry ==="
input double InpEntryOffsetAtr   = 0.05;  // Extra offset in ATR beyond the broker minimum ("as close as possible")
input int    InpPendingExpiryBars= 2;     // Cancel an untriggered pending order after N bars
input bool   InpTrailPending     = true;  // Keep the pending order glued to price while momentum holds

//--- Risk / exits ----------------------------------------------------
input group "=== Risk & Exits ==="
input double InpRiskPercent      = 0.5;   // Risk per trade (% of balance)
input double InpStopAtrMult      = 1.0;   // Initial stop distance (ATR) - tight = fast loss cut
input double InpTakeProfitAtrMult= 3.0;   // Take-profit distance (ATR). 3.0 = let winners run (backtest-validated); 0 = trail only
input double InpLockTriggerAtr   = 0.25;  // Once price is this many ATR in profit, lock the trade
input int    InpLockBufferPoints = 0;     // Extra points locked above break-even (0 = auto: spread+2)
input double InpTrailAtrMult      = 0.5;  // Trailing distance after lock (ATR)
input int    InpMaxHoldingBars   = 8;     // Force-close a stagnant trade after N bars (0 = off)

//--- Portfolio risk --------------------------------------------------
input group "=== Portfolio Risk ==="
input int    InpMaxConcurrent    = 3;     // Max simultaneous open positions (all symbols)
input int    InpMaxTradesPerDay  = 20;    // Max new trades opened per day (all symbols)
input double InpDailyLossLimitPct= 3.0;   // Halt for the day after this daily loss (% of day-start balance)
input double InpMaxDrawdownPct   = 15.0;  // Halt if equity drawdown from peak exceeds this
input int    InpMaxConsecLosses  = 4;     // Pause for the day after this many losses in a row
input int    InpMaxSpreadPoints  = 200;   // Skip a symbol if spread (points) exceeds this

//--- Execution -------------------------------------------------------
input group "=== Execution ==="
input long   InpMagicNumber      = 770077;// Magic number tagging this EA's orders
input ulong  InpDeviationPoints  = 30;    // Max slippage in points
input string InpTradeComment     = "DerivScalper";

//--- Globals ---------------------------------------------------------
CTrade        trade;
CPositionInfo posInfo;
COrderInfo    ordInfo;

string g_symbols[];      // Tradable, non-synthetic symbols
int    g_atrHandle[];    // Parallel ATR handle per symbol

datetime g_lastScanBar = 0;
datetime g_currentDay  = 0;
double   g_dayStartBalance = 0.0;
double   g_peakEquity  = 0.0;
int      g_tradesToday = 0;
bool     g_halted      = false;

//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpDeviationPoints);
   trade.LogLevel(LOG_LEVEL_ERRORS);

   if(!BuildSymbolUniverse())
     {
      Print("No tradable non-synthetic symbols found. Add symbols to Market Watch.");
      return(INIT_FAILED);
     }

   g_peakEquity = AccountInfoDouble(ACCOUNT_EQUITY);
   ResetDailyState();

   PrintFormat("DerivScalperEA ready. Scanning %d symbols on %s. Risk/trade=%.2f%%.",
               ArraySize(g_symbols), EnumToString(InpTimeframe), InpRiskPercent);
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   for(int i = 0; i < ArraySize(g_atrHandle); i++)
      if(g_atrHandle[i] != INVALID_HANDLE)
         IndicatorRelease(g_atrHandle[i]);
  }

//+------------------------------------------------------------------+
//| Build the list of tradable, non-synthetic symbols + ATR handles  |
//+------------------------------------------------------------------+
bool BuildSymbolUniverse()
  {
   ArrayResize(g_symbols, 0);
   ArrayResize(g_atrHandle, 0);

   string candidates[];
   if(StringLen(InpSymbolWhitelist) > 0)
     {
      int n = StringSplit(InpSymbolWhitelist, StringGetCharacter(",", 0), candidates);
      for(int i = 0; i < n; i++)
        {
         string s = Trim(candidates[i]);
         if(StringLen(s) > 0)
            AddSymbol(s);
        }
     }
   else if(InpScanMarketWatch)
     {
      int total = SymbolsTotal(true); // Market Watch only
      for(int i = 0; i < total; i++)
        {
         string s = SymbolName(i, true);
         if(StringLen(s) > 0)
            AddSymbol(s);
        }
     }
   else
     {
      Print("InpScanMarketWatch is false and InpSymbolWhitelist is empty - no symbols to trade.");
     }
   return(ArraySize(g_symbols) > 0);
  }

//+------------------------------------------------------------------+
//| Add a symbol to the universe if it is real + tradable            |
//+------------------------------------------------------------------+
void AddSymbol(string symbol)
  {
   if(IsSynthetic(symbol))
      return;
   if(!SymbolSelect(symbol, true))
      return;
   // Must be fully tradable (not disabled / close-only)
   long mode = SymbolInfoInteger(symbol, SYMBOL_TRADE_MODE);
   if(mode != SYMBOL_TRADE_MODE_FULL)
      return;

   int h = iATR(symbol, InpTimeframe, InpAtrPeriod);
   if(h == INVALID_HANDLE)
      return;

   int idx = ArraySize(g_symbols);
   ArrayResize(g_symbols, idx + 1);
   ArrayResize(g_atrHandle, idx + 1);
   g_symbols[idx]   = symbol;
   g_atrHandle[idx] = h;
  }

//+------------------------------------------------------------------+
//| True if the symbol name matches the synthetic blocklist          |
//+------------------------------------------------------------------+
bool IsSynthetic(string symbol)
  {
   string keys[];
   int n = StringSplit(InpSyntheticBlock, StringGetCharacter(",", 0), keys);
   string up = symbol;
   StringToUpper(up);
   for(int i = 0; i < n; i++)
     {
      string k = Trim(keys[i]);
      if(StringLen(k) == 0)
         continue;
      StringToUpper(k);
      if(StringFind(up, k) >= 0)
         return(true);
     }
   return(false);
  }

//+------------------------------------------------------------------+
string Trim(string s)
  {
   StringTrimLeft(s);
   StringTrimRight(s);
   return(s);
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   //--- Day rollover
   datetime today = DayStart(TimeCurrent());
   if(today != g_currentDay)
      ResetDailyState();

   //--- Fast management runs on every tick (lock / trail / time exit)
   ManageAll();

   //--- Scan for new entries once per closed bar
   datetime barTime = (datetime)iTime(_Symbol, InpTimeframe, 0);
   if(barTime == g_lastScanBar)
      return;
   g_lastScanBar = barTime;

   UpdatePeakEquity();
   if(g_halted)
      return;
   if(DrawdownExceeded()) { g_halted = true; Print("Max drawdown hit - halted."); return; }
   if(DailyLossExceeded()){ g_halted = true; Print("Daily loss limit hit - paused for the day."); return; }
   if(InpMaxConsecLosses > 0 && ConsecutiveLossesToday() >= InpMaxConsecLosses)
      return;
   if(g_tradesToday >= InpMaxTradesPerDay)
      return;

   for(int i = 0; i < ArraySize(g_symbols); i++)
     {
      if(CountOpenAndPending() >= InpMaxConcurrent)
         break;
      ScanSymbol(g_symbols[i], g_atrHandle[i]);
     }
  }

//+------------------------------------------------------------------+
//| Evaluate one symbol and place a pending stop if momentum is hot  |
//+------------------------------------------------------------------+
void ScanSymbol(string symbol, int atrHandle)
  {
   if(HasExposure(symbol))           // already trading this symbol
      return;
   if(!DataReady(symbol))
      return;
   if(SpreadTooWide(symbol))
      return;

   double atr;
   if(!ReadAtr(atrHandle, atr) || atr <= 0.0)
      return;

   double close1    = iClose(symbol, InpTimeframe, 1);
   double closePast = iClose(symbol, InpTimeframe, InpMomentumBars);
   double open1     = iOpen(symbol, InpTimeframe, 1);
   if(close1 == 0.0 || closePast == 0.0)
      return;

   double move = closePast - close1;            // positive => price fell
   double moveAtr = move / atr;

   bool fallingFast = (moveAtr >= InpMomentumAtrMult) && (close1 < open1);
   bool risingFast  = (-moveAtr >= InpMomentumAtrMult) && (close1 > open1);

   // Anchored VWAP is a permanent part of the strategy. Wait for it to calibrate
   // (enough bars into the session), then buy ONLY at a discount (below VWAP) and
   // sell ONLY at a premium (above VWAP).
   int sessBars = 0;
   double vwap = AnchoredVwap(symbol, InpTimeframe, 1, InpVwapMaxBars, sessBars);
   if(vwap <= 0.0 || sessBars < InpVwapMinBars)
      return;                              // VWAP not calibrated yet this session
   if(risingFast && close1 >= vwap)        // not a discount -> no buy
      risingFast = false;
   if(fallingFast && close1 <= vwap)       // not a premium -> no sell
      fallingFast = false;

   if(fallingFast)
      PlacePending(symbol, ORDER_TYPE_SELL_STOP, atr);
   else if(risingFast && InpTradeBothSides)
      PlacePending(symbol, ORDER_TYPE_BUY_STOP, atr);
  }

//+------------------------------------------------------------------+
//| Place a stop pending order "in front" of price                   |
//+------------------------------------------------------------------+
void PlacePending(string symbol, ENUM_ORDER_TYPE type, double atr)
  {
   double ask   = SymbolInfoDouble(symbol, SYMBOL_ASK);
   double bid   = SymbolInfoDouble(symbol, SYMBOL_BID);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   int    digits= (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double stopsLevel = (double)SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL) * point;

   // Distance the pending must sit away from current price (broker min + small buffer).
   double offset = MathMax(stopsLevel, InpEntryOffsetAtr * atr);
   if(offset <= 0.0)
      offset = 10 * point;

   double stopDist = atr * InpStopAtrMult;
   double tpDist   = (InpTakeProfitAtrMult > 0.0) ? atr * InpTakeProfitAtrMult : 0.0;
   if(stopsLevel > 0.0)
     {
      stopDist = MathMax(stopDist, stopsLevel * 1.5);
      if(tpDist > 0.0) tpDist = MathMax(tpDist, stopsLevel * 1.5);
     }

   double entry, sl, tp;
   if(type == ORDER_TYPE_BUY_STOP)
     {
      entry = NormalizeDouble(ask + offset, digits);
      sl    = NormalizeDouble(entry - stopDist, digits);
      tp    = (tpDist > 0.0) ? NormalizeDouble(entry + tpDist, digits) : 0.0;
     }
   else // SELL_STOP
     {
      entry = NormalizeDouble(bid - offset, digits);
      sl    = NormalizeDouble(entry + stopDist, digits);
      tp    = (tpDist > 0.0) ? NormalizeDouble(entry - tpDist, digits) : 0.0;
     }

   double lots = CalculateLotSize(symbol, stopDist);
   if(lots <= 0.0)
      return;

   datetime expiry = 0;
   ENUM_ORDER_TYPE_TIME ttype = ORDER_TIME_GTC;
   if(InpPendingExpiryBars > 0)
     {
      expiry = TimeCurrent() + (long)InpPendingExpiryBars * PeriodSeconds(InpTimeframe);
      ttype  = ORDER_TIME_SPECIFIED;
     }

   trade.SetTypeFillingBySymbol(symbol);
   bool ok = (type == ORDER_TYPE_BUY_STOP)
             ? trade.BuyStop(lots, entry, symbol, sl, tp, ttype, expiry, InpTradeComment)
             : trade.SellStop(lots, entry, symbol, sl, tp, ttype, expiry, InpTradeComment);

   if(ok)
     {
      g_tradesToday++;
      PrintFormat("%s %s %.2f lots entry=%.5f SL=%.5f TP=%.5f",
                  symbol, (type == ORDER_TYPE_BUY_STOP ? "BUY STOP" : "SELL STOP"),
                  lots, entry, sl, tp);
     }
   else
      PrintFormat("%s pending failed: %d (%s)", symbol,
                  trade.ResultRetcode(), trade.ResultRetcodeDescription());
  }

//+------------------------------------------------------------------+
//| Fixed-fractional lot size from the stop distance                 |
//+------------------------------------------------------------------+
double CalculateLotSize(string symbol, double stopDistancePrice)
  {
   if(stopDistancePrice <= 0.0)
      return(0.0);
   double balance    = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskAmount = balance * (InpRiskPercent / 100.0);
   if(riskAmount <= 0.0)
      return(0.0);

   double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickValue <= 0.0 || tickSize <= 0.0)
      return(0.0);

   double lossPerLot = (stopDistancePrice / tickSize) * tickValue;
   if(lossPerLot <= 0.0)
      return(0.0);

   double lots = riskAmount / lossPerLot;

   double minVol  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxVol  = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double stepVol = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   if(stepVol > 0.0)
      lots = MathFloor(lots / stepVol) * stepVol;

   if(lots < minVol)
     {
      // Sizing up to the broker minimum would over-risk; refuse if > 1.5x budget.
      if(lossPerLot * minVol > riskAmount * 1.5)
         return(0.0);
      lots = minVol;
     }
   if(lots > maxVol)
      lots = maxVol;

   return(lots);
  }

//+------------------------------------------------------------------+
//| Manage every pending order and open position                     |
//+------------------------------------------------------------------+
void ManageAll()
  {
   ManagePendingOrders();
   ManageOpenPositions();
  }

//+------------------------------------------------------------------+
//| Trail / expire pending orders to stay glued to price             |
//+------------------------------------------------------------------+
void ManagePendingOrders()
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0 || !ordInfo.Select(ticket))
         continue;
      if(ordInfo.Magic() != InpMagicNumber)
         continue;

      string symbol = ordInfo.Symbol();
      ENUM_ORDER_TYPE type = ordInfo.OrderType();
      if(type != ORDER_TYPE_BUY_STOP && type != ORDER_TYPE_SELL_STOP)
         continue;

      // Manual expiry safety net (in case the broker ignores ORDER_TIME_SPECIFIED).
      if(InpPendingExpiryBars > 0)
        {
         datetime maxAge = ordInfo.TimeSetup() + (long)InpPendingExpiryBars * PeriodSeconds(InpTimeframe);
         if(TimeCurrent() >= maxAge)
           {
            trade.OrderDelete(ticket);
            continue;
           }
        }

      if(!InpTrailPending)
         continue;

      double atr;
      int idx = SymbolIndex(symbol);
      if(idx < 0 || !ReadAtr(g_atrHandle[idx], atr) || atr <= 0.0)
         continue;

      double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
      int digits   = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      double stopsLevel = (double)SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL) * point;
      double offset = MathMax(stopsLevel, InpEntryOffsetAtr * atr);
      double stopDist = MathMax(atr * InpStopAtrMult, stopsLevel * 1.5);

      double curPrice = ordInfo.PriceOpen();

      // Preserve the original expiry so trailing never turns a timed order into a GTC one.
      datetime keepExpiry = (datetime)ordInfo.TimeExpiration();
      ENUM_ORDER_TYPE_TIME keepType = (keepExpiry > 0) ? ORDER_TIME_SPECIFIED : ORDER_TIME_GTC;

      if(type == ORDER_TYPE_BUY_STOP)
        {
         double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
         double newEntry = NormalizeDouble(ask + offset, digits);
         // Only ratchet the entry DOWN toward price (price rising stays "in front").
         if(newEntry < curPrice - point)
           {
            double sl = NormalizeDouble(newEntry - stopDist, digits);
            double tp = (InpTakeProfitAtrMult > 0.0)
                        ? NormalizeDouble(newEntry + atr * InpTakeProfitAtrMult, digits) : 0.0;
            trade.OrderModify(ticket, newEntry, sl, tp, keepType, keepExpiry);
           }
        }
      else // SELL_STOP
        {
         double bid = SymbolInfoDouble(symbol, SYMBOL_BID);
         double newEntry = NormalizeDouble(bid - offset, digits);
         // Only ratchet the entry UP toward price (price falling stays "in front").
         if(newEntry > curPrice + point)
           {
            double sl = NormalizeDouble(newEntry + stopDist, digits);
            double tp = (InpTakeProfitAtrMult > 0.0)
                        ? NormalizeDouble(newEntry - atr * InpTakeProfitAtrMult, digits) : 0.0;
            trade.OrderModify(ticket, newEntry, sl, tp, keepType, keepExpiry);
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Lock-to-breakeven, tight trail and time exit on open positions   |
//+------------------------------------------------------------------+
void ManageOpenPositions()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !posInfo.SelectByTicket(ticket))
         continue;
      if(posInfo.Magic() != InpMagicNumber)
         continue;

      string symbol = posInfo.Symbol();
      int idx = SymbolIndex(symbol);
      double atr = 0.0;
      bool haveAtr = (idx >= 0) && ReadAtr(g_atrHandle[idx], atr) && atr > 0.0;

      double point  = SymbolInfoDouble(symbol, SYMBOL_POINT);
      int digits    = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      double bid    = SymbolInfoDouble(symbol, SYMBOL_BID);
      double ask    = SymbolInfoDouble(symbol, SYMBOL_ASK);
      double entry  = posInfo.PriceOpen();
      double curSL  = posInfo.StopLoss();
      double curTP  = posInfo.TakeProfit();
      long   spread = SymbolInfoInteger(symbol, SYMBOL_SPREAD);

      // Time-based exit for stagnant trades.
      if(InpMaxHoldingBars > 0)
        {
         int barSecs = PeriodSeconds(InpTimeframe);
         if(barSecs > 0 && (long)(TimeCurrent() - posInfo.Time()) >= (long)InpMaxHoldingBars * barSecs)
           {
            trade.PositionClose(ticket);
            continue;
           }
        }

      if(!haveAtr)
         continue;

      double lockBuffer = ((InpLockBufferPoints > 0) ? InpLockBufferPoints : (spread + 2)) * point;
      double lockTrigger = InpLockTriggerAtr * atr;
      double trailDist   = InpTrailAtrMult * atr;

      if(posInfo.PositionType() == POSITION_TYPE_BUY)
        {
         double profit = bid - entry;
         double newSL = curSL;

         // The instant we are sufficiently green, lock so it can't go red.
         if(profit >= lockTrigger)
           {
            double lockSL = NormalizeDouble(entry + lockBuffer, digits);
            if(lockSL > newSL)
               newSL = lockSL;
            double trailSL = NormalizeDouble(bid - trailDist, digits);
            if(trailSL > newSL && trailSL < bid)
               newSL = trailSL;
           }
         if(newSL > curSL && newSL < bid)
            trade.PositionModify(ticket, newSL, curTP);
        }
      else // SELL
        {
         double profit = entry - ask;
         double newSL = curSL;
         if(profit >= lockTrigger)
           {
            double lockSL = NormalizeDouble(entry - lockBuffer, digits);
            if(curSL == 0.0 || lockSL < newSL)
               newSL = lockSL;
            double trailSL = NormalizeDouble(ask + trailDist, digits);
            if((trailSL < newSL || newSL == 0.0) && trailSL > ask)
               newSL = trailSL;
           }
         if((curSL == 0.0 || newSL < curSL) && newSL > ask)
            trade.PositionModify(ticket, newSL, curTP);
        }
     }
  }

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
int SymbolIndex(string symbol)
  {
   for(int i = 0; i < ArraySize(g_symbols); i++)
      if(g_symbols[i] == symbol)
         return(i);
   return(-1);
  }

bool ReadAtr(int handle, double &value)
  {
   double tmp[];
   if(handle == INVALID_HANDLE)
      return(false);
   if(CopyBuffer(handle, 0, 1, 1, tmp) != 1)
      return(false);
   value = tmp[0];
   return(value > 0.0);
  }

//+------------------------------------------------------------------+
//| Session-anchored VWAP: cumulative from the session (day) open up  |
//| to bar `shift`, resetting every session. Tick-volume weighted.    |
//+------------------------------------------------------------------+
double AnchoredVwap(string symbol, ENUM_TIMEFRAMES tf, int shift, int maxBars, int &barsInSession)
  {
   barsInSession = 0;
   datetime anchorTime = iTime(symbol, tf, shift);
   if(anchorTime == 0)
      return(0.0);
   MqlDateTime ref;
   TimeToStruct(anchorTime, ref);

   double pv = 0.0, vv = 0.0;
   for(int j = shift; j < shift + maxBars; j++)
     {
      datetime bt = iTime(symbol, tf, j);
      if(bt == 0)
         break;
      MqlDateTime st;
      TimeToStruct(bt, st);
      // Stop at the session boundary (new calendar day = new VWAP anchor).
      if(st.day != ref.day || st.mon != ref.mon || st.year != ref.year)
         break;
      barsInSession++;
      double hi = iHigh(symbol, tf, j);
      double lo = iLow(symbol, tf, j);
      double cl = iClose(symbol, tf, j);
      if(hi <= 0.0 || lo <= 0.0 || cl <= 0.0)
         continue;
      double typical = (hi + lo + cl) / 3.0;
      double vol = (double)iTickVolume(symbol, tf, j);
      if(vol <= 0.0)
         vol = 1.0;             // equal-weight fallback if no volume
      pv += typical * vol;
      vv += vol;
     }
   return(vv > 0.0 ? pv / vv : 0.0);
  }

bool DataReady(string symbol)
  {
   if(!SymbolIsSynchronized(symbol))
     {
      SymbolSelect(symbol, true);
      return(false);
     }
   return(Bars(symbol, InpTimeframe) > InpMomentumBars + InpAtrPeriod + 2);
  }

bool SpreadTooWide(string symbol)
  {
   if(InpMaxSpreadPoints <= 0)
      return(false);
   return(SymbolInfoInteger(symbol, SYMBOL_SPREAD) > InpMaxSpreadPoints);
  }

bool HasExposure(string symbol)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t != 0 && posInfo.SelectByTicket(t) &&
         posInfo.Symbol() == symbol && posInfo.Magic() == InpMagicNumber)
         return(true);
     }
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t != 0 && ordInfo.Select(t) &&
         ordInfo.Symbol() == symbol && ordInfo.Magic() == InpMagicNumber)
         return(true);
     }
   return(false);
  }

int CountOpenAndPending()
  {
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t != 0 && posInfo.SelectByTicket(t) && posInfo.Magic() == InpMagicNumber)
         count++;
     }
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t != 0 && ordInfo.Select(t) && ordInfo.Magic() == InpMagicNumber)
         count++;
     }
   return(count);
  }

//+------------------------------------------------------------------+
//| Day / risk state                                                 |
//+------------------------------------------------------------------+
void ResetDailyState()
  {
   g_currentDay      = DayStart(TimeCurrent());
   g_dayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   g_tradesToday     = 0;
   g_halted          = false;
  }

datetime DayStart(datetime t)
  {
   MqlDateTime st;
   TimeToStruct(t, st);
   st.hour = 0; st.min = 0; st.sec = 0;
   return(StructToTime(st));
  }

void UpdatePeakEquity()
  {
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   if(eq > g_peakEquity)
      g_peakEquity = eq;
  }

bool DrawdownExceeded()
  {
   if(InpMaxDrawdownPct <= 0.0 || g_peakEquity <= 0.0)
      return(false);
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   return((g_peakEquity - eq) / g_peakEquity * 100.0 >= InpMaxDrawdownPct);
  }

bool DailyLossExceeded()
  {
   if(InpDailyLossLimitPct <= 0.0 || g_dayStartBalance <= 0.0)
      return(false);
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   return((g_dayStartBalance - eq) >= g_dayStartBalance * (InpDailyLossLimitPct / 100.0));
  }

int ConsecutiveLossesToday()
  {
   if(!HistorySelect(g_currentDay, TimeCurrent()))
      return(0);
   int streak = 0;
   int total = HistoryDealsTotal();
   for(int i = total - 1; i >= 0; i--)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0)
         continue;
      if(HistoryDealGetInteger(d, DEAL_MAGIC) != InpMagicNumber)
         continue;
      if(HistoryDealGetInteger(d, DEAL_ENTRY) != DEAL_ENTRY_OUT)
         continue;
      double pnl = HistoryDealGetDouble(d, DEAL_PROFIT)
                 + HistoryDealGetDouble(d, DEAL_SWAP)
                 + HistoryDealGetDouble(d, DEAL_COMMISSION);
      if(pnl < 0.0)
         streak++;
      else if(pnl > 0.0)
         break;
     }
   return(streak);
  }
//+------------------------------------------------------------------+
```
