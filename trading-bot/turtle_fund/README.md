# Turtle Fund — agentic trend-following loop

A small multi-agent system that runs and manages a Turtle (Donchian breakout)
trend-following "fund" in a loop. It dynamically scores instruments for trend
quality, lets a manager (Claude, optional) decide what to enable and how much
risk to take, enforces hard portfolio caps, and executes the full Turtle on the
chosen markets.

It runs in **paper mode over real historical data** (reproducible, honest — no
real orders). Live mode is a documented stub because it needs a running MT5
terminal, which isn't available in this environment.

```
SelectionAgent → ManagerAgent (Claude/fallback) → RiskAgent → Execution (Turtle)
       └──────────────────────── fund loop (per trading day) ───────────────────┘
```

## Agents

- **SelectionAgent** (`selection.py`) — ranks the universe by trend quality using
  only past data: Kaufman Efficiency Ratio (trendiness) × volatility-adjusted
  momentum (trend strength). Returns a shortlist.
- **ManagerAgent** (`agents.py`) — the "Claude runs the fund" layer. If
  `ANTHROPIC_API_KEY` is set it asks Claude (JSON in/out) which shortlisted
  symbols to enable and a risk multiplier, logging the rationale. With no key it
  uses a transparent deterministic fallback. It can only be *more* conservative
  than the RiskAgent.
- **RiskAgent** (`agents.py`) — hard, non-negotiable caps: max total units, max
  per direction, and a catastrophe drawdown halt.
- **Execution** (`strategy.py`) — the full Turtle per symbol: breakout entry,
  pyramiding to 4 units, 2N stop that ratchets with each add, trailing
  opposite-channel exit.

## Run it

```bash
cd trading-bot
python -m turtle_fund.run_fund --mode paper            # System 2 (55/20), default
python -m turtle_fund.run_fund --mode paper --system 1 # System 1 (20/10)
```

Requires the cached data (`python backtest/fetch_data.py` first) and
`pandas`/`numpy`. Outputs `equity_curve.csv`, `trades.csv`, `decisions.jsonl` and
`summary.json` to `turtle_fund/runs/<timestamp>/`.

### Enable the Claude manager

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export CLAUDE_MODEL=claude-sonnet-4-5   # optional; pick a model you have access to
python -m turtle_fund.run_fund --mode paper
```

The header prints whether the Claude manager is `ENABLED` or `DISABLED`.

## What the research actually showed (read this)

I built this to honour the request — "pick the best symbol pairs and only trade
those" — and then tested it on real daily data (15 FX/metal/index/crypto markets,
~2.9 years). The results were instructive and are **not** a success story:

1. **Aggressive symbol selection BACKFIRES.** Picking the top few highest-trend
   symbols and trading only those returned **−29%** (8 trades) versus **+159%**
   for trading the whole basket. High trailing trend-quality means the move
   mostly already happened, so the fund chases tops and starves itself of trades.
   Turtle's edge is **diversification across many breakouts**, not concentration.
2. **De-risking / halting during drawdowns guts trend-following.** A 25% hard
   halt turned a +274% run into −12%; it locks you out exactly when the next
   trend (and the recovery) arrives. The default now holds risk steady and only
   halts on a catastrophe (40%).
3. **With sound defaults** (broad diversified universe, 0.5% risk/unit, loose
   trendiness gate, no mid-drawdown de-risk), the fund is **modestly positive
   in-sample but with large drawdowns**, and out-of-sample is weak/mixed:

   | Universe | Full period | Out-of-sample (from 2025-09) |
   | --- | --- | --- |
   | All 15 | +31%, **40% DD**, PF 1.21 | −6%, 41% DD, PF 0.87 |
   | Trenders (BTC/ETH/XAU/XAG/SPX/NDX) | +15%, 32% DD | +37%, PF 2.31 (only 19 trades) |

### Honest verdict

This is a **legitimate framework**, not a money printer. On this data the Turtle
fund captures trends in trending regimes but pays for it with **30–40%
drawdowns**, the results are **regime-dependent** (2024–25 was a strong
crypto/gold/equity bull), and the **out-of-sample samples are tiny and mixed** —
not enough to claim a durable edge. The numbers also move noticeably with the
risk knobs, which is itself a warning about fragility. Treat it as a research
sandbox. Before risking money you would need: a broader/longer dataset, real
broker costs, and an honest walk-forward that survives out-of-sample — none of
which this 2.9-year, single-source study can deliver on its own.
