//+------------------------------------------------------------------+
//|                                                 XauusdTrendEA.mq5 |
//|   Trend-following pullback Expert Advisor for XAUUSD (gold).      |
//|                                                                  |
//|   This EA is a native MQL5 rewrite of the original Python /      |
//|   MetaTrader5 prototype. It runs *inside* the MT5 terminal as a  |
//|   true Expert Advisor and can place live trades on XAUUSD.       |
//|                                                                  |
//|   Strategy in one line: trade only in the direction of the       |
//|   higher-timeframe trend, enter on a momentum pullback, size by  |
//|   fixed-fractional risk, and protect capital with hard daily /   |
//|   drawdown limits, a spread filter and an optional session       |
//|   filter.                                                        |
//|                                                                  |
//|   IMPORTANT: No trading strategy can be guaranteed profitable.   |
//|   Always run the Strategy Tester and a demo account before       |
//|   risking real capital. See README.md for the full discussion.   |
//+------------------------------------------------------------------+
#property copyright "Trading bot rework"
#property version   "2.00"
#property strict
#property description "Trend-following pullback EA for XAUUSD with strict risk management."

#include <Trade/Trade.mqh>
#include <Trade/PositionInfo.mqh>
#include <Trade/SymbolInfo.mqh>

//--- Strategy inputs -------------------------------------------------
input group "=== Strategy ==="
input ENUM_TIMEFRAMES InpTimeframe      = PERIOD_M15;  // Working timeframe
input int             InpEmaFastPeriod  = 21;          // Fast EMA period
input int             InpEmaSlowPeriod  = 50;          // Slow EMA period
input int             InpEmaTrendPeriod = 200;         // Trend filter EMA period
input int             InpRsiPeriod      = 14;          // RSI period
input double          InpRsiLongLevel   = 50.0;        // Min RSI for longs
input double          InpRsiShortLevel  = 50.0;        // Max RSI for shorts
input int             InpAtrPeriod      = 14;          // ATR period
input double          InpPullbackAtr    = 1.0;         // Max pullback distance to fast EMA (in ATR)

//--- Risk / money management ----------------------------------------
input group "=== Risk Management ==="
input double InpRiskPercent       = 0.5;   // Risk per trade (% of balance)
input double InpStopAtrMult       = 1.8;   // Stop-loss distance (ATR multiples)
input double InpTakeProfitAtrMult = 3.0;   // Take-profit distance (ATR multiples)
input double InpMinLot            = 0.01;  // Minimum lot
input double InpMaxLot            = 5.0;   // Maximum lot
input double InpDailyLossLimitPct = 3.0;   // Stop trading after this daily loss (% of day-start balance)
input double InpMaxDrawdownPct    = 15.0;  // Stop trading if equity drawdown exceeds this (% from peak)
input int    InpMaxTradesPerDay   = 4;     // Max new trades opened per day
input int    InpMaxConsecLosses   = 3;     // Pause for the day after this many losses in a row

//--- Trade management ------------------------------------------------
input group "=== Trade Management ==="
input bool   InpUseBreakEven      = true;  // Move SL to break-even at +1R
input bool   InpUseTrailingStop   = true;  // Trail the stop with ATR
input double InpTrailAtrMult       = 1.5;  // Trailing distance (ATR multiples)
input int    InpMaxHoldingBars    = 64;    // Force-close a position after this many bars (0 = off)

//--- Filters ---------------------------------------------------------
input group "=== Filters ==="
input int    InpMaxSpreadPoints   = 600;   // Skip if spread (points) exceeds this (0 = off)
input bool   InpUseSessionFilter  = false; // Restrict trading to a time window
input int    InpSessionStartHour  = 7;     // Session start hour (server time)
input int    InpSessionEndHour    = 20;    // Session end hour (server time)

//--- Execution -------------------------------------------------------
input group "=== Execution ==="
input long   InpMagicNumber       = 234000;// Magic number tagging this EA's orders
input ulong  InpDeviationPoints   = 30;    // Max price deviation (slippage) in points
input string InpTradeComment      = "XauusdTrendEA";

//--- Globals ---------------------------------------------------------
CTrade        trade;
CPositionInfo posInfo;
CSymbolInfo   symInfo;

int hEmaFast  = INVALID_HANDLE;
int hEmaSlow  = INVALID_HANDLE;
int hEmaTrend = INVALID_HANDLE;
int hRsi      = INVALID_HANDLE;
int hAtr      = INVALID_HANDLE;
int hMacd     = INVALID_HANDLE;

