import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Plus, Trash2, Copy, Download, FileType2, Printer,
  Bold, Italic, Heading1, Heading2, List, ListOrdered, Quote, Eye, EyeOff,
  History as HistoryIcon, PenSquare, Mail,
} from 'lucide-react';
import { VersionsPanel } from '../components/versions/VersionsPanel';
import { SignatureControls } from '../components/signatures/SignatureControls';
import { EmailComposeModal } from '../components/email/EmailComposeModal';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Footer, PageNumber,
} from 'docx';
import { saveAs } from 'file-saver';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { sha256Hex, formatProvenanceBlock, shortHash } from '../lib/utils';
import { api } from '../lib/api';
import { useAppStore } from '../store';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Field, Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtRelative } from '../lib/format';
import type { Case, GeneratedDocument, Setting } from '../lib/types';

interface Template {
  key: string;
  title: string;
}

export function Generator() {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<GeneratedDocument | null>(null);
  const [sidePanel, setSidePanel] = useState<'versions' | 'signatures' | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  const templates = useQuery<Template[]>({
    queryKey: ['generator', 'templates'],
    queryFn: () => api.generator.templates() as Promise<Template[]>,
  });

  const cases = useQuery<Case[]>({
    queryKey: ['cases', 'list'],
    queryFn: () => api.cases.list() as Promise<Case[]>,
  });

  const list = useQuery<GeneratedDocument[]>({
    queryKey: ['generator', 'list'],
    queryFn: () => api.generator.list() as Promise<GeneratedDocument[]>,
  });

  const settings = useQuery<Setting[]>({
    queryKey: ['settings', 'all'],
    queryFn: () => api.settings.all() as Promise<Setting[]>,
  });

  const printProvenance =
    (settings.data?.find((s) => s.key === 'compliance.print_provenance')?.value || 'true') === 'true';
  const appVersion = useAppStore((s) => s.appVersion) || '2.4.0';
  const currentUser = useAppStore((s) => s.currentUser);

  const update = useMutation({
    mutationFn: (patch: { id: string; content?: string; title?: string; status?: string }) =>
      api.generator.update(patch.id, patch, actor || undefined),
    onSuccess: (saved: any) => {
      qc.invalidateQueries({ queryKey: ['generator'] });
      if (saved && saved.id === active?.id) setActive(saved as GeneratedDocument);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.generator.delete(id, actor || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['generator'] });
      setActive(null);
    },
  });

  function safeFilename(s: string) {
    return s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  }

  async function buildProvenance(d: GeneratedDocument) {
    const hash = await sha256Hex(d.content);
    return {
      hash,
      facts: {
        appVersion,
        documentId: d.id,
        title: d.title,
        docType: d.doc_type,
        status: d.status,
        authorName: currentUser?.name || 'unknown',
        createdAt: d.created_at,
        exportedAt: Date.now(),
        contentSha256: hash,
      },
    };
  }

  async function exportText(d: GeneratedDocument) {
    const body = printProvenance
      ? `${d.content}\n\n${formatProvenanceBlock((await buildProvenance(d)).facts)}\n`
      : d.content;
    saveAs(new Blob([body], { type: 'text/plain' }), `${safeFilename(d.title)}.txt`);
  }

  async function exportDocx(d: GeneratedDocument) {
    const { hash, facts } = await buildProvenance(d);
    const bodyParagraphs = markdownToDocxParagraphs(d.content);

    const all: Paragraph[] = [];
    all.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: d.title, bold: true, size: 32 })],
      })
    );
    all.push(new Paragraph({ text: '' }));
    all.push(...bodyParagraphs);

    if (printProvenance) {
      all.push(new Paragraph({ text: '' }));
      all.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: 'Provenance', bold: true, size: 24 })],
        })
      );
      for (const line of formatProvenanceBlock(facts).split('\n')) {
        all.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: line, size: 18, font: 'Consolas', color: '4A4A4A' })],
          })
        );
      }
    }

    const sections: any[] = [
      {
        properties: {},
        children: all,
        ...(printProvenance && {
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: `Workspace · ${shortHash(hash, 12)} · ${new Date(facts.exportedAt).toISOString().slice(0, 10)} · `,
                      size: 16,
                      color: '8A8A8A',
                    }),
                    new TextRun({
                      children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                      size: 16,
                      color: '8A8A8A',
                    }),
                  ],
                }),
              ],
            }),
          },
        }),
      },
    ];

    const doc = new Document({
      creator: `Sanique's workspace v${appVersion} (${facts.authorName})`,
      title: d.title,
      description: `Workspace-generated ${d.doc_type} · sha256 ${hash}`,
      subject: `Document ID: ${d.id}`,
      lastModifiedBy: facts.authorName,
      sections,
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${safeFilename(d.title)}.docx`);
  }

  function printDraft() {
    // The editor renders an off-screen .claw-print-region with the rendered
    // body; @media print CSS makes only that visible, so window.print()
    // prints a clean version using the OS print dialog.
    if (window.claw?.app?.print) window.claw.app.print();
    else window.print();
  }

  return (
    <>
      <PageHeader
        title="Generator"
        subtitle="Draft memoranda, advice, judgments, and orders. Markdown supported."
        actions={
          <Button variant="gilt" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> New draft
          </Button>
        }
      />

      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-220px)] min-h-[600px]">
          <div className="panel flex flex-col">
            <header className="px-4 py-3 border-b border-white/5">
              <h3 className="text-sm font-medium text-obsidian-100">Drafts</h3>
            </header>
            <div className="flex-1 overflow-y-auto">
              {list.data?.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-obsidian-400">No drafts yet</div>
              )}
              {list.data?.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setActive(d)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
                    active?.id === d.id ? 'bg-gilt-500/10 border-l-2 border-l-gilt-400' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-3.5 h-3.5 text-gilt-400" />
                    <span className="text-sm font-medium text-obsidian-50 truncate">{d.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-obsidian-300">
                    <Badge tone={d.status === 'final' ? 'verified' : d.status === 'reviewed' ? 'high' : 'neutral'}>
                      {d.status}
                    </Badge>
                    <span>{d.doc_type}</span>
                    <span>· {fmtRelative(d.updated_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className={`panel flex flex-col ${sidePanel ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            {!active ? (
              <EmptyState
                illustration="/empty-state-upload.svg"
                title="Pick a draft or generate a new one"
                description="The Generator scaffolds memos, advice, judgments, and orders. Use Markdown for headings (#), bold (**text**), italic (*text*), lists (-), and block quotations (>)."
                action={
                  <Button variant="gilt" onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4" /> New draft
                  </Button>
                }
              />
            ) : (
              <DraftEditor
                key={active.id}
                draft={active}
                onSave={(patch) => update.mutate({ id: active.id, ...patch })}
                onDelete={() => { if (confirm('Delete this draft?')) remove.mutate(active.id); }}
                onExportTxt={() => exportText(active)}
                onExportDocx={() => exportDocx(active)}
                onEmail={() => setEmailOpen(true)}
                onPrint={() => printDraft()}
                onToggleVersions={() => setSidePanel(sidePanel === 'versions' ? null : 'versions')}
                onToggleSignatures={() => setSidePanel(sidePanel === 'signatures' ? null : 'signatures')}
                versionsOpen={sidePanel === 'versions'}
                signaturesOpen={sidePanel === 'signatures'}
                provenanceWillStamp={printProvenance}
              />
            )}
          </div>

          {sidePanel === 'versions' && active && (
            <VersionsPanel
              draftId={active.id}
              onClose={() => setSidePanel(null)}
              onRestored={() => {
                // Refresh the active draft and the list
                qc.invalidateQueries({ queryKey: ['generator'] });
              }}
            />
          )}
          {sidePanel === 'signatures' && active && (
            <aside className="h-full panel p-4 overflow-y-auto">
              <SignatureControls
                target={{ kind: 'generated', generatedDocumentId: active.id }}
              />
            </aside>
          )}
        </div>
      </PageBody>

      {createOpen && (
        <CreateDraftModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          templates={templates.data || []}
          cases={cases.data || []}
          onCreated={(d) => {
            qc.invalidateQueries({ queryKey: ['generator'] });
            setActive(d);
            setCreateOpen(false);
          }}
        />
      )}
      {emailOpen && active && (
        <EmailComposeModal
          target={{ kind: 'generated', generatedDocumentId: active.id, defaultSubject: active.title }}
          onClose={() => setEmailOpen(false)}
        />
      )}
    </>
  );
}

/* ─── Editor ──────────────────────────────────────────────────────── */

function DraftEditor({
  draft,
  onSave,
  onDelete,
  onExportTxt,
  onExportDocx,
  onEmail,
  onPrint,
  onToggleVersions,
  onToggleSignatures,
  versionsOpen,
  signaturesOpen,
  provenanceWillStamp,
}: {
  draft: GeneratedDocument;
  onSave: (patch: { content?: string; title?: string; status?: string }) => void;
  onDelete: () => void;
  onExportTxt: () => void;
  onExportDocx: () => void;
  onEmail: () => void;
  onPrint: () => void;
  onToggleVersions: () => void;
  onToggleSignatures: () => void;
  versionsOpen: boolean;
  signaturesOpen: boolean;
  provenanceWillStamp: boolean;
}) {
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const [status, setStatus] = useState<GeneratedDocument['status']>(draft.status);
  const [previewOnly, setPreviewOnly] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dirty = title !== draft.title || content !== draft.content || status !== draft.status;

  const previewHtml = useMemo(
    () => DOMPurify.sanitize(marked.parse(content, { async: false }) as string),
    [content]
  );

  function insertAroundSelection(prefix: string, suffix: string = prefix, placeholder = 'text') {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = content.slice(start, end) || placeholder;
    const next = content.slice(0, start) + prefix + sel + suffix + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorStart = start + prefix.length;
      ta.setSelectionRange(cursorStart, cursorStart + sel.length);
    });
  }

  function insertLinePrefix(linePrefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = content.indexOf('\n', end);
    const sliceEnd = lineEnd === -1 ? content.length : lineEnd;
    const block = content.slice(lineStart, sliceEnd);
    const prefixed = block
      .split('\n')
      .map((l) => (l.length > 0 ? linePrefix + l : l))
      .join('\n');
    const next = content.slice(0, lineStart) + prefixed + content.slice(sliceEnd);
    setContent(next);
    requestAnimationFrame(() => ta.focus());
  }

  return (
    <>
      <header className="px-5 py-3 border-b border-white/5 flex items-center gap-3 flex-wrap claw-print-hide">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-transparent border-none focus:outline-none text-sm font-semibold text-obsidian-50 flex-1 min-w-[180px]"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as GeneratedDocument['status'])}
          className="h-8 w-32"
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'reviewed', label: 'Reviewed' },
            { value: 'final', label: 'Final' },
          ]}
        />
        <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(content)} title="Copy markdown to clipboard">
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onExportTxt} title="Export plain text (.txt)">
          <Download className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onExportDocx} title="Export Word (.docx)">
          <FileType2 className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onPrint} title="Print">
          <Printer className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onEmail} title="Send by email">
          <Mail className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant={versionsOpen ? 'gilt' : 'ghost'} onClick={onToggleVersions} title="Version history">
          <HistoryIcon className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant={signaturesOpen ? 'gilt' : 'ghost'} onClick={onToggleSignatures} title="Signatures">
          <PenSquare className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPreviewOnly((p) => !p)} title={previewOnly ? 'Show source' : 'Hide source'}>
          {previewOnly ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm"
          variant={dirty ? 'gilt' : 'secondary'}
          disabled={!dirty}
          onClick={() => onSave({ title, content, status })}
        >
          {dirty ? 'Save changes' : 'Saved'}
        </Button>
      </header>

      {!previewOnly && (
        <div className="px-5 py-2 border-b border-white/5 flex flex-wrap items-center gap-1 claw-print-hide">
          <Tool onClick={() => insertAroundSelection('**')} title="Bold (Ctrl+B)"><Bold className="w-3.5 h-3.5" /></Tool>
          <Tool onClick={() => insertAroundSelection('*')} title="Italic (Ctrl+I)"><Italic className="w-3.5 h-3.5" /></Tool>
          <span className="mx-1 w-px h-4 bg-white/10" />
          <Tool onClick={() => insertLinePrefix('# ')} title="Heading 1"><Heading1 className="w-3.5 h-3.5" /></Tool>
          <Tool onClick={() => insertLinePrefix('## ')} title="Heading 2"><Heading2 className="w-3.5 h-3.5" /></Tool>
          <span className="mx-1 w-px h-4 bg-white/10" />
          <Tool onClick={() => insertLinePrefix('- ')} title="Bulleted list"><List className="w-3.5 h-3.5" /></Tool>
          <Tool onClick={() => insertLinePrefix('1. ')} title="Numbered list"><ListOrdered className="w-3.5 h-3.5" /></Tool>
          <Tool onClick={() => insertLinePrefix('> ')} title="Blockquote"><Quote className="w-3.5 h-3.5" /></Tool>
          {provenanceWillStamp && (
            <span className="ml-auto text-[10px] text-obsidian-400">
              Provenance footer will stamp on export · turn off in Settings → Compliance
            </span>
          )}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden claw-print-hide">
        {!previewOnly && (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                insertAroundSelection('**');
              } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
                e.preventDefault();
                insertAroundSelection('*');
              }
            }}
            className="w-full h-full p-6 bg-obsidian-900/40 text-obsidian-50 text-sm font-mono leading-relaxed focus:outline-none resize-none border-r border-white/5"
            spellCheck
          />
        )}
        <div
          className={`overflow-y-auto bg-white text-stone-900 ${previewOnly ? 'col-span-2' : ''}`}
        >
          <article className="claw-doc max-w-3xl mx-auto px-10 py-10" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      </div>

      {/* Hidden print region — only visible in @media print. */}
      <div className="claw-print-region hidden print:block">
        <h1 className="text-2xl font-serif text-center mb-6">{title}</h1>
        <article className="claw-doc" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        {provenanceWillStamp && (
          <p className="mt-8 text-[10px] text-stone-500 font-mono">
            Sanique&apos;s workspace v{useAppStore.getState().appVersion || '2.7.0'} · Document ID {draft.id} · printed {new Date().toISOString()}
          </p>
        )}
      </div>
    </>
  );
}

