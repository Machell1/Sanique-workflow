import { useEffect, useState, useMemo } from 'react';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import { ExternalLink, ShieldCheck, X, ShieldAlert, ShieldQuestion, Search as SearchIcon, MessageSquare, Mail, PenSquare } from 'lucide-react';
import { NotesPanel } from '../notes/NotesPanel';
import { SignatureControls } from '../signatures/SignatureControls';
import { api } from '../../lib/api';
import { extractAndIndex } from '../../lib/extract';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { fmtBytes, fmtDateTime } from '../../lib/format';
import { CATEGORY_LABELS, shortHash, sha256Hex } from '../../lib/utils';
import type { CourtDocument } from '../../lib/types';

interface Props {
  doc: CourtDocument;
  onClose: () => void;
  onProvenance?: () => void;
  onEmail?: () => void;
}

function detectKind(doc: CourtDocument): 'pdf' | 'docx' | 'image' | 'text' | 'unsupported' {
  const mime = (doc.mime_type || '').toLowerCase();
  const name = doc.original_name.toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    mime.includes('officedocument.wordprocessingml') ||
    name.endsWith('.docx')
  )
    return 'docx';
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name)) return 'image';
  if (mime.startsWith('text/') || /\.(txt|md|csv|json|xml|html?)$/.test(name)) return 'text';
  return 'unsupported';
}

