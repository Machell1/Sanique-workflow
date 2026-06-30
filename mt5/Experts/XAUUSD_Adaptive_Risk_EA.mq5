//+------------------------------------------------------------------+
//| XAUUSD Adaptive Risk Expert Advisor for MetaTrader 5             |
//|                                                                  |
//| Educational trading system converted from the uploaded Python    |
//| prototype. It trades XAUUSD on M15 using price-action signals,   |
//| trend/momentum confirmation, volatility-aware stops, dynamic lot |
//| sizing, and daily risk circuit breakers.                         |
//+------------------------------------------------------------------+
#property copyright "Educational example"
#property link      ""
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>

input string          InpSymbol                  = "XAUUSD";
input ENUM_TIMEFRAMES InpTimeframe               = PERIOD_M15;
input long            InpMagicNumber             = 234000;
input bool            InpAllowLiveTrading        = false;
input double          InpBaseRiskPerTrade        = 1.00;   // Percent used if dynamic tiers are disabled
input bool            InpUseDynamicRiskTiers     = true;
input double          InpDailyLossLimit          = 3.00;   // Percent of balance
input double          InpWeeklyLossLimit         = 5.00;   // Percent of balance
input double          InpMaxDrawdownLimit        = 15.00;  // Percent from EA peak balance
input double          InpSoftDailyLossLimit      = 1.50;   // Percent of balance
input double          InpSoftRiskFactor          = 0.50;
input int             InpMaxConsecutiveLosses    = 3;
input int             InpMaxTradesPerDay         = 3;
input double          InpMaxExposureLimit        = 6.00;   // Percent of balance
input double          InpStopAtrMultiplier       = 1.50;
input double          InpTakeProfitAtrMultiplier = 2.00;
input double          InpTrailAtrMultiplier      = 1.00;
input int             InpMaxHoldingBars          = 32;
input double          InpMaxSpreadPoints         = 80.0;
input double          InpSpreadMultiplier        = 2.00;
input double          InpVolatilityMultiplier    = 2.00;
input string          InpNewsTimesHHMM           = "13:30,15:00";
input int             InpNewsBufferMinutes       = 10;
input int             InpSlippagePoints          = 30;
input int             InpBarsToLoad              = 240;

CTrade trade;

int      rsiHandle     = INVALID_HANDLE;
int      macdHandle    = INVALID_HANDLE;
int      ema20Handle   = INVALID_HANDLE;
int      ema50Handle   = INVALID_HANDLE;
int      atrHandle     = INVALID_HANDLE;
datetime lastBarTime   = 0;
double   peakBalance   = 0.0;

enum TradeSignal
{
   SIGNAL_NONE = 0,
   SIGNAL_BUY  = 1,
   SIGNAL_SELL = -1
};

//+------------------------------------------------------------------+
//| Initialization                                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(InpSymbol == "")
   {
      Print("InpSymbol cannot be empty.");
      return INIT_PARAMETERS_INCORRECT;
   }

   if(!SymbolSelect(InpSymbol, true))
   {
      PrintFormat("Unable to select symbol %s.", InpSymbol);
      return INIT_FAILED;
   }

   rsiHandle   = iRSI(InpSymbol, InpTimeframe, 14, PRICE_CLOSE);
   macdHandle  = iMACD(InpSymbol, InpTimeframe, 12, 26, 9, PRICE_CLOSE);
   ema20Handle = iMA(InpSymbol, InpTimeframe, 20, 0, MODE_EMA, PRICE_CLOSE);
   ema50Handle = iMA(InpSymbol, InpTimeframe, 50, 0, MODE_EMA, PRICE_CLOSE);
   atrHandle   = iATR(InpSymbol, InpTimeframe, 14);

   if(rsiHandle == INVALID_HANDLE || macdHandle == INVALID_HANDLE ||
      ema20Handle == INVALID_HANDLE || ema50Handle == INVALID_HANDLE ||
      atrHandle == INVALID_HANDLE)
   {
      Print("Failed to create one or more indicator handles.");
      return INIT_FAILED;
   }

   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpSlippagePoints);
   trade.SetTypeFillingBySymbol(InpSymbol);

   peakBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   PrintFormat("%s initialized on %s. Live trading input is %s.",
               __FILE__, InpSymbol, InpAllowLiveTrading ? "enabled" : "disabled");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   if(rsiHandle != INVALID_HANDLE)
      IndicatorRelease(rsiHandle);
   if(macdHandle != INVALID_HANDLE)
      IndicatorRelease(macdHandle);
   if(ema20Handle != INVALID_HANDLE)
      IndicatorRelease(ema20Handle);
   if(ema50Handle != INVALID_HANDLE)
      IndicatorRelease(ema50Handle);
   if(atrHandle != INVALID_HANDLE)
      IndicatorRelease(atrHandle);
}