function Tool({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="p-1.5 rounded text-obsidian-200 hover:bg-white/5 hover:text-obsidian-50 transition-colors"
    >
      {children}
    </button>
  );
}

/* ─── Markdown → docx conversion ─────────────────────────────────── */

function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const tokens = marked.lexer(markdown);
  const out: Paragraph[] = [];
  walk(tokens, out, { indent: 0 });
  return out;
}

interface WalkCtx {
  indent: number;
}

function walk(tokens: any[], out: Paragraph[], ctx: WalkCtx) {
  for (const t of tokens) {
    switch (t.type) {
      case 'heading': {
        const level = Math.min(Math.max(t.depth, 1), 6);
        out.push(
          new Paragraph({
            heading: ([
              HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
              HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6,
            ] as const)[level - 1],
            spacing: { before: 240, after: 120 },
            children: renderInline(t.tokens || [{ type: 'text', text: t.text }]),
          })
        );
        break;
      }
      case 'paragraph': {
        out.push(
          new Paragraph({
            spacing: { after: 120 },
            indent: ctx.indent ? { left: ctx.indent * 360 } : undefined,
            children: renderInline(t.tokens || [{ type: 'text', text: t.text }]),
          })
        );
        break;
      }
      case 'blockquote': {
        const inner: Paragraph[] = [];
        walk(t.tokens || [], inner, { indent: ctx.indent + 1 });
        for (const p of inner) {
          // Mark blockquote paragraphs visually
          out.push(p);
        }
        break;
      }
      case 'list': {
        const ordered = !!t.ordered;
        let i = 1;
        for (const item of t.items || []) {
          const inline = item.tokens?.find((x: any) => x.type === 'text')?.tokens
            ?? [{ type: 'text', text: item.text }];
          const bullet = ordered ? `${i++}. ` : '• ';
          out.push(
            new Paragraph({
              spacing: { after: 80 },
              indent: { left: (ctx.indent + 1) * 360 },
              children: [
                new TextRun({ text: bullet, size: 24 }),
                ...renderInline(inline),
              ],
            })
          );
          // Recurse into nested blocks (sub-lists, nested paragraphs)
          const nested = (item.tokens || []).filter((x: any) => x.type !== 'text');
          if (nested.length) walk(nested, out, { indent: ctx.indent + 1 });
        }
        break;
      }
      case 'code': {
        // Render code blocks as monospace, single paragraph per line.
        for (const line of (t.text || '').split('\n')) {
          out.push(
            new Paragraph({
              spacing: { after: 0 },
              indent: { left: (ctx.indent + 1) * 360 },
              children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 22 })],
            })
          );
        }
        break;
      }
      case 'hr': {
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: '— — — — — — — — — — — — — — —', color: '8A8A8A' })],
          })
        );
        break;
      }
      case 'space':
        out.push(new Paragraph({ text: '' }));
        break;
      case 'html':
      case 'text': {
        if (t.tokens) {
          out.push(
            new Paragraph({
              spacing: { after: 80 },
              children: renderInline(t.tokens),
            })
          );
        } else if (t.text) {
          out.push(new Paragraph({ children: [new TextRun({ text: String(t.text), size: 24 })] }));
        }
        break;
      }
      default:
        // Anything we don't recognise: render as plain text
        if (typeof t.raw === 'string') {
          out.push(new Paragraph({ children: [new TextRun({ text: t.raw, size: 24 })] }));
        }
    }
  }
}

