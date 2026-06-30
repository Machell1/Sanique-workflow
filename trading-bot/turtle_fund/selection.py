"""Selection agent: pick the best-trending instruments to trade, causally.

Turtle only pays on markets that actually trend, so the fund trades *only* the
instruments that score highest on trend quality over a trailing window:

  * Kaufman Efficiency Ratio (ER) = |net change| / sum(|bar-to-bar change|).
    1.0 = a perfectly straight trend, ~0 = pure chop. This is the trendiness gate.
  * Volatility-adjusted momentum = |net change| / (ATR-like daily vol x sqrt(window)),
    i.e. how many "sigmas" the move is. This ranks how strong the trend is.

Both use ONLY bars at/, before the as-of date (no look-ahead). The agent returns
a ranked shortlist; the manager decides which of them to actually enable.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Candidate:
    symbol: str
    er: float
    mom_sigma: float
    direction: int
    score: float


class SelectionAgent:
    def __init__(self, window: int = 100, min_er: float = 0.30, top_k: int = 5):
        self.window = window
        self.min_er = min_er
        self.top_k = top_k

    def rank(self, dfs: dict, asof) -> list[Candidate]:
        asof = np.datetime64(asof)
        cands: list[Candidate] = []
        w = self.window
        for sym, df in dfs.items():
            times = df["time"].to_numpy()
            mask = times <= asof
            idx = np.where(mask)[0]
            if len(idx) < w + 5:
                continue
            i = idx[-1]
            close = df["close"].to_numpy(float)
            seg = close[i - w : i + 1]
            net = seg[-1] - seg[0]
            path = np.sum(np.abs(np.diff(seg)))
            if path <= 0:
                continue
            er = abs(net) / path
            rets = np.diff(seg)
            vol = np.std(rets) * np.sqrt(w)
            mom_sigma = abs(net) / vol if vol > 0 else 0.0
            score = er * mom_sigma
            cands.append(Candidate(sym, er, mom_sigma, int(np.sign(net)) or 1, score))

        cands = [c for c in cands if c.er >= self.min_er]
        cands.sort(key=lambda c: c.score, reverse=True)
        return cands[: self.top_k]