//+------------------------------------------------------------------+
//| Main event                                                       |
//+------------------------------------------------------------------+
void OnTick()
{
   if(_Symbol != InpSymbol)
      return;

   ManageOpenPositions();

   datetime barTime = iTime(InpSymbol, InpTimeframe, 0);
   if(barTime == 0 || barTime == lastBarTime)
      return;
   lastBarTime = barTime;

   EvaluateNewBar();
}

//+------------------------------------------------------------------+
//| Strategy cycle                                                   |
//+------------------------------------------------------------------+
void EvaluateNewBar()
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(InpSymbol, InpTimeframe, 0, InpBarsToLoad, rates);
   if(copied < 100)
   {
      Print("Insufficient market history for signal evaluation.");
      return;
   }

   double atr[];
   double rsi[];
   double macdMain[];
   double macdSignal[];
   double ema20[];
   double ema50[];
   ArraySetAsSeries(atr, true);
   ArraySetAsSeries(rsi, true);
   ArraySetAsSeries(macdMain, true);
   ArraySetAsSeries(macdSignal, true);
   ArraySetAsSeries(ema20, true);
   ArraySetAsSeries(ema50, true);

   if(CopyBuffer(atrHandle, 0, 0, 80, atr) < 60 ||
      CopyBuffer(rsiHandle, 0, 0, 10, rsi) < 5 ||
      CopyBuffer(macdHandle, 0, 0, 10, macdMain) < 5 ||
      CopyBuffer(macdHandle, 1, 0, 10, macdSignal) < 5 ||
      CopyBuffer(ema20Handle, 0, 0, 10, ema20) < 5 ||
      CopyBuffer(ema50Handle, 0, 0, 10, ema50) < 5)
   {
      Print("Indicator data is not ready yet.");
      return;
   }

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   if(balance <= 0.0)
      return;

   if(IsInNewsWindow(TimeCurrent()))
   {
      Print("Skipping entry: configured news window.");
      return;
   }

   if(!RiskLimitsAllowTrading(balance))
      return;

   if(CountBotPositions() > 0)
   {
      Print("Skipping entry: this EA already has an open position.");
      return;
   }

   if(CountEntryDealsToday() >= InpMaxTradesPerDay)
   {
      Print("Skipping entry: maximum trades per day reached.");
      return;
   }

   if(ShouldSkipForVolatilityOrSpread(rates, atr))
      return;

   TradeSignal signal = GetSignal(rates, rsi[1], macdMain[1], macdSignal[1], ema20[1], ema50[1], atr[1]);
   if(signal == SIGNAL_NONE)
      return;

   double ask = SymbolInfoDouble(InpSymbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(InpSymbol, SYMBOL_BID);
   if(ask <= 0.0 || bid <= 0.0)
      return;

   double entry = (signal == SIGNAL_BUY) ? ask : bid;
   double stopDistance = MathMax(atr[1] * InpStopAtrMultiplier, MinimumStopDistance());
   double takeDistance = MathMax(atr[1] * InpTakeProfitAtrMultiplier, MinimumStopDistance());
   double sl = (signal == SIGNAL_BUY) ? entry - stopDistance : entry + stopDistance;
   double tp = (signal == SIGNAL_BUY) ? entry + takeDistance : entry - takeDistance;

   double baseRisk = EffectiveBaseRiskPercent(balance) / 100.0;
   double riskFactor = DynamicRiskFactor(balance);
   double effectiveRisk = baseRisk * riskFactor;
   double volume = CalculateVolume(balance, effectiveRisk, stopDistance);
   if(volume <= 0.0)
      return;

   double exposure = CurrentOpenExposure(balance) + RiskAmountForVolume(volume, stopDistance) / balance;
   if(exposure > InpMaxExposureLimit / 100.0)
   {
      PrintFormat("Skipping entry: exposure %.2f%% would exceed %.2f%%.",
                  exposure * 100.0, InpMaxExposureLimit);
      return;
   }

   if(!InpAllowLiveTrading)
   {
      PrintFormat("Signal found but live trading disabled: %s %.2f lots, SL %.2f, TP %.2f.",
                  signal == SIGNAL_BUY ? "BUY" : "SELL", volume, sl, tp);
      return;
   }

   bool sent = false;
   if(signal == SIGNAL_BUY)
      sent = trade.Buy(volume, InpSymbol, 0.0, NormalizePrice(sl), NormalizePrice(tp), "XAUUSD adaptive risk buy");
   else
      sent = trade.Sell(volume, InpSymbol, 0.0, NormalizePrice(sl), NormalizePrice(tp), "XAUUSD adaptive risk sell");

   if(!sent)
   {
      PrintFormat("Order failed. Retcode=%d, comment=%s",
                  trade.ResultRetcode(), trade.ResultRetcodeDescription());
   }
   else
   {
      PrintFormat("Order placed: %s %.2f lots, SL %.2f, TP %.2f.",
                  signal == SIGNAL_BUY ? "BUY" : "SELL", volume, sl, tp);
   }
}

