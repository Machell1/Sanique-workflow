import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderClosed, FolderOpen, Plus, FileText, Trash2, ExternalLink, Search } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input, Field, Select, Textarea } from '../components/ui/Input';
import { CaseStatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtRelative, fmtBytes, fmtDate } from '../lib/format';
import { CATEGORY_LABELS, STATUS_LABELS, TYPE_LABELS, shortHash } from '../lib/utils';
import { useAppStore } from '../store';
import type { Case, CaseStatus, CaseType, CourtDocument } from '../lib/types';

const TYPES: CaseType[] = ['civil', 'criminal', 'application', 'procedural', 'miscellaneous'];
const STATUSES: CaseStatus[] = ['open', 'reserved', 'judgment_pending', 'closed'];

export function FileCabinet() {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const cases = useQuery<Case[]>({
    queryKey: ['cases', 'list', search, statusFilter],
    queryFn: () =>
      api.cases.list({ search: search || undefined, status: statusFilter || undefined }) as Promise<Case[]>,
  });

  const docs = useQuery<CourtDocument[]>({
    queryKey: ['documents', 'list', selectedCase?.id],
    enabled: !!selectedCase,
    queryFn: () => api.documents.list({ caseId: selectedCase!.id }) as Promise<CourtDocument[]>,
  });

  const deleteCase = useMutation({
    mutationFn: (id: string) => api.cases.delete(id, actor || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['documents'] });
      setSelectedCase(null);
    },
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => api.documents.delete(id, actor || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });

  const grouped = useMemo(() => {
    const m: Record<CaseStatus, Case[]> = { open: [], reserved: [], judgment_pending: [], closed: [] };
    (cases.data || []).forEach((c) => m[c.status].push(c));
    return m;
  }, [cases.data]);

  return (
    <>
      <PageHeader
        title="File cabinet"
        subtitle="All cases, with their attached records, submissions, and judgments"
        actions={
          <Button variant="gilt" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> New case
          </Button>
        }
      />

      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-3">
            <Card>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-obsidian-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search number, title, parties"
                    className="pl-8"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  options={[{ value: '', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]}
                />
              </div>
            </Card>

            {STATUSES.map((status) => (
              <div key={status} className="panel">
                <header className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderClosed className="w-4 h-4 text-gilt-400" />
                    <h3 className="text-sm font-medium text-obsidian-100">{STATUS_LABELS[status]}</h3>
                  </div>
                  <Badge tone="neutral">{grouped[status].length}</Badge>
                </header>
                <ul>
                  {grouped[status].length === 0 && (
                    <li className="px-4 py-3 text-xs text-obsidian-400">No cases.</li>
                  )}
                  {grouped[status].map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelectedCase(c)}
                        className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-start gap-2 ${
                          selectedCase?.id === c.id ? 'bg-gilt-500/10' : ''
                        }`}
                      >
                        <FolderOpen className={`w-3.5 h-3.5 mt-0.5 ${selectedCase?.id === c.id ? 'text-gilt-300' : 'text-obsidian-400'}`} />
                        <div className="min-w-0">
                          <div className="text-xs text-obsidian-300">{c.case_number}</div>
                          <div className="text-sm text-obsidian-50 truncate">{c.title}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="lg:col-span-2">
            {!selectedCase ? (
              <Card>
                <EmptyState
                  illustration="/empty-state-upload.svg"
                  title="Select a case to inspect"
                  description="Pick a case from the list on the left, or create a new one to get started."
                  action={
                    <Button variant="gilt" onClick={() => setCreateOpen(true)}>
                      <Plus className="w-4 h-4" /> New case
                    </Button>
                  }
                />
              </Card>
            ) : (
              <CaseDetail
                caseRecord={selectedCase}
                documents={docs.data || []}
                onDelete={() => {
                  if (confirm(`Delete case ${selectedCase.case_number}? Linked documents will also be removed.`))
                    deleteCase.mutate(selectedCase.id);
                }}
                onDocDelete={(id) => {
                  if (confirm('Delete this document? The file will be removed from the local vault.'))
                    deleteDoc.mutate(id);
                }}
              />
            )}
          </div>
        </div>
      </PageBody>

      {createOpen && (
        <CreateCaseModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(c) => {
            qc.invalidateQueries({ queryKey: ['cases'] });
            setSelectedCase(c);
            setCreateOpen(false);
          }}
        />
      )}
    </>
  );
}

function CaseDetail({
  caseRecord,
  documents,
  onDelete,
  onDocDelete,
}: {
  caseRecord: Case;
  documents: CourtDocument[];
  onDelete: () => void;
  onDocDelete: (id: string) => void;
}) {
  const c = caseRecord;
  return (
    <div className="space-y-4">
      <Card
        title={c.case_number}
        subtitle={c.title}
        actions={
          <>
            <CaseStatusBadge status={c.status} />
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Detail label="Type" value={TYPE_LABELS[c.case_type]} />
          <Detail label="Filed" value={fmtDate(c.filed_date)} />
          <Detail label="Term" value={c.court_term || '—'} />
          <Detail label="Roster" value={c.roster || '—'} />
          <Detail label="Presiding" value={c.presiding_judge || '—'} />
          <Detail label="Updated" value={fmtRelative(c.updated_at)} />
        </dl>
        <div className="mt-5 pt-5 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-obsidian-300 mb-1">Appellant</div>
            <div className="text-sm text-obsidian-50">{c.parties_appellant || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-obsidian-300 mb-1">Respondent</div>
            <div className="text-sm text-obsidian-50">{c.parties_respondent || '—'}</div>
          </div>
        </div>
        {c.description && (
          <div className="mt-5 pt-5 border-t border-white/5">
            <div className="text-[10px] uppercase tracking-wider text-obsidian-300 mb-1">Description</div>
            <p className="text-sm text-obsidian-100 leading-relaxed">{c.description}</p>
          </div>
        )}
      </Card>

      <Card title="Documents in this folder" subtitle={`${documents.length} files filed`}>
        {documents.length === 0 ? (
          <p className="text-sm text-obsidian-300 py-4">
            No documents filed yet. Use the Upload module to attach records, submissions, exhibits, and judgments.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 -mx-2">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-2 py-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileText className="w-4 h-4 text-gilt-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-obsidian-50 truncate">{d.original_name}</div>
                    <div className="text-[11px] text-obsidian-300">
                      {CATEGORY_LABELS[d.category]} · {fmtBytes(d.size)} · {fmtRelative(d.uploaded_at)} · {shortHash(d.sha256, 14)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const info: any = await api.documents.resolve(d.id);
                      if (info?.exists) await window.claw?.files.openItem(info.path);
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDocDelete(d.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-obsidian-300">{label}</dt>
      <dd className="text-sm text-obsidian-50 mt-0.5">{value}</dd>
    </div>
  );
}

function CreateCaseModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Case) => void;
}) {
  const actor = useAppStore((s) => s.currentUser);
  const [form, setForm] = useState({
    case_number: '',
    title: '',
    case_type: 'civil' as CaseType,
    status: 'open' as CaseStatus,
    court_term: 'Hilary',
    roster: 'Roster A',
    presiding_judge: '',
    parties_appellant: '',
    parties_respondent: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  function bind<K extends keyof typeof form>(k: K) {
    return {
      value: form[k] as string,
      onChange: (e: any) => setForm((f) => ({ ...f, [k]: e.target.value })),
    };
  }

  async function submit() {
    if (!form.case_number.trim() || !form.title.trim()) return;
    setSubmitting(true);
    try {
      const c = (await api.cases.create(form, actor || undefined)) as Case;
      onCreated(c);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New case"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gilt" onClick={submit} disabled={submitting || !form.case_number.trim() || !form.title.trim()}>
            Create case
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Case number" required>
          <Input {...bind('case_number')} placeholder="SCCA 12/2025" autoFocus />
        </Field>
        <Field label="Title" required>
          <Input {...bind('title')} placeholder="R v. Brown" />
        </Field>
        <Field label="Type">
          <Select {...bind('case_type')} options={TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))} />
        </Field>
        <Field label="Status">
          <Select {...bind('status')} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
        </Field>
        <Field label="Term">
          <Select {...bind('court_term')} options={['Hilary', 'Easter', 'Trinity'].map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="Roster">
          <Select {...bind('roster')} options={['Roster A', 'Roster B', 'Roster C', 'Roster D'].map((r) => ({ value: r, label: r }))} />
        </Field>
        <Field label="Presiding judge" className="col-span-2">
          <Input {...bind('presiding_judge')} placeholder="Hon. Mr Justice ..." />
        </Field>
        <Field label="Appellant"><Input {...bind('parties_appellant')} /></Field>
        <Field label="Respondent"><Input {...bind('parties_respondent')} /></Field>
        <Field label="Description" className="col-span-2">
          <Textarea {...bind('description')} placeholder="Brief description of the matter" />
        </Field>
      </div>
    </Modal>
  );
}
