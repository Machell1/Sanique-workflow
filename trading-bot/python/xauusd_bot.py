"""
XAUUSD trend-following bot for MetaTrader 5 (Python edition).

This is a cleaned-up, bug-fixed rewrite of the original prototype. It runs as
an *external* Python process that connects to a running MetaTrader 5 terminal
through the official ``MetaTrader5`` package and places live trades on XAUUSD.

If you want something that runs *inside* the terminal as a true Expert Advisor
(no Python process required, works on a VPS, runs in the Strategy Tester), use
the MQL5 version in ``trading-bot/mql5/XauusdTrendEA.mq5`` instead. This Python
file mirrors that EA's logic so backtests and live behaviour stay consistent.

Key fixes over the original prototype
--------------------------------------
* Signals are evaluated only on **closed** bars (the live, forming bar is
  dropped) and only **once per new bar** instead of every loop.
* The incoherent "order block / FVG / engulfing" heuristics that fired on
  arbitrary historical bars were replaced with a single, coherent
  trend + momentum + pullback rule that actually uses the indicators.
* Entries use the **current** market price, not a stale historical close.
* The order filling mode is detected from the symbol instead of being
  hard-coded to FOK (which many brokers reject).
* Lot sizing, the daily-loss circuit breaker and drawdown control were
  simplified and made consistent with the MQL5 EA.

EDUCATIONAL USE ONLY. No trading strategy is guaranteed to be profitable.
Always backtest and run on a demo account before risking real capital.
"""

from __future__ import annotations

import logging
import logging.handlers
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

try:
    import MetaTrader5 as mt5
except ImportError as exc:  # pragma: no cover - import guard
    raise ImportError(
        "The MetaTrader5 package is required. Install it with `pip install MetaTrader5`."
    ) from exc


# ---------------------------------------------------------------------------
# Configuration (overridable via environment variables)
# ---------------------------------------------------------------------------


def _env_float(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


def _env_int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


@dataclass
class Config:
    symbol: str = os.environ.get("MT5_SYMBOL", "XAUUSD")
    timeframe: int = mt5.TIMEFRAME_M15

    # Strategy
    ema_fast: int = _env_int("EMA_FAST", 21)
    ema_slow: int = _env_int("EMA_SLOW", 50)
    ema_trend: int = _env_int("EMA_TREND", 200)
    rsi_period: int = _env_int("RSI_PERIOD", 14)
    rsi_long_level: float = _env_float("RSI_LONG_LEVEL", 50.0)
    rsi_short_level: float = _env_float("RSI_SHORT_LEVEL", 50.0)
    atr_period: int = _env_int("ATR_PERIOD", 14)
    pullback_atr: float = _env_float("PULLBACK_ATR", 1.0)

    # Risk management
    risk_percent: float = _env_float("RISK_PERCENT", 0.5)  # percent of balance per trade
    stop_atr_mult: float = _env_float("STOP_ATR_MULT", 1.8)
    tp_atr_mult: float = _env_float("TP_ATR_MULT", 3.0)
    min_lot: float = _env_float("MIN_LOT", 0.01)
    max_lot: float = _env_float("MAX_LOT", 5.0)
    daily_loss_limit_pct: float = _env_float("DAILY_LOSS_LIMIT_PCT", 3.0)
    max_drawdown_pct: float = _env_float("MAX_DRAWDOWN_PCT", 15.0)
    max_trades_per_day: int = _env_int("MAX_TRADES_PER_DAY", 4)
    max_consec_losses: int = _env_int("MAX_CONSEC_LOSSES", 3)

    # Trade management
    use_breakeven: bool = os.environ.get("USE_BREAKEVEN", "1") == "1"
    use_trailing: bool = os.environ.get("USE_TRAILING", "1") == "1"
    trail_atr_mult: float = _env_float("TRAIL_ATR_MULT", 1.5)
    max_holding_bars: int = _env_int("MAX_HOLDING_BARS", 64)

    # Filters
    max_spread_points: int = _env_int("MAX_SPREAD_POINTS", 600)

    # Execution
    magic: int = _env_int("MAGIC_NUMBER", 234000)
    deviation: int = _env_int("DEVIATION_POINTS", 30)
    log_file: str = os.environ.get("LOG_FILE", "xauusd_bot.log")
    poll_seconds: int = _env_int("POLL_SECONDS", 15)


CFG = Config()


# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------


def setup_logger() -> logging.Logger:
    logger = logging.getLogger("xauusd_bot")
    logger.setLevel(logging.INFO)
    if logger.handlers:
        return logger
    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )
    file_handler = logging.handlers.RotatingFileHandler(
        CFG.log_file, maxBytes=5_000_000, backupCount=3
    )
    file_handler.setFormatter(formatter)
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    logger.addHandler(file_handler)
    logger.addHandler(console)
    return logger


