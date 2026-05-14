import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Sparkles, ShieldCheck, FolderOpen, Calendar, Upload as UploadIcon,
  GitBranch, FileText, ScanLine, Bot, History, Settings as SettingsIcon,
  Search as SearchIcon, BookOpen, KeyRound, Boxes, MessageSquare,
  LifeBuoy, ChevronRight, Layers, Mail, PenSquare,
} from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';

interface VersionInfo {
  version: string;
  dataDir: string;
}

export function Help() {
  const version = useQuery<VersionInfo>({
    queryKey: ['app', 'version'],
    queryFn: async (): Promise<VersionInfo> => ({
      version: typeof window !== 'undefined' && window.claw ? await window.claw.app.version() : '',
      dataDir: typeof window !== 'undefined' && window.claw ? await window.claw.app.dataDir() : '',
    }),
  });

  return (
    <>
      <PageHeader
        title="Welcome to Sanique's workspace"
        subtitle="Everything you need to know on one page. Bookmark this — it's always here."
        actions={
          version.data?.version ? (
            <Badge tone="gilt">v{version.data.version}</Badge>
          ) : null
        }
      />

      <PageBody className="space-y-6 max-w-5xl">
        {/* What this is */}
        <Card>
          <p className="text-sm text-obsidian-100 leading-relaxed">
            This is a private, offline-first workspace for managing case work — research,
            drafting, scheduling, audit, signing — without the data leaving your computer.
            Everything lives inside one Windows app, backed by a local SQLite database and a
            cryptographically chained audit log. AI is optional; if you turn it on, you pick
            the provider.
          </p>
        </Card>

        {/* First 10 minutes */}
        <Card title="First 10 minutes" subtitle="Do these once, in this order">
          <ol className="space-y-3 text-sm text-obsidian-100">
            <li className="flex gap-3">
              <span className="bg-gilt-500/20 text-gilt-200 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold shrink-0">1</span>
              <div>
                <strong>Confirm your name.</strong> Open{' '}
                <Link to="/settings" className="text-gilt-300 underline">Settings → Users</Link>.
                You ship as <em>Sanique Richards</em>. Edit or add other users; click <em>Switch</em>
                to set whose name lands on the audit log going forward.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="bg-gilt-500/20 text-gilt-200 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold shrink-0">2</span>
              <div>
                <strong>(Optional) Set up the AI assistant.</strong> Open{' '}
                <Link to="/settings" className="text-gilt-300 underline">Settings → AI provider</Link>.
                Pick a provider, paste an API key, save. Six provider families are supported
                — see the table further down on this page.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="bg-gilt-500/20 text-gilt-200 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold shrink-0">3</span>
              <div>
                <strong>Note where your data lives.</strong> Open{' '}
                <Link to="/settings" className="text-gilt-300 underline">Settings → Data location</Link>.
                Add that folder to your backup routine (OneDrive, an external drive,
                whatever you use). Everything you save in this app lives in that one folder.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="bg-gilt-500/20 text-gilt-200 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold shrink-0">4</span>
              <div>
                <strong>File your first case.</strong> Open{' '}
                <Link to="/cabinet" className="text-gilt-300 underline">File Cabinet → New case</Link>.
                Type a case number, title, parties; click <em>Create case</em>. Then
                upload supporting documents from the{' '}
                <Link to="/upload" className="text-gilt-300 underline">Upload</Link> page —
                every file is SHA-256 sealed on its way into the vault.
              </div>
            </li>
          </ol>
        </Card>

        {/* The modules */}
        <Card title="The eleven modules" subtitle="What each entry on the left sidebar does">
          <ul className="space-y-2.5">
            <ModuleRow icon={<Sparkles />} to="/" name="Dashboard" desc="Truth-field snapshot — KPI strip, upcoming hearings, overdue work, audit ledger preview." />
            <ModuleRow icon={<SearchIcon />} to="/search" name="Search" desc="Global FTS5 search across cases, document filenames, indexed PDF/DOCX body text, drafts, AI conversations, audit. Ctrl+K from anywhere." />
            <ModuleRow icon={<Calendar />} to="/schedule" name="Schedule" desc="Month-grid calendar across three terms × four rosters. Click a day or a coloured chip to add or edit an event." />
            <ModuleRow icon={<UploadIcon />} to="/upload" name="Upload" desc="Pick PDFs, Word docs, spreadsheets, images. Categorise, link to a case, click File. Each file is hashed before storage; text is extracted in the background for search." />
            <ModuleRow icon={<FolderOpen />} to="/cabinet" name="File Cabinet" desc="Cases grouped by status. Pencil to edit, status dropdown to move them through open / reserved / judgment pending / closed. Documents render in-app via the eye icon. Bundles assemble from this page too." />
            <ModuleRow icon={<Bot />} to="/agent" name="Agent" desc="Chat with the AI assistant. Linking a thread to a case gives the assistant a structured brief on every message (metadata + indexed document excerpts)." />
            <ModuleRow icon={<ShieldCheck />} to="/verification" name="Verification" desc="Paste text; the parser pulls out citations and scores each one against the Truth Harness (100% / 99% / 98% / <98%). Override a parser score or add citations manually if needed." />
            <ModuleRow icon={<GitBranch />} to="/workflow" name="Workflow" desc="Five-stage Kanban — intake → review → drafting → verification → delivery. Hover a card to advance / retreat / edit / block / delete." />
            <ModuleRow icon={<FileText />} to="/generator" name="Generator" desc="Memo / advice / judgment / order templates. Split-pane Markdown editor with bold / italic / headings / lists / blockquote. Export to plain text, Word, or print. Sign drafts cryptographically; every save snapshots the body so version history is one click away." />
            <ModuleRow icon={<History />} to="/audit" name="Audit" desc="Immutable hash-chained record of every create, update, delete, sign and export. Integrity is verified on every load — green means intact, red means tampering somewhere." />
            <ModuleRow icon={<SettingsIcon />} to="/settings" name="Settings" desc="AI provider, compliance thresholds, integrations, user directory, data location. AI key is stored locally and masked." />
          </ul>
        </Card>

        {/* AI providers */}
        <Card title="AI providers" subtitle="Bring your own model — no lock-in">
          <p className="text-sm text-obsidian-200 mb-3">
            The Agent module talks to whichever provider you configure. None of them is
            mandatory; the rest of the workspace runs fine with AI disabled. Set the
            provider in <Link to="/settings" className="text-gilt-300 underline">Settings → AI provider</Link>.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-obsidian-300">
                <tr>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Endpoint</th>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <ProviderRow name="Anthropic Claude" endpoint="api.anthropic.com" key_="Yes" note="Get one at console.anthropic.com" />
                <ProviderRow name="OpenAI" endpoint="api.openai.com/v1" key_="Yes" note="Get one at platform.openai.com" />
                <ProviderRow name="Google Gemini" endpoint="generativelanguage.googleapis.com" key_="Yes" note="Get one at aistudio.google.com" />
                <ProviderRow name="Mistral" endpoint="api.mistral.ai/v1" key_="Yes" note="Get one at console.mistral.ai" />
                <ProviderRow name="Ollama (local)" endpoint="localhost:11434" key_="No" note="Run `ollama serve` locally; pull a model with `ollama pull`" />
                <ProviderRow name="OpenAI-compatible" endpoint="any /v1 URL you supply" key_="depends" note="Groq, OpenRouter, LM Studio, vLLM, LocalAI, DeepSeek, Together…" />
              </tbody>
            </table>
          </div>
        </Card>

        {/* Common workflows */}
        <Card title="Common workflows" subtitle="The everyday loop">
          <div className="space-y-5 text-sm text-obsidian-100">
            <Flow title="Open a new case end-to-end" steps={[
              <>File Cabinet → <em>New case</em>. Fill the form, create.</>,
              <>Upload → drag-and-drop or pick the founding documents. Tick the new case as the linked case, give them a category, file.</>,
              <>Workflow → <em>New task</em>. Title it (e.g. <em>Index transcripts</em>), assign, due date. Repeat for the obvious next pieces of work.</>,
              <>Schedule → <em>New event</em>. Book any hearing or case-management date.</>,
            ]} />
            <Flow title="Draft a judgment" steps={[
              <>Generator → <em>New draft</em>. Pick the <em>Draft Reasons for Judgment</em> template; link it to the case.</>,
              <>Write the body in Markdown. Use the toolbar for bold / italic / headings / lists / blockquotes, or type the syntax directly.</>,
              <>Click <em>Save changes</em> often — every body change snapshots a version. Use the history icon to scroll back or diff.</>,
              <>Run Verification on a passage to score every citation in it. Override any parser miss.</>,
              <>When you're done, click the pen-square (Sign) icon to cryptographically sign the draft. The draft moves to <em>final</em>.</>,
              <>Click the document icon to export as Word, the printer for hard copy, the mail icon to draft an email.</>,
            ]} />
            <Flow title="Assemble a bundle" steps={[
              <>File Cabinet → pick the case → Bundles card → <em>Assemble bundle</em>.</>,
              <>Tick the PDFs to include and reorder them with the up/down arrows.</>,
              <>Type a title (defaults to <em>Record of Appeal — {'<case number>'}</em>); click <em>Build bundle</em>.</>,
              <>The merged PDF — with a cover page and table of contents — appears as a new sealed document in the case.</>,
            ]} />
            <Flow title="Verify everything is still intact" steps={[
              <>Audit → check the integrity card at the top. Green <em>INTACT</em> = the chain has not been tampered with.</>,
              <>File Cabinet → open any document → click the shield-? icon. Confirms the file on disk still matches its stored SHA-256 seal.</>,
            ]} />
          </div>
        </Card>

        {/* Keyboard shortcuts */}
        <Card title="Keyboard shortcuts">
          <ul className="space-y-2 text-sm">
            <Shortcut keys="Ctrl + K" desc="Jump to global search from anywhere" />
            <Shortcut keys="Ctrl + B" desc="Bold the selected text in the Generator" />
            <Shortcut keys="Ctrl + I" desc="Italicise the selected text in the Generator" />
            <Shortcut keys="Ctrl + Enter" desc="Send a message in the Agent" />
            <Shortcut keys="Esc" desc="Close any open dialog or the document viewer" />
          </ul>
        </Card>

        {/* Data + backups */}
        <Card title="Your data — where it lives, how to back it up">
          <div className="space-y-3 text-sm text-obsidian-100">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-obsidian-300 mb-0.5">Workspace folder</div>
              <code className="text-xs text-gilt-200 break-all">
                {version.data?.dataDir || "%APPDATA%\\Sanique's workspace\\workspace-data\\"}
              </code>
            </div>
            <p>
              That one folder contains the SQLite database (cases, drafts, workflow, audit,
              signatures), the file vault (every uploaded document, byte-for-byte), and your
              private signing key. Back it up by copying it.
            </p>
            <p>
              <strong>Daily routine:</strong> close the app, copy the folder, re-open. The
              close step ensures the SQLite write-ahead log has flushed.
            </p>
            <p>
              <strong>Moving to a new machine:</strong> install this same app on the new
              machine, replace the empty workspace-data folder with your backup, open the app.
              All your data appears.
            </p>
          </div>
        </Card>

        {/* Security / privacy */}
        <Card title="Privacy" subtitle="What leaves the machine, and what doesn't">
          <ul className="space-y-2 text-sm text-obsidian-100">
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-truth-verified mt-0.5 shrink-0" />
              <span><strong>Nothing</strong> leaves your computer by default. Documents, drafts, signatures, audit log — all of it lives on disk only.</span>
            </li>
            <li className="flex items-start gap-2">
              <Bot className="w-4 h-4 text-gilt-300 mt-0.5 shrink-0" />
              <span><strong>The AI assistant is the one exception.</strong> When you send a message to a configured provider, the message + your case context goes over HTTPS to that provider. Use the Ollama option for a local model that never leaves the machine.</span>
            </li>
            <li className="flex items-start gap-2">
              <Mail className="w-4 h-4 text-obsidian-200 mt-0.5 shrink-0" />
              <span><strong>Email export</strong> writes a .eml file to your temp folder and opens it in your default mail client. The app never sees the recipient or the sent message.</span>
            </li>
          </ul>
        </Card>

        {/* Troubleshooting */}
        <Card title="Troubleshooting" subtitle="When something looks wrong">
          <ul className="space-y-3 text-sm">
            <Tip title="SmartScreen warned on first launch">
              The installer is unsigned. Windows shows <em>"Windows protected your PC"</em>. Click <strong>More info → Run anyway</strong>. This happens once per install.
            </Tip>
            <Tip title='The Audit module says "BROKEN"'>
              The audit chain detected a hash mismatch. Stop using the app, copy the data folder to safety, and inspect entries either side of the break in a SQLite browser. The chain is tamper-evident by construction — a "broken" reading is meaningful.
            </Tip>
            <Tip title="The Agent says no provider is selected">
              Go to <Link to="/settings" className="text-gilt-300 underline">Settings → AI provider</Link>, pick one, paste a key, save. Re-open the Agent.
            </Tip>
            <Tip title="A PDF won't open in the viewer">
              Check the badge in the viewer header. <em>not indexed</em> means the text extractor couldn't read it (encrypted PDF, image-only scan). The file is still viewable; it just won't be findable by phrase search until you re-upload an unprotected version.
            </Tip>
            <Tip title="Re-install / upgrade">
              Download the latest installer from the Releases page on GitHub and run it. Your data folder is preserved; the upgrade migrates schema in place.
            </Tip>
          </ul>
        </Card>

        {/* About */}
        <Card title="About">
          <p className="text-sm text-obsidian-100">
            <strong>Sanique&apos;s workspace</strong> v{version.data?.version || '2.7.x'} ·
            Built on Electron 30 + React 18 + SQLite (better-sqlite3) ·
            Source &amp; releases at{' '}
            <a
              href="https://github.com/Machell1/Sanique-workflow"
              onClick={(e) => { e.preventDefault(); window.claw?.files.openItem('https://github.com/Machell1/Sanique-workflow'); }}
              className="text-gilt-300 underline cursor-pointer"
            >
              github.com/Machell1/Sanique-workflow
            </a>.
          </p>
          <p className="text-xs text-obsidian-300 mt-2">
            This app keeps everything local. No telemetry, no analytics, no remote
            sync. The only outbound network traffic is whatever you configure under AI
            provider, plus Google Fonts on first launch for the typography (cached
            afterwards).
          </p>
        </Card>
      </PageBody>
    </>
  );
}