datetime lastBarTime   = 0;     // Timestamp of the last processed (closed) bar
datetime currentDay    = 0;     // Date (midnight) of the current trading day
double   dayStartBalance = 0.0; // Balance at the start of the current day
double   peakEquity    = 0.0;   // Highest equity seen (for drawdown control)
int      tradesToday   = 0;     // New positions opened today
bool     tradingHalted = false; // Halted for the rest of the day

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(!symInfo.Name(_Symbol))
     {
      Print("Failed to bind symbol info to ", _Symbol);
      return(INIT_FAILED);
     }
   symInfo.RefreshRates();

   hEmaFast  = iMA(_Symbol, InpTimeframe, InpEmaFastPeriod, 0, MODE_EMA, PRICE_CLOSE);
   hEmaSlow  = iMA(_Symbol, InpTimeframe, InpEmaSlowPeriod, 0, MODE_EMA, PRICE_CLOSE);
   hEmaTrend = iMA(_Symbol, InpTimeframe, InpEmaTrendPeriod, 0, MODE_EMA, PRICE_CLOSE);
   hRsi      = iRSI(_Symbol, InpTimeframe, InpRsiPeriod, PRICE_CLOSE);
   hAtr      = iATR(_Symbol, InpTimeframe, InpAtrPeriod);
   hMacd     = iMACD(_Symbol, InpTimeframe, 12, 26, 9, PRICE_CLOSE);

   if(hEmaFast == INVALID_HANDLE || hEmaSlow == INVALID_HANDLE ||
      hEmaTrend == INVALID_HANDLE || hRsi == INVALID_HANDLE ||
      hAtr == INVALID_HANDLE || hMacd == INVALID_HANDLE)
     {
      Print("Failed to create one or more indicator handles. Error: ", GetLastError());
      return(INIT_FAILED);
     }

   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpDeviationPoints);
   trade.SetTypeFillingBySymbol(_Symbol);
   trade.LogLevel(LOG_LEVEL_ERRORS);

   peakEquity      = AccountInfoDouble(ACCOUNT_EQUITY);
   ResetDailyState();

   PrintFormat("XauusdTrendEA initialised on %s %s. Risk/trade=%.2f%%, magic=%I64d",
               _Symbol, EnumToString(InpTimeframe), InpRiskPercent, InpMagicNumber);
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   IndicatorRelease(hEmaFast);
   IndicatorRelease(hEmaSlow);
   IndicatorRelease(hEmaTrend);
   IndicatorRelease(hRsi);
   IndicatorRelease(hAtr);
   IndicatorRelease(hMacd);
  }

//+------------------------------------------------------------------+
//| Reset the per-day counters and references                        |
//+------------------------------------------------------------------+
void ResetDailyState()
  {
   currentDay      = DayStart(TimeCurrent());
   dayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   tradesToday     = 0;
   tradingHalted   = false;
  }

//+------------------------------------------------------------------+
//| Midnight (00:00) of the day containing 't' (server time)         |
//+------------------------------------------------------------------+
datetime DayStart(datetime t)
  {
   MqlDateTime st;
   TimeToStruct(t, st);
   st.hour = 0;
   st.min  = 0;
   st.sec  = 0;
   return(StructToTime(st));
  }

//+------------------------------------------------------------------+
//| Main tick handler                                                |
//+------------------------------------------------------------------+
void OnTick()
  {
   //--- Roll the trading day over at midnight (server time)
   datetime today = DayStart(TimeCurrent());
   if(today != currentDay)
      ResetDailyState();

   //--- Manage open positions on every tick (trailing/break-even/time exit)
   ManageOpenPositions();

   //--- Only evaluate signals once per closed bar
   datetime barTime = (datetime)iTime(_Symbol, InpTimeframe, 0);
   if(barTime == lastBarTime)
      return;
   lastBarTime = barTime;

   //--- Hard account-level protections
   UpdatePeakEquity();
   if(tradingHalted)
      return;
   if(DrawdownExceeded())
     {
      tradingHalted = true;
      Print("Max drawdown exceeded - trading halted.");
      return;
     }
   if(DailyLossExceeded())
     {
      tradingHalted = true;
      Print("Daily loss limit reached - trading paused for the day.");
      return;
     }
   if(tradesToday >= InpMaxTradesPerDay)
      return;
   if(InpMaxConsecLosses > 0 && ConsecutiveLossesToday() >= InpMaxConsecLosses)
      return;

   //--- Only one position at a time for this EA/symbol
   if(CountOwnPositions() > 0)
      return;

   //--- Session and spread filters
   if(InpUseSessionFilter && !WithinSession())
      return;
   if(!SpreadOk())
      return;

   //--- Evaluate the entry on the just-closed bar (index 1)
   int signal = GetSignal();
   if(signal > 0)
      OpenTrade(ORDER_TYPE_BUY);
   else if(signal < 0)
      OpenTrade(ORDER_TYPE_SELL);
  }