//+------------------------------------------------------------------+
//| Signal logic                                                     |
//+------------------------------------------------------------------+
TradeSignal GetSignal(const MqlRates &rates[],
                      const double rsi,
                      const double macdMain,
                      const double macdSignal,
                      const double ema20,
                      const double ema50,
                      const double atr)
{
   bool bullishPattern = BullishEngulfing(rates) || BullishPinBar(rates) || BullishLiquiditySweep(rates, 5);
   bool bearishPattern = BearishEngulfing(rates) || BearishPinBar(rates) || BearishLiquiditySweep(rates, 5);
   bool bullishContext = IsNearContextZone(rates, true, atr);
   bool bearishContext = IsNearContextZone(rates, false, atr);

   bool bullishTrend = ema20 > ema50 && macdMain > macdSignal && rsi > 45.0 && rsi < 72.0;
   bool bearishTrend = ema20 < ema50 && macdMain < macdSignal && rsi < 55.0 && rsi > 28.0;

   if(bullishPattern && bullishContext && bullishTrend)
      return SIGNAL_BUY;
   if(bearishPattern && bearishContext && bearishTrend)
      return SIGNAL_SELL;
   return SIGNAL_NONE;
}

bool BullishEngulfing(const MqlRates &rates[])
{
   return rates[1].close > rates[1].open &&
          rates[2].close < rates[2].open &&
          rates[1].open <= rates[2].close &&
          rates[1].close >= rates[2].open;
}

bool BearishEngulfing(const MqlRates &rates[])
{
   return rates[1].close < rates[1].open &&
          rates[2].close > rates[2].open &&
          rates[1].open >= rates[2].close &&
          rates[1].close <= rates[2].open;
}

bool BullishPinBar(const MqlRates &rates[])
{
   double body = MathAbs(rates[1].close - rates[1].open);
   double range = rates[1].high - rates[1].low;
   if(range <= 0.0)
      return false;
   double lowerWick = MathMin(rates[1].open, rates[1].close) - rates[1].low;
   double upperWick = rates[1].high - MathMax(rates[1].open, rates[1].close);
   return lowerWick >= body * 2.0 && lowerWick > upperWick && rates[1].close > rates[1].open;
}