log = setup_logger()


# ---------------------------------------------------------------------------
# Runtime state
# ---------------------------------------------------------------------------


@dataclass
class State:
    last_bar_time: Optional[pd.Timestamp] = None
    current_day: Optional[datetime] = None
    day_start_balance: float = 0.0
    peak_equity: float = 0.0
    trades_today: int = 0
    halted: bool = False


STATE = State()


# ---------------------------------------------------------------------------
# Connection
# ---------------------------------------------------------------------------


def connect() -> None:
    login = os.environ.get("MT5_LOGIN")
    password = os.environ.get("MT5_PASSWORD")
    server = os.environ.get("MT5_SERVER")

    if not mt5.initialize():
        raise SystemExit(f"MT5 initialise failed: {mt5.last_error()}")

    if login and password and server:
        if not mt5.login(login=int(login), password=password, server=server):
            mt5.shutdown()
            raise SystemExit(f"MT5 login failed: {mt5.last_error()}")

    if not mt5.symbol_select(CFG.symbol, True):
        log.warning("Could not select symbol %s in Market Watch.", CFG.symbol)

    log.info("Connected to MT5 terminal: %s", mt5.version())


# ---------------------------------------------------------------------------
# Indicators (vectorised, no external 'ta' dependency)
# ---------------------------------------------------------------------------


def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def _rsi(series: pd.Series, period: int) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    return (100.0 - (100.0 / (1.0 + rs))).fillna(50.0)


def _atr(df: pd.DataFrame, period: int) -> pd.Series:
    high_low = df["high"] - df["low"]
    high_close = (df["high"] - df["close"].shift()).abs()
    low_close = (df["low"] - df["close"].shift()).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False).mean()


def _macd(series: pd.Series):
    macd_line = _ema(series, 12) - _ema(series, 26)
    signal_line = _ema(macd_line, 9)
    return macd_line, signal_line


def fetch_data(bars: int = 400) -> Optional[pd.DataFrame]:
    rates = mt5.copy_rates_from_pos(CFG.symbol, CFG.timeframe, 0, bars)
    if rates is None or len(rates) == 0:
        log.error("No market data returned by MT5.")
        return None
    df = pd.DataFrame(rates)
    df["time"] = pd.to_datetime(df["time"], unit="s")
    df["ema_fast"] = _ema(df["close"], CFG.ema_fast)
    df["ema_slow"] = _ema(df["close"], CFG.ema_slow)
    df["ema_trend"] = _ema(df["close"], CFG.ema_trend)
    df["rsi"] = _rsi(df["close"], CFG.rsi_period)
    df["atr"] = _atr(df, CFG.atr_period)
    df["macd"], df["macd_signal"] = _macd(df["close"])
    return df


# ---------------------------------------------------------------------------
# Strategy
# ---------------------------------------------------------------------------