//+------------------------------------------------------------------+
//| Read a single indicator buffer value at 'shift'                  |
//+------------------------------------------------------------------+
bool ReadBuffer(int handle, int buffer, int shift, double &value)
  {
   double tmp[];
   if(CopyBuffer(handle, buffer, shift, 1, tmp) != 1)
      return(false);
   value = tmp[0];
   return(true);
  }

//+------------------------------------------------------------------+
//| Generate an entry signal from the last closed bar                |
//| Returns +1 (long), -1 (short) or 0 (no trade)                    |
//+------------------------------------------------------------------+
int GetSignal()
  {
   // Shift 1 == last fully closed bar; shift 2 == bar before it.
   double emaFast, emaSlow, emaTrend, rsi, rsiPrev, atr;
   double macdMain, macdSignal;
   if(!ReadBuffer(hEmaFast, 0, 1, emaFast))   return(0);
   if(!ReadBuffer(hEmaSlow, 0, 1, emaSlow))   return(0);
   if(!ReadBuffer(hEmaTrend, 0, 1, emaTrend)) return(0);
   if(!ReadBuffer(hRsi, 0, 1, rsi))           return(0);
   if(!ReadBuffer(hRsi, 0, 2, rsiPrev))       return(0);
   if(!ReadBuffer(hAtr, 0, 1, atr))           return(0);
   if(!ReadBuffer(hMacd, MAIN_LINE, 1, macdMain))     return(0);
   if(!ReadBuffer(hMacd, SIGNAL_LINE, 1, macdSignal)) return(0);

   if(atr <= 0.0)
      return(0);

   double close1 = iClose(_Symbol, InpTimeframe, 1);
   double open1  = iOpen(_Symbol, InpTimeframe, 1);
   double low1   = iLow(_Symbol, InpTimeframe, 1);
   double high1  = iHigh(_Symbol, InpTimeframe, 1);

   bool bullishCandle = close1 > open1;
   bool bearishCandle = close1 < open1;

   // --- Long setup: aligned uptrend + momentum + a pullback near fast EMA ---
   bool upTrend       = (emaFast > emaSlow) && (close1 > emaTrend);
   bool longMomentum  = (rsi > InpRsiLongLevel) && (rsi >= rsiPrev) && (macdMain > macdSignal);
   bool longPullback  = (low1 <= emaFast + InpPullbackAtr * atr) && (close1 > emaFast);
   if(upTrend && longMomentum && longPullback && bullishCandle)
      return(+1);

   // --- Short setup: aligned downtrend + momentum + a pullback near fast EMA ---
   bool downTrend     = (emaFast < emaSlow) && (close1 < emaTrend);
   bool shortMomentum = (rsi < InpRsiShortLevel) && (rsi <= rsiPrev) && (macdMain < macdSignal);
   bool shortPullback = (high1 >= emaFast - InpPullbackAtr * atr) && (close1 < emaFast);
   if(downTrend && shortMomentum && shortPullback && bearishCandle)
      return(-1);

   return(0);
  }