function ModuleRow({ icon, to, name, desc }: { icon: React.ReactNode; to: string; name: string; desc: string }) {
  return (
    <li>
      <Link to={to} className="flex items-start gap-3 p-2 -mx-2 rounded hover:bg-white/5 transition-colors">
        <span className="text-gilt-400 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-obsidian-50">{name}</div>
          <div className="text-xs text-obsidian-300 leading-relaxed">{desc}</div>
        </div>
        <ChevronRight className="w-4 h-4 text-obsidian-400 mt-1" />
      </Link>
    </li>
  );
}

function ProviderRow({ name, endpoint, key_, note }: { name: string; endpoint: string; key_: string; note: string }) {
  return (
    <tr>
      <td className="px-3 py-2 text-obsidian-50 font-medium whitespace-nowrap">{name}</td>
      <td className="px-3 py-2 text-obsidian-200 font-mono text-[11px]">{endpoint}</td>
      <td className="px-3 py-2 text-obsidian-200">{key_}</td>
      <td className="px-3 py-2 text-obsidian-300 text-xs">{note}</td>
    </tr>
  );
}

function Flow({ title, steps }: { title: string; steps: React.ReactNode[] }) {
  return (
    <div>
      <h4 className="font-serif text-base text-obsidian-50 mb-2">{title}</h4>
      <ol className="space-y-1.5 list-decimal pl-5 marker:text-gilt-400">
        {steps.map((s, i) => (
          <li key={i} className="text-sm text-obsidian-200 leading-relaxed">{s}</li>
        ))}
      </ol>
    </div>
  );
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <kbd className="px-2 py-1 bg-obsidian-700 border border-white/10 rounded text-xs font-mono text-gilt-200">{keys}</kbd>
      <span className="text-obsidian-200 text-right flex-1">{desc}</span>
    </li>
  );
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <div className="font-medium text-obsidian-50 mb-0.5">{title}</div>
      <div className="text-obsidian-200 leading-relaxed">{children}</div>
    </li>
  );
}