bool BearishPinBar(const MqlRates &rates[])
{
   double body = MathAbs(rates[1].close - rates[1].open);
   double range = rates[1].high - rates[1].low;
   if(range <= 0.0)
      return false;
   double lowerWick = MathMin(rates[1].open, rates[1].close) - rates[1].low;
   double upperWick = rates[1].high - MathMax(rates[1].open, rates[1].close);
   return upperWick >= body * 2.0 && upperWick > lowerWick && rates[1].close < rates[1].open;
}

bool BullishLiquiditySweep(const MqlRates &rates[], const int lookback)
{
   double priorLow = rates[2].low;
   for(int i = 3; i <= lookback + 1; i++)
      priorLow = MathMin(priorLow, rates[i].low);
   return rates[1].low < priorLow && rates[1].close > rates[1].open && rates[1].close > priorLow;
}

bool BearishLiquiditySweep(const MqlRates &rates[], const int lookback)
{
   double priorHigh = rates[2].high;
   for(int i = 3; i <= lookback + 1; i++)
      priorHigh = MathMax(priorHigh, rates[i].high);
   return rates[1].high > priorHigh && rates[1].close < rates[1].open && rates[1].close < priorHigh;
}

bool IsNearContextZone(const MqlRates &rates[], const bool bullish, const double atr)
{
   double price = rates[1].close;
   double tolerance = MathMax(atr * 0.35, MinimumStopDistance());
   long volumeTotal = 0;
   int samples = MathMin(ArraySize(rates) - 2, 80);

   for(int i = 2; i < samples; i++)
      volumeTotal += rates[i].tick_volume;

   double averageVolume = samples > 0 ? (double)volumeTotal / samples : 0.0;

   for(int i = 2; i < samples; i++)
   {
      bool directionalCandle = bullish ? rates[i].close > rates[i].open : rates[i].close < rates[i].open;
      bool activeVolume = averageVolume <= 0.0 || rates[i].tick_volume >= averageVolume * 1.10;
      if(directionalCandle && activeVolume && price >= rates[i].low - tolerance && price <= rates[i].high + tolerance)
         return true;

      if(i + 1 < ArraySize(rates) && i - 1 >= 1)
      {
         double fvgLow;
         double fvgHigh;
         if(rates[i + 1].low > rates[i - 1].high)
         {
            fvgLow = rates[i - 1].high;
            fvgHigh = rates[i + 1].low;
            if(price >= fvgLow - tolerance && price <= fvgHigh + tolerance)
               return true;
         }
         if(rates[i + 1].high < rates[i - 1].low)
         {
            fvgLow = rates[i + 1].high;
            fvgHigh = rates[i - 1].low;
            if(price >= fvgLow - tolerance && price <= fvgHigh + tolerance)
               return true;
         }
      }
   }

   double recentLow = rates[2].low;
   double recentHigh = rates[2].high;
   for(int i = 3; i <= 20; i++)
   {
      recentLow = MathMin(recentLow, rates[i].low);
      recentHigh = MathMax(recentHigh, rates[i].high);
   }

   if(bullish)
      return price <= recentLow + tolerance * 2.0;
   return price >= recentHigh - tolerance * 2.0;
}

//+------------------------------------------------------------------+
//| Risk and account controls                                        |
//+------------------------------------------------------------------+
bool RiskLimitsAllowTrading(const double balance)
{
   if(peakBalance <= 0.0 || balance > peakBalance)
      peakBalance = balance;

   double drawdown = peakBalance > 0.0 ? (peakBalance - balance) / peakBalance : 0.0;
   if(drawdown > InpMaxDrawdownLimit / 100.0)
   {
      PrintFormat("Skipping entry: max drawdown reached %.2f%%.", drawdown * 100.0);
      return false;
   }

   double dailyLoss = RealizedLossSince(StartOfDay(TimeCurrent()));
   if(dailyLoss > balance * InpDailyLossLimit / 100.0)
   {
      PrintFormat("Skipping entry: daily loss %.2f exceeds limit.", dailyLoss);
      return false;
   }

   double weeklyLoss = RealizedLossSince(TimeCurrent() - 7 * 24 * 60 * 60);
   if(weeklyLoss > balance * InpWeeklyLossLimit / 100.0)
   {
      PrintFormat("Skipping entry: weekly loss %.2f exceeds limit.", weeklyLoss);
      return false;
   }

   int losses = ConsecutiveLossesToday();
   if(losses >= InpMaxConsecutiveLosses)
   {
      PrintFormat("Skipping entry: consecutive loss breaker hit (%d).", losses);
      return false;
   }

   return true;
}

