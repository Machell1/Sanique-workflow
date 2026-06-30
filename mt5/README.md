# XAUUSD MT5 Expert Advisor

This folder contains `Experts/XAUUSD_Adaptive_Risk_EA.mq5`, a native
MetaTrader 5 Expert Advisor converted from the uploaded Python prototype.
It is designed for XAUUSD on the 15-minute timeframe.

No trading system can guarantee profit. Use the MT5 Strategy Tester and a
demo account before enabling live execution.

## Install

1. Open MetaTrader 5.
2. Select **File -> Open Data Folder**.
3. Copy `mt5/Experts/XAUUSD_Adaptive_Risk_EA.mq5` into
   `MQL5/Experts/`.
4. Open MetaEditor, compile the file, then restart or refresh the
   Navigator panel in MT5.
5. Attach the EA to an XAUUSD M15 chart.

## Live trading switch

The EA will not send live orders unless:

- MT5 Algo Trading is enabled.
- The symbol is selected and tradable.
- The EA input `InpAllowLiveTrading` is set to `true`.

By default `InpAllowLiveTrading=false`, so the EA logs detected signals
without placing orders.

## Main controls

- `InpSymbol`: defaults to `XAUUSD`.
- `InpTimeframe`: defaults to `PERIOD_M15`.
- `InpMagicNumber`: tags and filters this EA's positions.
- `InpUseDynamicRiskTiers`: adjusts risk based on account balance.
- `InpDailyLossLimit`, `InpWeeklyLossLimit`, `InpMaxDrawdownLimit`:
  hard circuit breakers.
- `InpSoftDailyLossLimit`, `InpSoftRiskFactor`,
  `InpMaxConsecutiveLosses`: reduce or stop trading after losses.
- `InpMaxTradesPerDay`: limits overtrading.
- `InpMaxExposureLimit`: caps risk across this EA's open positions.
- `InpMaxSpreadPoints`, `InpSpreadMultiplier`,
  `InpVolatilityMultiplier`: skip unfavorable execution conditions.
- `InpNewsTimesHHMM`, `InpNewsBufferMinutes`: simple server-time news
  blackout window.

## Strategy summary

The EA evaluates once per newly opened M15 candle using the last closed
candle. It combines:

- bullish/bearish engulfing, pin bar, and liquidity sweep patterns;
- recent order-block/FVG-style context zones;
- EMA 20/50, MACD, and RSI confirmation;
- ATR-based stop-loss, take-profit, and trailing stop management;
- partial profit-taking near 1R and time-based stale-position exits.

## Backtesting checklist

1. In MT5 Strategy Tester, choose **Expert:
   XAUUSD_Adaptive_Risk_EA**.
2. Select XAUUSD, M15, and real ticks if your broker provides them.
3. Test multiple market regimes and vary spread assumptions.
4. Optimize only a small set of inputs at a time to reduce curve fitting.
5. Forward-test on demo before any live account.