function renderInline(tokens: any[]): TextRun[] {
  const runs: TextRun[] = [];
  function push(text: string, opts: { bold?: boolean; italics?: boolean; code?: boolean } = {}) {
    runs.push(
      new TextRun({
        text,
        size: 24,
        bold: opts.bold,
        italics: opts.italics,
        font: opts.code ? 'Consolas' : undefined,
      })
    );
  }
  function walkInline(arr: any[], ctx: { bold?: boolean; italics?: boolean; code?: boolean }) {
    for (const t of arr) {
      switch (t.type) {
        case 'strong':
          walkInline(t.tokens || [{ type: 'text', text: t.text }], { ...ctx, bold: true });
          break;
        case 'em':
          walkInline(t.tokens || [{ type: 'text', text: t.text }], { ...ctx, italics: true });
          break;
        case 'codespan':
          push(t.text, { ...ctx, code: true });
          break;
        case 'link':
          walkInline(t.tokens || [{ type: 'text', text: t.text }], ctx);
          break;
        case 'br':
          runs.push(new TextRun({ break: 1 }));
          break;
        case 'text':
        default:
          if (t.tokens) walkInline(t.tokens, ctx);
          else push(t.text ?? t.raw ?? '', ctx);
      }
    }
  }
  walkInline(tokens, {});
  return runs;
}