double DynamicRiskFactor(const double balance)
{
   double factor = 1.0;
   double dailyLossRatio = balance > 0.0 ? RealizedLossSince(StartOfDay(TimeCurrent())) / balance : 0.0;
   int losses = ConsecutiveLossesToday();

   if(dailyLossRatio >= InpSoftDailyLossLimit / 100.0)
      factor *= InpSoftRiskFactor;
   if(losses > 0)
      factor *= MathPow(InpSoftRiskFactor, losses);

   return MathMax(0.10, MathMin(1.0, factor));
}

double EffectiveBaseRiskPercent(const double balance)
{
   if(!InpUseDynamicRiskTiers)
      return InpBaseRiskPerTrade;
   if(balance < 5000.0)
      return 2.0;
   if(balance < 10000.0)
      return 1.5;
   if(balance < 50000.0)
      return 1.0;
   if(balance < 100000.0)
      return 0.8;
   return 0.5;
}

double CalculateVolume(const double balance, const double riskPercent, const double stopDistance)
{
   double minLot = SymbolInfoDouble(InpSymbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(InpSymbol, SYMBOL_VOLUME_MAX);
   double step = SymbolInfoDouble(InpSymbol, SYMBOL_VOLUME_STEP);
   if(minLot <= 0.0)
      minLot = 0.01;
   if(maxLot <= 0.0)
      maxLot = 100.0;
   if(step <= 0.0)
      step = 0.01;

   double riskAmount = balance * riskPercent;
   double riskPerLot = RiskAmountForVolume(1.0, stopDistance);
   if(riskAmount <= 0.0 || riskPerLot <= 0.0)
      return 0.0;

   double volume = riskAmount / riskPerLot;
   volume = MathMax(minLot, MathMin(maxLot, volume));
   volume = MathFloor(volume / step) * step;
   return NormalizeVolume(volume);
}

double RiskAmountForVolume(const double volume, const double stopDistance)
{
   double contractSize = SymbolInfoDouble(InpSymbol, SYMBOL_TRADE_CONTRACT_SIZE);
   if(contractSize > 0.0)
      return stopDistance * contractSize * volume;

   double tickValue = SymbolInfoDouble(InpSymbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(InpSymbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickValue > 0.0 && tickSize > 0.0)
      return (stopDistance / tickSize) * tickValue * volume;

   return 0.0;
}

double CurrentOpenExposure(const double balance)
{
   if(balance <= 0.0)
      return 0.0;

   double exposure = 0.0;
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != InpSymbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagicNumber)
         continue;

      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double volume = PositionGetDouble(POSITION_VOLUME);
      if(sl <= 0.0)
         continue;

      exposure += RiskAmountForVolume(volume, MathAbs(openPrice - sl)) / balance;
   }
   return exposure;
}

int CountBotPositions()
{
   int count = 0;
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) == InpSymbol &&
         PositionGetInteger(POSITION_MAGIC) == InpMagicNumber)
      {
         count++;
      }
   }
   return count;
}

double RealizedLossSince(const datetime fromTime)
{
   datetime now = TimeCurrent();
   if(!HistorySelect(fromTime, now))
      return 0.0;

   double loss = 0.0;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;
      if(HistoryDealGetString(ticket, DEAL_SYMBOL) != InpSymbol ||
         HistoryDealGetInteger(ticket, DEAL_MAGIC) != InpMagicNumber)
         continue;
      double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT) +
                      HistoryDealGetDouble(ticket, DEAL_SWAP) +
                      HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      if(profit < 0.0)
         loss += -profit;
   }
   return loss;
}

