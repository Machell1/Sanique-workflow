# CLAW — Commonwealth Legal Automation Workflow

Desktop platform for the Court of Appeal, Jamaica. React + Electron + SQLite,
packaged as a one-click NSIS installer for Windows 10/11.

## Modules

| Module        | What it does                                                          |
| ------------- | --------------------------------------------------------------------- |
| Dashboard     | Truth-field snapshot — KPI strip, upcoming hearings, audit ledger     |
| Schedule      | Court calendar with three terms and four rosters                      |
| Upload        | SHA-256 sealed multi-format ingestion (PDF, DOCX, XLSX, PPTX, TXT)    |
| File cabinet  | Cases grouped by status, with their attached documents                |
| Agent         | KIMI CLAW chat (bring your own Anthropic or OpenAI key)               |
| Verification  | Heuristic citation parser + Truth Harness scoring                     |
| Workflow      | Five-stage Kanban: intake → review → drafting → verification → delivery |
| Generator     | Memo / advice / judgment / order templates with inline editor          |
| Audit         | Immutable hash-chained ledger with integrity verification             |
| Settings      | AI provider, compliance thresholds, integrations, users, data path   |

## End-user installation

Download `release/CLAW-Setup-2.1.0.exe` and double-click. The installer
prompts for an install location, places shortcuts on the Desktop and Start
Menu, and creates an entry in *Apps & features* for clean uninstall.

The installer is unsigned. On first launch, Windows SmartScreen will warn
*"Windows protected your PC"* — click **More info → Run anyway** to proceed.

All data lives at `%APPDATA%\CLAW\claw-data\` (SQLite database + a `files/`
vault). Nothing leaves the machine unless you configure an AI provider.

## Developer setup

```powershell
npm install --ignore-scripts          # native deps build for Electron, not Node
npx electron-builder install-app-deps  # rebuild better-sqlite3 against Electron 30
npm run dev                            # Vite + Electron, hot reload
```

`--ignore-scripts` is needed because `better-sqlite3`'s post-install build
targets the local Node runtime, but at runtime we need it built against
Electron's bundled Node. `electron-builder install-app-deps` handles that.

## Building the installer

```powershell
npm run dist
```

This runs `prefetch:wincodesign` (a Python helper that pre-extracts the
electron-builder code-signing tools, working around a Windows symlink-
permission issue when not running as admin), then `vite build`, then
`electron-builder --win nsis --x64`. Output lands in `release/`.

`prefetch:wincodesign` requires Python 3 with `py7zr`:

```powershell
pip install py7zr
```

## Architecture notes

- **Frontend**: React 18, TypeScript 5, Vite 5, Tailwind 3, Tanstack Query 5,
  React Router 6, Zustand. Strict CSP — no inline scripts, no remote network
  except Google Fonts and (optionally) AI providers.
- **Renderer ↔ main**: a single `claw:invoke` IPC channel with a typed
  router (`electron/ipc/index.cjs`). Every renderer-visible function returns
  `{ ok: true, data } | { ok: false, error }`.
- **Persistence**: `better-sqlite3` (synchronous, fast). Schema lives in
  `electron/db/schema.sql`; seeded on first run with sample cases / events.
- **Audit**: every write goes through `electron/services/audit.cjs`, which
  appends a SHA-256 hash-chained entry. The Audit module re-derives every
  hash on load to detect tampering.
- **AI provider**: `electron/ipc/agent.cjs` proxies to Anthropic or OpenAI
  HTTP APIs. The API key is stored in the local SQLite `settings` table and
  masked in the UI.

## Repository layout

```
build/              electron-builder resources (icon, NSIS hooks, license)
electron/           main process, preload bridge, SQLite, IPC handlers
public/             static assets (logo, empty-state SVGs)
scripts/            build helpers (icon generator, winCodeSign prefetch)
src/                React frontend (pages, components, hooks)
release/            installer output (gitignored)
legacy/             prior dist/ + bash launchers, kept for reference
```