/* ─── Create modal (unchanged from v2.3.0) ────────────────────────── */

function CreateDraftModal({
  open,
  onClose,
  templates,
  cases,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  templates: Template[];
  cases: Case[];
  onCreated: (d: GeneratedDocument) => void;
}) {
  const actor = useAppStore((s) => s.currentUser);
  const [tmpl, setTmpl] = useState(templates[0]?.key || 'memo');
  const [title, setTitle] = useState('');
  const [caseRef, setCaseRef] = useState('');
  const [subject, setSubject] = useState('');
  const [presiding, setPresiding] = useState('');
  const [parties, setParties] = useState('');
  const [author, setAuthor] = useState(actor?.name || '');
  const [body, setBody] = useState('');
  const [caseId, setCaseId] = useState('');

  async function submit() {
    const d = (await api.generator.create(
      {
        doc_type: tmpl,
        title: title || undefined,
        case_id: caseId || null,
        caseRef, subject, author, presiding, parties, body,
      },
      actor || undefined
    )) as GeneratedDocument;
    onCreated(d);
  }

  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate a draft"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gilt" onClick={submit}>Generate</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Template" required>
            <Select
              value={tmpl}
              onChange={(e) => setTmpl(e.target.value)}
              options={templates.map((t) => ({ value: t.key, label: t.title }))}
            />
          </Field>
          <Field label="Custom title" hint="optional">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank to use template title" />
          </Field>
        </div>
        <Field label="Linked case">
          <Select
            value={caseId}
            onChange={(e) => {
              setCaseId(e.target.value);
              const c = cases.find((c) => c.id === e.target.value);
              if (c) {
                setCaseRef(c.case_number);
                setParties(`${c.parties_appellant || '[APPELLANT]'}\n\n                    AND\n\n${c.parties_respondent || '[RESPONDENT]'}`);
                setPresiding(c.presiding_judge || '');
              }
            }}
            options={[{ value: '', label: '— None —' }, ...cases.map((c) => ({ value: c.id, label: `${c.case_number} · ${c.title}` }))]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Case reference"><Input value={caseRef} onChange={(e) => setCaseRef(e.target.value)} placeholder="SCCA 12/2025" /></Field>
          <Field label="Subject / Recipient" hint="memo only"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        </div>
        <Field label="Presiding bench" hint="judgment only">
          <Input value={presiding} onChange={(e) => setPresiding(e.target.value)} />
        </Field>
        <Field label="Parties (formatted)" hint="judgment / order only">
          <Textarea value={parties} onChange={(e) => setParties(e.target.value)} className="min-h-[80px] font-mono text-xs" />
        </Field>
        <Field label="Author"><Input value={author} onChange={(e) => setAuthor(e.target.value)} /></Field>
        <Field label="Opening paragraph">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="The opening sentences inserted into the template." />
        </Field>
      </div>
    </Modal>
  );
}