int CountEntryDealsToday()
{
   datetime start = StartOfDay(TimeCurrent());
   if(!HistorySelect(start, TimeCurrent()))
      return 0;

   int count = 0;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;
      if(HistoryDealGetString(ticket, DEAL_SYMBOL) != InpSymbol ||
         HistoryDealGetInteger(ticket, DEAL_MAGIC) != InpMagicNumber)
         continue;
      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry == DEAL_ENTRY_IN || entry == DEAL_ENTRY_INOUT)
         count++;
   }
   return count;
}

int ConsecutiveLossesToday()
{
   datetime start = StartOfDay(TimeCurrent());
   if(!HistorySelect(start, TimeCurrent()))
      return 0;

   int losses = 0;
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;
      if(HistoryDealGetString(ticket, DEAL_SYMBOL) != InpSymbol ||
         HistoryDealGetInteger(ticket, DEAL_MAGIC) != InpMagicNumber)
         continue;
      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT)
         continue;

      double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT) +
                      HistoryDealGetDouble(ticket, DEAL_SWAP) +
                      HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      if(profit < 0.0)
         losses++;
      else if(profit > 0.0)
         break;
   }
   return losses;
}

//+------------------------------------------------------------------+
//| Position management                                              |
//+------------------------------------------------------------------+
void ManageOpenPositions()
{
   double atr[];
   ArraySetAsSeries(atr, true);
   if(CopyBuffer(atrHandle, 0, 0, 5, atr) < 3)
      return;

   double bid = SymbolInfoDouble(InpSymbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(InpSymbol, SYMBOL_ASK);
   if(bid <= 0.0 || ask <= 0.0)
      return;

   int total = PositionsTotal();
   for(int i = total - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != InpSymbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagicNumber)
         continue;

      long type = PositionGetInteger(POSITION_TYPE);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl = PositionGetDouble(POSITION_SL);
      double tp = PositionGetDouble(POSITION_TP);
      double volume = PositionGetDouble(POSITION_VOLUME);
      datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
      double currentPrice = type == POSITION_TYPE_BUY ? bid : ask;

      if(InpMaxHoldingBars > 0 && openTime > 0)
      {
         int secondsPerBar = PeriodSeconds(InpTimeframe);
         if(secondsPerBar > 0 && (TimeCurrent() - openTime) >= InpMaxHoldingBars * secondsPerBar)
         {
            trade.PositionClose(ticket);
            continue;
         }
      }

      if(sl <= 0.0)
         continue;

      double riskDistance = type == POSITION_TYPE_BUY ? openPrice - sl : sl - openPrice;
      double profitDistance = type == POSITION_TYPE_BUY ? currentPrice - openPrice : openPrice - currentPrice;
      if(riskDistance <= 0.0 || profitDistance <= 0.0)
         continue;

      double rMultiple = profitDistance / riskDistance;
      double minLot = SymbolInfoDouble(InpSymbol, SYMBOL_VOLUME_MIN);
      if(rMultiple >= 1.0 && volume >= minLot * 2.0)
      {
         double half = NormalizeVolume(volume / 2.0);
         if(half >= minLot && trade.PositionClosePartial(ticket, half))
         {
            trade.PositionModify(ticket, NormalizePrice(openPrice), NormalizePrice(tp));
         }
      }

      double newSl = sl;
      if(type == POSITION_TYPE_BUY)
      {
         double candidate = currentPrice - atr[1] * InpTrailAtrMultiplier;
         if(candidate > sl && candidate < currentPrice && (tp <= 0.0 || candidate < tp))
            newSl = candidate;
      }
      else
      {
         double candidate = currentPrice + atr[1] * InpTrailAtrMultiplier;
         if(candidate < sl && candidate > currentPrice && (tp <= 0.0 || candidate > tp))
            newSl = candidate;
      }

      if(MathAbs(newSl - sl) >= SymbolInfoDouble(InpSymbol, SYMBOL_POINT))
         trade.PositionModify(ticket, NormalizePrice(newSl), NormalizePrice(tp));
   }
}