def get_signal(df: pd.DataFrame) -> int:
    """Return +1 (long), -1 (short) or 0 (flat) using the last CLOSED bar.

    Index -1 is the live/forming bar and is intentionally ignored. Index -2 is
    the last closed bar; index -3 is the bar before it.
    """
    if len(df) < max(CFG.ema_trend, 60) + 3:
        return 0

    cur = df.iloc[-2]
    prev = df.iloc[-3]
    atr = float(cur["atr"])
    if not np.isfinite(atr) or atr <= 0:
        return 0

    bullish = cur["close"] > cur["open"]
    bearish = cur["close"] < cur["open"]

    up_trend = (cur["ema_fast"] > cur["ema_slow"]) and (cur["close"] > cur["ema_trend"])
    long_momentum = (
        cur["rsi"] > CFG.rsi_long_level
        and cur["rsi"] >= prev["rsi"]
        and cur["macd"] > cur["macd_signal"]
    )
    long_pullback = (cur["low"] <= cur["ema_fast"] + CFG.pullback_atr * atr) and (
        cur["close"] > cur["ema_fast"]
    )
    if up_trend and long_momentum and long_pullback and bullish:
        return 1

    down_trend = (cur["ema_fast"] < cur["ema_slow"]) and (cur["close"] < cur["ema_trend"])
    short_momentum = (
        cur["rsi"] < CFG.rsi_short_level
        and cur["rsi"] <= prev["rsi"]
        and cur["macd"] < cur["macd_signal"]
    )
    short_pullback = (cur["high"] >= cur["ema_fast"] - CFG.pullback_atr * atr) and (
        cur["close"] < cur["ema_fast"]
    )
    if down_trend and short_momentum and short_pullback and bearish:
        return -1

    return 0


# ---------------------------------------------------------------------------
# Risk / sizing
# ---------------------------------------------------------------------------


def calculate_lot_size(stop_distance: float, balance: float, info) -> float:
    if stop_distance <= 0 or balance <= 0:
        return 0.0
    risk_amount = balance * (CFG.risk_percent / 100.0)
    if risk_amount <= 0:
        return 0.0

    tick_value = getattr(info, "trade_tick_value", 0.0)
    tick_size = getattr(info, "trade_tick_size", 0.0)
    if tick_value <= 0 or tick_size <= 0:
        return 0.0

    loss_per_lot = (stop_distance / tick_size) * tick_value
    if loss_per_lot <= 0:
        return 0.0

    lots = risk_amount / loss_per_lot

    step = getattr(info, "volume_step", 0.01) or 0.01
    lower = max(getattr(info, "volume_min", 0.01), CFG.min_lot)
    upper = min(getattr(info, "volume_max", CFG.max_lot), CFG.max_lot)

    lots = np.floor(lots / step) * step
    if lots < lower:
        # Refuse if the minimum lot would over-risk by more than 50 %.
        if loss_per_lot * lower > risk_amount * 1.5:
            return 0.0
        lots = lower
    if lots > upper:
        lots = upper
    return round(lots, 2)


def filling_mode(info) -> int:
    """Pick a filling mode the broker actually supports."""
    allowed = getattr(info, "filling_mode", 0)
    if allowed & mt5.SYMBOL_FILLING_FOK:
        return mt5.ORDER_FILLING_FOK
    if allowed & mt5.SYMBOL_FILLING_IOC:
        return mt5.ORDER_FILLING_IOC
    return mt5.ORDER_FILLING_RETURN


# ---------------------------------------------------------------------------
# Position helpers
# ---------------------------------------------------------------------------


def own_positions():
    positions = mt5.positions_get(symbol=CFG.symbol) or []
    return [p for p in positions if p.magic == CFG.magic]


def consecutive_losses_today() -> int:
    if STATE.current_day is None:
        return 0
    deals = mt5.history_deals_get(STATE.current_day, datetime.now(), group=CFG.symbol)
    if not deals:
        return 0
    closing = [
        d
        for d in deals
        if d.magic == CFG.magic and d.entry == mt5.DEAL_ENTRY_OUT
    ]
    closing.sort(key=lambda d: d.time)
    streak = 0
    for d in reversed(closing):
        pnl = d.profit + d.swap + d.commission
        if pnl < 0:
            streak += 1
        elif pnl > 0:
            break
    return streak


# ---------------------------------------------------------------------------
# Trade execution & management
# ---------------------------------------------------------------------------