//+------------------------------------------------------------------+
//| Open a market trade with ATR-based SL/TP and risk-based sizing   |
//+------------------------------------------------------------------+
void OpenTrade(ENUM_ORDER_TYPE type)
  {
   double atr;
   if(!ReadBuffer(hAtr, 0, 1, atr) || atr <= 0.0)
      return;

   if(!symInfo.RefreshRates())
      return;

   double price = (type == ORDER_TYPE_BUY) ? symInfo.Ask() : symInfo.Bid();
   if(price <= 0.0)
      return;

   double stopDist = atr * InpStopAtrMult;
   double tpDist   = atr * InpTakeProfitAtrMult;

   // Respect the broker's minimum stop distance.
   double point   = symInfo.Point();
   double minStop = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * point;
   if(minStop > 0.0)
     {
      stopDist = MathMax(stopDist, minStop * 1.5);
      tpDist   = MathMax(tpDist, minStop * 1.5);
     }

   double sl, tp;
   if(type == ORDER_TYPE_BUY)
     {
      sl = price - stopDist;
      tp = price + tpDist;
     }
   else
     {
      sl = price + stopDist;
      tp = price - tpDist;
     }

   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   sl = NormalizeDouble(sl, digits);
   tp = NormalizeDouble(tp, digits);

   double lots = CalculateLotSize(stopDist);
   if(lots <= 0.0)
     {
      Print("Computed lot size is zero - skipping trade.");
      return;
     }

   bool ok = (type == ORDER_TYPE_BUY)
             ? trade.Buy(lots, _Symbol, price, sl, tp, InpTradeComment)
             : trade.Sell(lots, _Symbol, price, sl, tp, InpTradeComment);

   if(ok && (trade.ResultRetcode() == TRADE_RETCODE_DONE ||
             trade.ResultRetcode() == TRADE_RETCODE_PLACED ||
             trade.ResultRetcode() == TRADE_RETCODE_DONE_PARTIAL))
     {
      tradesToday++;
      PrintFormat("%s %.2f lots @ %.2f  SL=%.2f TP=%.2f  (trade %d/%d today)",
                  (type == ORDER_TYPE_BUY ? "BUY" : "SELL"),
                  lots, price, sl, tp, tradesToday, InpMaxTradesPerDay);
     }
   else
     {
      PrintFormat("Order failed: retcode=%d (%s)", trade.ResultRetcode(),
                  trade.ResultRetcodeDescription());
     }
  }

//+------------------------------------------------------------------+
//| Fixed-fractional lot sizing from the stop distance               |
//+------------------------------------------------------------------+
double CalculateLotSize(double stopDistancePrice)
  {
   if(stopDistancePrice <= 0.0)
      return(0.0);

   double balance    = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskAmount = balance * (InpRiskPercent / 100.0);
   if(riskAmount <= 0.0)
      return(0.0);

   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickValue <= 0.0 || tickSize <= 0.0)
      return(0.0);

   // Money lost per 1.0 lot if the stop is hit.
   double lossPerLot = (stopDistancePrice / tickSize) * tickValue;
   if(lossPerLot <= 0.0)
      return(0.0);

   double lots = riskAmount / lossPerLot;

   // Clamp to broker + user limits and round to the lot step.
   double minVol  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxVol  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double stepVol = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   double lowerBound = MathMax(minVol, InpMinLot);
   double upperBound = MathMin(maxVol, InpMaxLot);

   if(stepVol > 0.0)
      lots = MathFloor(lots / stepVol) * stepVol;

   if(lots < lowerBound)
     {
      // Sizing down to the minimum would over-risk: refuse the trade
      // unless the minimum lot still fits inside ~1.5x the risk budget.
      double minLoss = lossPerLot * lowerBound;
      if(minLoss > riskAmount * 1.5)
         return(0.0);
      lots = lowerBound;
     }
   if(lots > upperBound)
      lots = upperBound;

   return(NormalizeDouble(lots, 2));
  }