//+------------------------------------------------------------------+
//| Filters and helpers                                              |
//+------------------------------------------------------------------+
bool ShouldSkipForVolatilityOrSpread(const MqlRates &rates[], const double &atr[])
{
   double lastAtr = atr[1];
   double atrSum = 0.0;
   for(int i = 1; i <= 50; i++)
      atrSum += atr[i];
   double averageAtr = atrSum / 50.0;

   if(averageAtr > 0.0 && lastAtr > averageAtr * InpVolatilityMultiplier)
   {
      Print("Skipping entry: ATR volatility spike.");
      return true;
   }

   double point = SymbolInfoDouble(InpSymbol, SYMBOL_POINT);
   double ask = SymbolInfoDouble(InpSymbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(InpSymbol, SYMBOL_BID);
   if(point <= 0.0 || ask <= 0.0 || bid <= 0.0)
      return true;

   double currentSpread = (ask - bid) / point;
   double spreadSum = 0.0;
   for(int i = 1; i <= 50; i++)
      spreadSum += rates[i].spread;
   double averageSpread = spreadSum / 50.0;

   if(currentSpread > InpMaxSpreadPoints)
   {
      PrintFormat("Skipping entry: spread %.1f points exceeds %.1f.", currentSpread, InpMaxSpreadPoints);
      return true;
   }

   if(averageSpread > 0.0 && currentSpread > averageSpread * InpSpreadMultiplier)
   {
      Print("Skipping entry: spread is elevated versus recent average.");
      return true;
   }

   return false;
}

bool IsInNewsWindow(const datetime now)
{
   if(InpNewsTimesHHMM == "" || InpNewsBufferMinutes <= 0)
      return false;

   string events[];
   int count = StringSplit(InpNewsTimesHHMM, ',', events);
   MqlDateTime current;
   TimeToStruct(now, current);

   for(int i = 0; i < count; i++)
   {
      string eventText = Trim(events[i]);
      if(StringLen(eventText) != 5 || StringSubstr(eventText, 2, 1) != ":")
         continue;

      int hour = (int)StringToInteger(StringSubstr(eventText, 0, 2));
      int minute = (int)StringToInteger(StringSubstr(eventText, 3, 2));
      if(hour < 0 || hour > 23 || minute < 0 || minute > 59)
         continue;

      MqlDateTime eventTime = current;
      eventTime.hour = hour;
      eventTime.min = minute;
      eventTime.sec = 0;
      datetime eventDateTime = StructToTime(eventTime);
      if(MathAbs((long)(now - eventDateTime)) <= InpNewsBufferMinutes * 60)
         return true;
   }

   return false;
}

datetime StartOfDay(const datetime value)
{
   MqlDateTime parts;
   TimeToStruct(value, parts);
   parts.hour = 0;
   parts.min = 0;
   parts.sec = 0;
   return StructToTime(parts);
}

double MinimumStopDistance()
{
   double point = SymbolInfoDouble(InpSymbol, SYMBOL_POINT);
   long stopsLevel = SymbolInfoInteger(InpSymbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minDistance = MathMax(point * (double)stopsLevel, point * 10.0);
   return MathMax(minDistance, point);
}

double NormalizePrice(const double price)
{
   int digits = (int)SymbolInfoInteger(InpSymbol, SYMBOL_DIGITS);
   return NormalizeDouble(price, digits);
}

double NormalizeVolume(const double volume)
{
   double step = SymbolInfoDouble(InpSymbol, SYMBOL_VOLUME_STEP);
   if(step <= 0.0)
      step = 0.01;
   int digits = 0;
   double test = step;
   while(test < 1.0 && digits < 8)
   {
      test *= 10.0;
      digits++;
   }
   return NormalizeDouble(volume, digits);
}

string Trim(string value)
{
   StringTrimLeft(value);
   StringTrimRight(value);
   return value;
}
