"""Thin, dependency-free Anthropic (Claude) client used by the manager agent.

Optional: if ANTHROPIC_API_KEY is not set, callers fall back to a deterministic
rule. We keep this tiny (urllib only) so the fund has no extra dependencies.
"""
from __future__ import annotations

import json
import os
import urllib.request
import urllib.error

API_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-5")


def is_enabled() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def ask_json(system: str, user: str, *, max_tokens: int = 800, model: str | None = None):
    """Send a prompt to Claude and parse a JSON object from the reply.

    Returns the parsed dict, or None on any failure (missing key, network,
    non-JSON). Callers MUST handle None with a deterministic fallback.
    """
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    body = {
        "model": model or DEFAULT_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            payload = json.loads(resp.read().decode())
        text = "".join(part.get("text", "") for part in payload.get("content", []))
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError):
        return None
    return None