def open_trade(direction: int) -> None:
    info = mt5.symbol_info(CFG.symbol)
    tick = mt5.symbol_info_tick(CFG.symbol)
    df = fetch_data()
    if info is None or tick is None or df is None:
        return
    atr = float(df.iloc[-2]["atr"])
    if atr <= 0:
        return

    stop_dist = atr * CFG.stop_atr_mult
    tp_dist = atr * CFG.tp_atr_mult
    min_stop = info.trade_stops_level * info.point
    if min_stop > 0:
        stop_dist = max(stop_dist, min_stop * 1.5)
        tp_dist = max(tp_dist, min_stop * 1.5)

    if direction > 0:
        order_type = mt5.ORDER_TYPE_BUY
        price = tick.ask
        sl = price - stop_dist
        tp = price + tp_dist
    else:
        order_type = mt5.ORDER_TYPE_SELL
        price = tick.bid
        sl = price + stop_dist
        tp = price - tp_dist

    digits = info.digits
    sl = round(sl, digits)
    tp = round(tp, digits)

    lots = calculate_lot_size(stop_dist, mt5.account_info().balance, info)
    if lots <= 0:
        log.info("Lot size resolved to zero; skipping trade.")
        return

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": CFG.symbol,
        "volume": lots,
        "type": order_type,
        "price": price,
        "sl": sl,
        "tp": tp,
        "deviation": CFG.deviation,
        "magic": CFG.magic,
        "comment": "XauusdTrendBot",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": filling_mode(info),
    }
    result = mt5.order_send(request)
    if result is None or result.retcode != mt5.TRADE_RETCODE_DONE:
        log.error("Order failed: %s", getattr(result, "comment", result))
        return
    STATE.trades_today += 1
    log.info(
        "%s %.2f lots @ %.2f SL=%.2f TP=%.2f (trade %d/%d today)",
        "BUY" if direction > 0 else "SELL",
        lots,
        price,
        sl,
        tp,
        STATE.trades_today,
        CFG.max_trades_per_day,
    )


def manage_positions() -> None:
    df = fetch_data()
    tick = mt5.symbol_info_tick(CFG.symbol)
    info = mt5.symbol_info(CFG.symbol)
    if df is None or tick is None or info is None:
        return
    atr = float(df.iloc[-2]["atr"])
    bar_seconds = 15 * 60  # M15 timeframe

    for pos in own_positions():
        # Time-based exit
        if CFG.max_holding_bars > 0:
            age = time.time() - pos.time
            if age >= CFG.max_holding_bars * bar_seconds:
                _close_position(pos, tick, info)
                continue

        if atr <= 0 or pos.sl in (None, 0):
            continue
        risk_dist = abs(pos.price_open - pos.sl)
        if risk_dist <= 0:
            continue

        if pos.type == mt5.ORDER_TYPE_BUY:
            profit_dist = tick.bid - pos.price_open
            new_sl = pos.sl
            if CFG.use_breakeven and profit_dist >= risk_dist and pos.sl < pos.price_open:
                new_sl = max(new_sl, pos.price_open)
            if CFG.use_trailing:
                trail = tick.bid - atr * CFG.trail_atr_mult
                if trail < tick.bid:
                    new_sl = max(new_sl, trail)
            if new_sl > pos.sl:
                _modify_sl(pos, round(new_sl, info.digits))
        else:
            profit_dist = pos.price_open - tick.ask
            new_sl = pos.sl
            if CFG.use_breakeven and profit_dist >= risk_dist and (
                pos.sl > pos.price_open or pos.sl == 0
            ):
                new_sl = pos.price_open if pos.sl == 0 else min(new_sl, pos.price_open)
            if CFG.use_trailing:
                trail = tick.ask + atr * CFG.trail_atr_mult
                if trail > tick.ask:
                    new_sl = trail if pos.sl == 0 else min(new_sl, trail)
            if pos.sl == 0 or new_sl < pos.sl:
                _modify_sl(pos, round(new_sl, info.digits))


def _modify_sl(pos, new_sl: float) -> None:
    request = {
        "action": mt5.TRADE_ACTION_SLTP,
        "symbol": CFG.symbol,
        "position": pos.ticket,
        "sl": new_sl,
        "tp": pos.tp,
        "magic": CFG.magic,
    }
    mt5.order_send(request)


