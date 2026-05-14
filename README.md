# Sanique's workspace

Personal case-management workspace. React + Electron + SQLite, packaged
as a one-click NSIS installer for Windows 10/11.

## Modules

| Module        | What it does                                                          |
| ------------- | --------------------------------------------------------------------- |
| Dashboard     | Truth-field snapshot — KPI strip, upcoming hearings, audit ledger     |
| Search        | SQLite FTS5 across cases, filenames, drafts, AI chats, audit          |
| Schedule      | Calendar with three terms and four rosters                            |
| Upload        | SHA-256 sealed multi-format ingestion (PDF, DOCX, XLSX, PPTX, TXT)    |
| File cabinet  | Cases grouped by status, with their attached documents + bundles      |
| Agent         | AI chat — Anthropic / OpenAI / Google Gemini / Mistral / Ollama / any OpenAI-compatible endpoint |
| Verification  | Heuristic citation parser + Truth Harness scoring                     |
| Workflow      | Five-stage Kanban: intake → review → drafting → verification → delivery |
| Generator     | Memo / advice / judgment / order templates with inline Markdown editor |
| Audit         | Immutable hash-chained ledger with integrity verification             |
| Settings      | AI provider, compliance thresholds, integrations, users, data path   |

## End-user installation

Download the latest `Saniques-Workspace-Setup-*.exe` from the
[Releases page](https://github.com/Machell1/Sanique-workflow/releases)
and double-click. The installer prompts for an install location,
places shortcuts on the Desktop and Start Menu, and creates an entry
in *Apps & features* for clean uninstall.

The installer is unsigned. On first launch, Windows SmartScreen will
warn *"Windows protected your PC"* — click **More info → Run anyway**.

All data lives at `%APPDATA%\Sanique's workspace\workspace-data\`
(SQLite database + a `files/` vault + an `agent_keys/` Ed25519 keypair
per user). If you previously installed CLAW, your data is automatically
migrated from `%APPDATA%\CLAW\claw-data\` on first launch.

## Developer setup

```powershell
npm install --ignore-scripts          # native deps build for Electron, not Node
npx electron-builder install-app-deps  # rebuild better-sqlite3 against Electron 30
npm run dev                            # Vite + Electron, hot reload
```

## Building the installer

```powershell
npm run dist
```

Produces `release/Saniques-Workspace-Setup-*.exe`.

`prefetch:wincodesign` requires Python 3 with `py7zr` (one-off workaround
for the Windows-non-admin symlink limitation in electron-builder's
signing-tool extraction):

```powershell
pip install py7zr
```

## End-to-end QA

```powershell
npm run qa
```

Runs `scripts/qa-harness.cjs` — 76 checks against a fresh database
covering every IPC handler. Wired to use the installed app binary so
the better-sqlite3 ABI matches.

## AI providers

The workspace ships with **zero AI lock-in**. Pick any of:

| Provider | Endpoint | Key needed |
|---|---|---|
| Anthropic Claude | `https://api.anthropic.com` | Yes |
| OpenAI | `https://api.openai.com/v1` | Yes |
| Google Gemini | `https://generativelanguage.googleapis.com` | Yes |
| Mistral | `https://api.mistral.ai/v1` | Yes |
| Ollama (local) | `http://localhost:11434` | No |
| OpenAI-compatible | any URL ending in `/v1` (Groq, OpenRouter, LM Studio, vLLM, LocalAI, DeepSeek, Together…) | depends on host |

Configure in **Settings → AI provider**. The API key is stored locally
in the SQLite settings table and masked in the UI.

## Architecture notes

- **Frontend**: React 18, TypeScript 5, Vite 5, Tailwind 3, Tanstack
  Query 5, React Router 6, Zustand. Strict CSP — no inline scripts.
- **Renderer ↔ main**: a single `claw:invoke` IPC channel with a typed
  router (`electron/ipc/index.cjs`). Every renderer-visible function
  returns `{ ok: true, data } | { ok: false, error }`.
- **Persistence**: `better-sqlite3` (synchronous, fast). Schema lives
  in `electron/db/schema.sql`; seeded on first run.
- **Audit**: every write goes through `electron/services/audit.cjs`,
  which appends a SHA-256 hash-chained entry. The Audit module
  re-derives every hash on load to detect tampering.
- **AI provider**: `electron/ipc/agent.cjs` proxies to six provider
  families; the active selection lives in the local SQLite `settings`
  table.

## Repository layout

```
build/              electron-builder resources (icon, NSIS hooks, license)
electron/           main process, preload bridge, SQLite, IPC handlers
public/             static assets (logo, empty-state SVGs)
scripts/            build helpers (icon, prefetch, qa-harness)
src/                React frontend (pages, components, hooks)
release/            installer output (gitignored)
legacy/             prior dist/ + bash launchers, kept for reference
```
