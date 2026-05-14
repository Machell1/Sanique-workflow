import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2, Copy, Download } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Field, Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtRelative } from '../lib/format';
import { useAppStore } from '../store';
import type { Case, GeneratedDocument } from '../lib/types';

interface Template {
  key: string;
  title: string;
}

export function Generator() {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<GeneratedDocument | null>(null);

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

  const update = useMutation({
    mutationFn: (patch: { id: string; content?: string; title?: string; status?: string }) =>
      api.generator.update(patch.id, patch, actor || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['generator'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.generator.delete(id, actor || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['generator'] });
      setActive(null);
    },
  });

  function exportText(d: GeneratedDocument) {
    const blob = new Blob([d.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${d.title.replace(/[^a-z0-9]+/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Generator"
        subtitle="Draft memoranda, advice, judgments, and orders from court-style templates"
        actions={
          <Button variant="gilt" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> New draft
          </Button>
        }
      />

      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-220px)] min-h-[600px]">
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
                    <Badge tone={d.status === 'final' ? 'verified' : d.status === 'reviewed' ? 'high' : 'neutral'}>{d.status}</Badge>
                    <span>{d.doc_type}</span>
                    <span>· {fmtRelative(d.updated_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="panel flex flex-col lg:col-span-2">
            {!active ? (
              <EmptyState
                illustration="/empty-state-upload.svg"
                title="Pick a draft or generate a new one"
                description="The Generator scaffolds memos, advice, judgments, and orders following the Court's house style."
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
                onExport={() => exportText(active)}
              />
            )}
          </div>
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
    </>
  );
}

function DraftEditor({
  draft,
  onSave,
  onDelete,
  onExport,
}: {
  draft: GeneratedDocument;
  onSave: (patch: { content?: string; title?: string; status?: string }) => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const [status, setStatus] = useState<GeneratedDocument['status']>(draft.status);
  const dirty = title !== draft.title || content !== draft.content || status !== draft.status;

  return (
    <>
      <header className="px-5 py-3 border-b border-white/5 flex items-center justify-between gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-transparent border-none focus:outline-none text-sm font-semibold text-obsidian-50 flex-1"
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
        <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(content)}>
          <Copy className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onExport}>
          <Download className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
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
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="flex-1 w-full p-6 bg-obsidian-900/40 text-obsidian-50 text-sm font-mono leading-relaxed focus:outline-none resize-none"
      />
    </>
  );
}

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
        caseRef,
        subject,
        author,
        presiding,
        parties,
        body,
      },
      actor || undefined
    )) as GeneratedDocument;
    onCreated(d);
  }

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
          <Field label="Case reference">
            <Input value={caseRef} onChange={(e) => setCaseRef(e.target.value)} placeholder="SCCA 12/2025" />
          </Field>
          <Field label="Subject / Recipient" hint="memo only">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
        </div>
        <Field label="Presiding bench" hint="judgment only">
          <Input value={presiding} onChange={(e) => setPresiding(e.target.value)} />
        </Field>
        <Field label="Parties (formatted)" hint="judgment / order only">
          <Textarea value={parties} onChange={(e) => setParties(e.target.value)} className="min-h-[80px] font-mono text-xs" />
        </Field>
        <Field label="Author">
          <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </Field>
        <Field label="Opening paragraph">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="The opening sentences inserted into the template." />
        </Field>
      </div>
    </Modal>
  );
}