export function DocumentViewer({ doc, onClose, onProvenance, onEmail }: Props) {
  const kind = useMemo(() => detectKind(doc), [doc]);
  const [verifyState, setVerifyState] = useState<'idle' | 'checking' | 'match' | 'mismatch' | 'missing'>('idle');
  const [indexState, setIndexState] = useState<'idle' | 'extracting' | 'indexed' | 'failed'>(
    doc.content_indexed_at ? 'indexed' : 'idle'
  );
  const [sidePanel, setSidePanel] = useState<'notes' | 'signatures' | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lazy text extraction for documents that haven't been indexed yet.
  // Only attempt for kinds we know how to extract; let the user trigger
  // for "unsupported" types by reopening after manual conversion.
  useEffect(() => {
    if (doc.content_indexed_at) return;
    if (kind !== 'pdf' && kind !== 'docx' && kind !== 'text') return;
    setIndexState('extracting');
    extractAndIndex(doc, api).then((ok) => setIndexState(ok ? 'indexed' : 'failed'));
  }, [doc.id, doc.content_indexed_at, kind]);

  async function reverify() {
    setVerifyState('checking');
    try {
      const raw: any = await api.documents.readBytes(doc.id);
      const bytes = atob(raw.base64);
      // Re-hash the bytes and compare to the stored seal
      const buf = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
      setVerifyState(hex === doc.sha256 ? 'match' : 'mismatch');
    } catch (e: any) {
      if (String(e?.message || e).includes('missing')) setVerifyState('missing');
      else setVerifyState('mismatch');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-obsidian-950">
      <header className="h-14 px-5 flex items-center justify-between border-b border-white/10 bg-obsidian-900 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-obsidian-50 truncate">{doc.original_name}</div>
            <div className="text-[11px] text-obsidian-300">
              {CATEGORY_LABELS[doc.category]} · {fmtBytes(doc.size)} · uploaded {fmtDateTime(doc.uploaded_at)}
            </div>
          </div>
          <Badge tone="gilt" className="font-mono text-[10px]">{shortHash(doc.sha256, 14)}</Badge>
          {indexState === 'extracting' && <Badge tone="info"><Spinner /> indexing</Badge>}
          {indexState === 'indexed' && <Badge tone="verified"><SearchIcon className="w-3 h-3" /> searchable</Badge>}
          {indexState === 'failed' && <Badge tone="escalation">not indexed</Badge>}
          {verifyState === 'match' && <Badge tone="verified"><ShieldCheck className="w-3 h-3" /> seal matches</Badge>}
          {verifyState === 'mismatch' && <Badge tone="blocked"><ShieldAlert className="w-3 h-3" /> seal BROKEN</Badge>}
          {verifyState === 'missing' && <Badge tone="blocked">file missing</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={reverify} title="Re-verify the SHA-256 seal against the file on disk">
            {verifyState === 'checking' ? <Spinner /> : <ShieldQuestion className="w-4 h-4" />}
          </Button>
          {onProvenance && (
            <Button size="sm" variant="ghost" onClick={onProvenance} title="Save provenance certificate">
              <ShieldCheck className="w-4 h-4" />
            </Button>
          )}
          {onEmail && (
            <Button size="sm" variant="ghost" onClick={onEmail} title="Send by email">
              <Mail className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant={sidePanel === 'notes' ? 'gilt' : 'ghost'}
            onClick={() => setSidePanel(sidePanel === 'notes' ? null : 'notes')}
            title="Notes"
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={sidePanel === 'signatures' ? 'gilt' : 'ghost'}
            onClick={() => setSidePanel(sidePanel === 'signatures' ? null : 'signatures')}
            title="Signatures"
          >
            <PenSquare className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const info: any = await api.documents.resolve(doc.id);
              if (info?.exists) await window.claw?.files.openItem(info.path);
            }}
            title="Open with default Windows app"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} title="Close (Esc)">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-hidden">
          {kind === 'pdf' && <PdfPane id={doc.id} />}
          {kind === 'docx' && <DocxPane id={doc.id} />}
          {kind === 'image' && <ImagePane id={doc.id} alt={doc.original_name} />}
          {kind === 'text' && <TextPane id={doc.id} />}
          {kind === 'unsupported' && <UnsupportedPane doc={doc} />}
        </div>
        {sidePanel === 'notes' && (
          <NotesPanel documentId={doc.id} caseId={doc.case_id} />
        )}
        {sidePanel === 'signatures' && (
          <aside className="h-full w-80 shrink-0 border-l border-white/10 bg-obsidian-900 p-4 overflow-y-auto">
            <SignatureControls target={{ kind: 'uploaded', documentId: doc.id }} />
          </aside>
        )}
      </div>
    </div>
  );
}

function PdfPane({ id }: { id: string }) {
  // Use the custom protocol so the bundled Chromium PDF viewer can render
  // the file directly without loading the whole thing into renderer memory.
  return (
    <iframe
      src={`claw://files/${id}#toolbar=1&navpanes=0`}
      title="document"
      className="w-full h-full border-0 bg-white"
    />
  );
}

function DocxPane({ id }: { id: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data: any = await api.documents.readBytes(id);
        const bytes = base64ToArrayBuffer(data.base64);
        const result = await mammoth.convertToHtml({ arrayBuffer: bytes });
        if (cancelled) return;
        const safe = DOMPurify.sanitize(result.value || '<p><em>(Empty document.)</em></p>');
        setHtml(safe);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (err) return <Centered error>Couldn't render the document: {err}</Centered>;
  if (html == null) return <Centered><Spinner size={24} /> Rendering Word document…</Centered>;
  return (
    <div className="h-full overflow-y-auto bg-white">
      <article
        className="claw-doc max-w-3xl mx-auto px-10 py-12 text-stone-900"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function ImagePane({ id, alt }: { id: string; alt: string }) {
  return (
    <div className="h-full overflow-auto flex items-center justify-center bg-obsidian-900 p-6">
      <img src={`claw://files/${id}`} alt={alt} className="max-w-full max-h-full object-contain shadow-2xl" />
    </div>
  );
}

function TextPane({ id }: { id: string }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data: any = await api.documents.readBytes(id);
        const decoded = atob(data.base64);
        if (!cancelled) setText(decoded);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (err) return <Centered error>Couldn't read the file: {err}</Centered>;
  if (text == null) return <Centered><Spinner /></Centered>;
  return (
    <pre className="h-full overflow-auto p-6 text-sm text-obsidian-100 font-mono whitespace-pre-wrap bg-obsidian-900">
      {text}
    </pre>
  );
}

function UnsupportedPane({ doc }: { doc: CourtDocument }) {
  return (
    <Centered>
      <div className="text-center">
        <div className="text-sm text-obsidian-200 mb-2">
          CLAW does not have an in-app viewer for {doc.mime_type || 'this file type'}.
        </div>
        <Button
          variant="gilt"
          onClick={async () => {
            const info: any = await api.documents.resolve(doc.id);
            if (info?.exists) await window.claw?.files.openItem(info.path);
          }}
        >
          <ExternalLink className="w-4 h-4" /> Open with the default Windows app
        </Button>
      </div>
    </Centered>
  );
}

function Centered({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div className={`h-full flex items-center justify-center gap-2 p-6 ${error ? 'text-truth-blocked' : 'text-obsidian-200'}`}>
      {children}
    </div>
  );
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const len = binary.length;
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}