//+------------------------------------------------------------------+
//| Manage open positions: break-even, trailing stop, time exit      |
//+------------------------------------------------------------------+
void ManageOpenPositions()
  {
   double atr;
   bool haveAtr = ReadBuffer(hAtr, 0, 1, atr) && atr > 0.0;

   if(!symInfo.RefreshRates())
      return;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;
      if(!posInfo.SelectByTicket(ticket))
         continue;
      if(posInfo.Symbol() != _Symbol || posInfo.Magic() != InpMagicNumber)
         continue;

      ENUM_POSITION_TYPE ptype = posInfo.PositionType();
      double entry   = posInfo.PriceOpen();
      double curSL   = posInfo.StopLoss();
      double curTP   = posInfo.TakeProfit();
      double bid     = symInfo.Bid();
      double ask     = symInfo.Ask();
      int    digits  = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

      //--- Time-based exit
      if(InpMaxHoldingBars > 0)
        {
         int barSeconds = PeriodSeconds(InpTimeframe);
         if(barSeconds > 0)
           {
            long age = (long)(TimeCurrent() - posInfo.Time());
            if(age >= (long)InpMaxHoldingBars * barSeconds)
              {
               trade.PositionClose(ticket);
               continue;
              }
           }
        }

      if(!haveAtr)
         continue;

      double riskDist = MathAbs(entry - curSL);
      if(riskDist <= 0.0)
         continue;

      if(ptype == POSITION_TYPE_BUY)
        {
         double profitDist = bid - entry;

         //--- Break-even at +1R
         if(InpUseBreakEven && profitDist >= riskDist && curSL < entry)
           {
            double newSL = NormalizeDouble(entry, digits);
            if(newSL > curSL)
               trade.PositionModify(ticket, newSL, curTP);
            curSL = MathMax(curSL, newSL);
           }

         //--- ATR trailing stop
         if(InpUseTrailingStop)
           {
            double trailSL = NormalizeDouble(bid - atr * InpTrailAtrMult, digits);
            if(trailSL > curSL && trailSL < bid)
               trade.PositionModify(ticket, trailSL, curTP);
           }
        }
      else if(ptype == POSITION_TYPE_SELL)
        {
         double profitDist = entry - ask;

         if(InpUseBreakEven && profitDist >= riskDist && (curSL > entry || curSL == 0.0))
           {
            double newSL = NormalizeDouble(entry, digits);
            if(newSL < curSL || curSL == 0.0)
               trade.PositionModify(ticket, newSL, curTP);
            curSL = (curSL == 0.0) ? newSL : MathMin(curSL, newSL);
           }

         if(InpUseTrailingStop)
           {
            double trailSL = NormalizeDouble(ask + atr * InpTrailAtrMult, digits);
            if((trailSL < curSL || curSL == 0.0) && trailSL > ask)
               trade.PositionModify(ticket, trailSL, curTP);
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Count this EA's open positions on the current symbol             |
//+------------------------------------------------------------------+
int CountOwnPositions()
  {
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;
      if(!posInfo.SelectByTicket(ticket))
         continue;
      if(posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber)
         count++;
     }
   return(count);
  }

//+------------------------------------------------------------------+
//| Track the highest equity for drawdown control                    |
//+------------------------------------------------------------------+
void UpdatePeakEquity()
  {
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   if(equity > peakEquity)
      peakEquity = equity;
  }

//+------------------------------------------------------------------+
//| True if equity drawdown from the peak exceeds the limit          |
//+------------------------------------------------------------------+
bool DrawdownExceeded()
  {
   if(InpMaxDrawdownPct <= 0.0 || peakEquity <= 0.0)
      return(false);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double dd = (peakEquity - equity) / peakEquity * 100.0;
   return(dd >= InpMaxDrawdownPct);
  }

//+------------------------------------------------------------------+
//| True if today's realised+floating loss exceeds the daily limit   |
//+------------------------------------------------------------------+
bool DailyLossExceeded()
  {
   if(InpDailyLossLimitPct <= 0.0 || dayStartBalance <= 0.0)
      return(false);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double loss = dayStartBalance - equity;
   return(loss >= dayStartBalance * (InpDailyLossLimitPct / 100.0));
  }

//+------------------------------------------------------------------+
//| Count consecutive losing deals closed today (most recent first)  |
//+------------------------------------------------------------------+
int ConsecutiveLossesToday()
  {
   datetime from = currentDay;
   datetime to   = TimeCurrent();
   if(!HistorySelect(from, to))
      return(0);

   // Walk closing deals from newest to oldest; stop at the first win.
   int streak = 0;
   int total = HistoryDealsTotal();
   for(int i = total - 1; i >= 0; i--)
     {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0)
         continue;
      if(HistoryDealGetString(dealTicket, DEAL_SYMBOL) != _Symbol)
         continue;
      if(HistoryDealGetInteger(dealTicket, DEAL_MAGIC) != InpMagicNumber)
         continue;
      if(HistoryDealGetInteger(dealTicket, DEAL_ENTRY) != DEAL_ENTRY_OUT)
         continue;

      double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT)
                    + HistoryDealGetDouble(dealTicket, DEAL_SWAP)
                    + HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      if(profit < 0.0)
         streak++;
      else if(profit > 0.0)
         break;
     }
   return(streak);
  }

//+------------------------------------------------------------------+
//| Spread filter                                                    |
//+------------------------------------------------------------------+
bool SpreadOk()
  {
   if(InpMaxSpreadPoints <= 0)
      return(true);
   long spread = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(spread > InpMaxSpreadPoints)
     {
      PrintFormat("Spread %d pts exceeds limit %d - skipping.", (int)spread, InpMaxSpreadPoints);
      return(false);
     }
   return(true);
  }

//+------------------------------------------------------------------+
//| Session (trading hours) filter, server time                      |
//+------------------------------------------------------------------+
bool WithinSession()
  {
   MqlDateTime st;
   TimeToStruct(TimeCurrent(), st);
   int hour = st.hour;
   if(InpSessionStartHour <= InpSessionEndHour)
      return(hour >= InpSessionStartHour && hour < InpSessionEndHour);
   // Overnight window (e.g. 22 -> 5)
   return(hour >= InpSessionStartHour || hour < InpSessionEndHour);
  }
//+------------------------------------------------------------------+
