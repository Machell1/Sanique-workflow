"""One-off MANUAL.md rebrand. Run once after the v2.7.0 rename."""
import re
from pathlib import Path

p = Path(__file__).resolve().parent.parent / "MANUAL.md"
text = p.read_text(encoding="utf-8")

# Order matters — longer phrases first.
subs = [
    ("CLAW — User Manual", "Sanique's workspace — User Manual"),
    ("**Commonwealth Legal Automation Workflow Platform**", "**Personal case-management workspace**"),
    ("Court of Appeal, Jamaica · Version 2.6.1", "Personal · Version 2.7.0"),
    ("Court of Appeal, Jamaica · CLAW v2.6.1", "Sanique's workspace v2.7.0"),
    ("Court of Appeal, Jamaica", "Sanique Richards"),
    ("KIMI CLAW", "the AI assistant"),
    ("Agent — KIMI CLAW", "Agent"),
    ("KIMI's", "the assistant's"),
    ("KIMI", "the AI assistant"),
    ("CLAW —", "The workspace —"),
    ("CLAW will", "The workspace will"),
    ("CLAW does", "The workspace does"),
    ("CLAW keeps", "The workspace keeps"),
    ("CLAW asks", "The workspace asks"),
    ("CLAW reads", "The workspace reads"),
    ("CLAW writes", "The workspace writes"),
    ("CLAW uses", "The workspace uses"),
    ("CLAW computes", "The workspace computes"),
    ("CLAW falls", "The workspace falls"),
    ("CLAW only", "The workspace only"),
    ("CLAW also", "The workspace also"),
    ("CLAW prepends", "The workspace prepends"),
    ("CLAW signs", "The workspace signs"),
    ("CLAW handles", "The workspace handles"),
    ("CLAW into", "the workspace into"),
    ("CLAW on", "the workspace on"),
    ("CLAW in", "the workspace in"),
    ("CLAW the", "the workspace's the"),
    ("CLAW.lnk", "Sanique's workspace.lnk"),
    ("CLAW v2", "Sanique's workspace v2"),
    ("CLAW-Setup-", "Saniques-Workspace-Setup-"),
    ("CLAW`", "the workspace`"),  # inside backticks
    ("\\bCLAW's\\b", "the workspace's"),
    ("\\bCLAW\\b", "the workspace"),
    ("`%APPDATA%\\\\CLAW\\\\claw-data\\\\`", "`%APPDATA%\\\\Sanique's workspace\\\\workspace-data\\\\`"),
    ("`C:\\\\Users\\\\<you>\\\\AppData\\\\Roaming\\\\CLAW\\\\claw-data\\\\`",
     "`C:\\\\Users\\\\<you>\\\\AppData\\\\Roaming\\\\Sanique's workspace\\\\workspace-data\\\\`"),
    ("Open this folder from inside the app: **Settings → Data\nlocation → Open in File Explorer**.",
     "Open this folder from inside the app: **Settings → Data\nlocation → Open in File Explorer**. (Workspace upgrades from CLAW migrate the old `claw-data` folder here on first launch.)"),
]

for pattern, replacement in subs:
    if pattern.startswith("\\b"):
        text = re.sub(pattern, replacement, text)
    else:
        text = text.replace(pattern, replacement)

# Targeted: AI provider section needs an update for new providers.
old_ai = """1. Settings → **AI provider** tab.
2. Pick **Anthropic Claude** (recommended) or **OpenAI**."""
new_ai = """1. Settings → **AI provider** tab.
2. Pick a provider — **Anthropic Claude**, **OpenAI**, **Google Gemini**, **Mistral**, **Ollama** (local), or any **OpenAI-compatible** endpoint (Groq, OpenRouter, LM Studio, vLLM, LocalAI, DeepSeek, Together, etc.)."""
text = text.replace(old_ai, new_ai)

p.write_text(text, encoding="utf-8")
print(f"Rewrote {p}")