def _close_position(pos, tick, info) -> None:
    close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
    price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask
    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": CFG.symbol,
        "volume": pos.volume,
        "type": close_type,
        "position": pos.ticket,
        "price": price,
        "deviation": CFG.deviation,
        "magic": CFG.magic,
        "comment": "Time exit",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": filling_mode(info),
    }
    mt5.order_send(request)


# ---------------------------------------------------------------------------
# Daily / drawdown protections
# ---------------------------------------------------------------------------


def reset_daily_state() -> None:
    acc = mt5.account_info()
    STATE.current_day = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    STATE.day_start_balance = acc.balance if acc else 0.0
    STATE.trades_today = 0
    STATE.halted = False


def drawdown_exceeded() -> bool:
    if CFG.max_drawdown_pct <= 0 or STATE.peak_equity <= 0:
        return False
    equity = mt5.account_info().equity
    dd = (STATE.peak_equity - equity) / STATE.peak_equity * 100.0
    return dd >= CFG.max_drawdown_pct


def daily_loss_exceeded() -> bool:
    if CFG.daily_loss_limit_pct <= 0 or STATE.day_start_balance <= 0:
        return False
    equity = mt5.account_info().equity
    loss = STATE.day_start_balance - equity
    return loss >= STATE.day_start_balance * (CFG.daily_loss_limit_pct / 100.0)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def main() -> None:
    if sys.version_info < (3, 9):
        log.warning("This bot is designed for Python 3.9+.")
    connect()
    reset_daily_state()
    STATE.peak_equity = mt5.account_info().equity
    log.info("Starting XAUUSD trend bot on %s.", CFG.symbol)

    while True:
        try:
            acc = mt5.account_info()
            if acc is None:
                log.error("No account info; reconnecting…")
                mt5.shutdown()
                time.sleep(10)
                connect()
                continue

            now = datetime.now()
            if STATE.current_day is None or now.date() != STATE.current_day.date():
                reset_daily_state()

            STATE.peak_equity = max(STATE.peak_equity, acc.equity)

            # Manage open trades every loop (trailing, break-even, time exit).
            manage_positions()

            # Only evaluate entries once per newly closed bar.
            df = fetch_data()
            if df is None or len(df) < 5:
                time.sleep(CFG.poll_seconds)
                continue
            closed_bar_time = df.iloc[-2]["time"]
            if STATE.last_bar_time is not None and closed_bar_time == STATE.last_bar_time:
                time.sleep(CFG.poll_seconds)
                continue
            STATE.last_bar_time = closed_bar_time

            if STATE.halted:
                time.sleep(CFG.poll_seconds)
                continue
            if drawdown_exceeded():
                STATE.halted = True
                log.warning("Max drawdown exceeded; halting for the day.")
                time.sleep(CFG.poll_seconds)
                continue
            if daily_loss_exceeded():
                STATE.halted = True
                log.warning("Daily loss limit reached; pausing for the day.")
                time.sleep(CFG.poll_seconds)
                continue
            if STATE.trades_today >= CFG.max_trades_per_day:
                time.sleep(CFG.poll_seconds)
                continue
            if CFG.max_consec_losses > 0 and consecutive_losses_today() >= CFG.max_consec_losses:
                time.sleep(CFG.poll_seconds)
                continue
            if own_positions():
                time.sleep(CFG.poll_seconds)
                continue

            spread = mt5.symbol_info(CFG.symbol).spread
            if CFG.max_spread_points > 0 and spread > CFG.max_spread_points:
                log.info("Spread %d exceeds limit; skipping bar.", spread)
                time.sleep(CFG.poll_seconds)
                continue

            signal = get_signal(df)
            if signal != 0:
                open_trade(signal)

            time.sleep(CFG.poll_seconds)
        except Exception:  # pragma: no cover - keep the loop alive
            log.exception("Unhandled error in main loop.")
            time.sleep(CFG.poll_seconds)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("Bot terminated by user.")
    finally:
        mt5.shutdown()
