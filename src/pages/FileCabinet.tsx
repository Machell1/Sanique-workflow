import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderClosed, FolderOpen, Plus, FileText, Trash2, ExternalLink, Search, Pencil, ShieldCheck, Eye, Layers, Mail } from 'lucide-react';
import { saveAs } from 'file-saver';
import { DocumentViewer } from '../components/viewers/DocumentViewer';
import { BundleBuilder } from '../components/bundles/BundleBuilder';
import { EmailComposeModal } from '../components/email/EmailComposeModal';
import type { Bundle } from '../lib/types';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input, Field, Select, Textarea } from '../components/ui/Input';
import { CaseStatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtRelative, fmtBytes, fmtDate, fmtDateTime } from '../lib/format';
import { CATEGORY_LABELS, STATUS_LABELS, TYPE_LABELS, shortHash } from '../lib/utils';
import { useAppStore } from '../store';
import type { Case, CaseStatus, CaseType, CourtDocument, DocCategory } from '../lib/types';

const TYPES: CaseType[] = ['civil', 'criminal', 'application', 'procedural', 'miscellaneous'];
const STATUSES: CaseStatus[] = ['open', 'reserved', 'judgment_pending', 'closed'];
const CATEGORIES: DocCategory[] = [
  'record_of_appeal',
  'submission',
  'judgment',
  'order',
  'exhibit',
  'correspondence',
  'draft',
  'other',
];

type CaseFormValues = Omit<Case, 'id' | 'filed_date' | 'created_at' | 'updated_at'>;

export function FileCabinet() {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<CourtDocument | null>(null);
  const [viewDoc, setViewDoc] = useState<CourtDocument | null>(null);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [emailDoc, setEmailDoc] = useState<CourtDocument | null>(null);

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

  const bundles = useQuery<Bundle[]>({
    queryKey: ['bundles', 'list', selectedCase?.id],
    enabled: !!selectedCase,
    queryFn: () => api.bundles.list({ caseId: selectedCase!.id }) as Promise<Bundle[]>,
  });

  const updateStatus = useMutation({
    mutationFn: (status: CaseStatus) => api.cases.update(selectedCase!.id, { status }, actor || undefined),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setSelectedCase(updated as Case);
    },
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

  async function exportProvenanceCertificate(d: CourtDocument, owningCase: Case | null) {
    const audit: any = await api.audit.verify();
    const filename = `${d.original_name.replace(/[^a-z0-9]+/gi, '_')}.provenance.txt`;
    const lines = [
      'CLAW — DOCUMENT PROVENANCE CERTIFICATE',
      '======================================',
      '',
      `Generated at      ${new Date().toISOString()}`,
      '',
      'DOCUMENT',
      '--------',
      `Document ID       ${d.id}`,
      `Original filename ${d.original_name}`,
      `Stored as         ${d.filename}`,
      `MIME type         ${d.mime_type || '—'}`,
      `Size (bytes)      ${d.size ?? '—'}`,
      `Category          ${CATEGORY_LABELS[d.category]}`,
      `Notes             ${d.notes || '—'}`,
      '',
      'CHAIN OF CUSTODY',
      '----------------',
      `Filed at          ${fmtDateTime(d.uploaded_at)} (epoch ${d.uploaded_at})`,
      `Linked case       ${owningCase ? owningCase.case_number + ' · ' + owningCase.title : '— Unfiled —'}`,
      '',
      'INTEGRITY',
      '---------',
      `File SHA-256      ${d.sha256}`,
      `Audit chain       ${audit?.ok ? 'INTACT' : 'BROKEN at #' + audit?.brokenAt}`,
      `Audit entries     ${audit?.total ?? '—'}`,
      '',
      'HOW TO VERIFY',
      '-------------',
      'Re-hash the file in the CLAW vault and compare against the SHA-256',
      'above. The hashes must match exactly. To prove the audit log has',
      'not been tampered with, open the Audit module in CLAW and confirm',
      '"INTACT" is displayed.',
      '',
      'NOTES',
      '-----',
      'This certificate is informational. It does not contain the document',
      'content. It proves only that, at the time of generation, CLAW held a',
      'file with the recorded hash and chain-of-custody metadata.',
    ];
    saveAs(new Blob([lines.join('\n')], { type: 'text/plain' }), filename);
  }

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
                bundles={bundles.data || []}
                onEdit={() => setEditOpen(true)}
                onChangeStatus={(s) => updateStatus.mutate(s)}
                statusChanging={updateStatus.isPending}
                onDelete={() => {
                  if (confirm(`Delete case ${selectedCase.case_number}? Linked documents will also be removed.`))
                    deleteCase.mutate(selectedCase.id);
                }}
                onDocEdit={setEditDoc}
                onDocDelete={(id) => {
                  if (confirm('Delete this document? The file will be removed from the local vault.'))
                    deleteDoc.mutate(id);
                }}
                onDocProvenance={(d) => exportProvenanceCertificate(d, selectedCase)}
                onDocView={setViewDoc}
                onDocEmail={setEmailDoc}
                onAssembleBundle={() => setBundleOpen(true)}
                onBundleDelete={(id) => {
                  if (confirm('Delete this bundle? The merged PDF in the vault is removed too; sources are kept.'))
                    api.bundles.delete(id, actor || undefined).then(() => {
                      qc.invalidateQueries({ queryKey: ['bundles'] });
                      qc.invalidateQueries({ queryKey: ['documents'] });
                    });
                }}
              />
            )}
          </div>
        </div>
      </PageBody>

      {createOpen && (
        <CaseFormModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSubmitted={(c) => {
            qc.invalidateQueries({ queryKey: ['cases'] });
            setSelectedCase(c);
            setCreateOpen(false);
          }}
        />
      )}
      {editOpen && selectedCase && (
        <CaseFormModal
          mode="edit"
          initial={selectedCase}
          onClose={() => setEditOpen(false)}
          onSubmitted={(c) => {
            qc.invalidateQueries({ queryKey: ['cases'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            setSelectedCase(c);
            setEditOpen(false);
          }}
        />
      )}
      {editDoc && (
        <DocumentEditModal
          doc={editDoc}
          cases={cases.data || []}
          onClose={() => setEditDoc(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['documents'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            setEditDoc(null);
          }}
        />
      )}
      {viewDoc && (
        <DocumentViewer
          doc={viewDoc}
          onClose={() => setViewDoc(null)}
          onProvenance={() => exportProvenanceCertificate(viewDoc, selectedCase)}
          onEmail={() => setEmailDoc(viewDoc)}
        />
      )}
      {bundleOpen && selectedCase && (
        <BundleBuilder
          caseRecord={selectedCase}
          documents={docs.data || []}
          onClose={() => setBundleOpen(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['bundles'] });
            qc.invalidateQueries({ queryKey: ['documents'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            setBundleOpen(false);
          }}
        />
      )}
      {emailDoc && (
        <EmailComposeModal
          target={{ kind: 'document', documentId: emailDoc.id, defaultSubject: emailDoc.original_name }}
          onClose={() => setEmailDoc(null)}
        />
      )}
    </>
  );
}

function CaseDetail({
  caseRecord,
  documents,
  bundles,
  onEdit,
  onChangeStatus,
  statusChanging,
  onDelete,
  onDocEdit,
  onDocDelete,
  onDocProvenance,
  onDocView,
  onDocEmail,
  onAssembleBundle,
  onBundleDelete,
}: {
  caseRecord: Case;
  documents: CourtDocument[];
  bundles: Bundle[];
  onEdit: () => void;
  onChangeStatus: (s: CaseStatus) => void;
  statusChanging: boolean;
  onDelete: () => void;
  onDocEdit: (d: CourtDocument) => void;
  onDocDelete: (id: string) => void;
  onDocProvenance: (d: CourtDocument) => void;
  onDocView: (d: CourtDocument) => void;
  onDocEmail: (d: CourtDocument) => void;
  onAssembleBundle: () => void;
  onBundleDelete: (id: string) => void;
}) {
  const c = caseRecord;
  return (
    <div className="space-y-4">
      <Card
        title={c.case_number}
        subtitle={c.title}
        actions={
          <>
            <Select
              value={c.status}
              onChange={(e) => onChangeStatus(e.target.value as CaseStatus)}
              disabled={statusChanging}
              options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
              className="h-9 w-44"
            />
            <Button variant="ghost" size="sm" onClick={onEdit} title="Edit case">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} title="Delete case">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        }
      >
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Detail label="Type" value={TYPE_LABELS[c.case_type]} />
          <Detail label="Status" value={<CaseStatusBadge status={c.status} />} />
          <Detail label="Filed" value={fmtDate(c.filed_date)} />
          <Detail label="Term" value={c.court_term || '—'} />
          <Detail label="Roster" value={c.roster || '—'} />
          <Detail label="Updated" value={fmtRelative(c.updated_at)} />
          <Detail label="Presiding" value={c.presiding_judge || '—'} />
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

      <Card
        title="Bundles"
        subtitle={`${bundles.length} assembled · merge case PDFs into a Record of Appeal`}
        actions={
          <Button size="sm" variant="gilt" onClick={onAssembleBundle}>
            <Layers className="w-3.5 h-3.5" /> Assemble bundle
          </Button>
        }
      >
        {bundles.length === 0 ? (
          <p className="text-sm text-obsidian-300 py-4">
            No bundles yet. Click <em>Assemble bundle</em> to pick PDFs from this case file, reorder them, and produce a single Record of Appeal with cover page and table of contents.
          </p>
        ) : (
          <ul className="divide-y divide-white/5 -mx-2">
            {bundles.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-2 py-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Layers className="w-4 h-4 text-gilt-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-obsidian-50 truncate">{b.title}</div>
                    <div className="text-[11px] text-obsidian-300">
                      {b.source_documents.length} sources · {b.page_count || '?'} pages
                      {b.output_sha256 && ` · ${shortHash(b.output_sha256, 14)}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const out = documents.find((d) => d.id === b.output_document_id);
                      if (out) onDocView(out);
                    }}
                    title="View bundle PDF"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onBundleDelete(b.id)} title="Delete bundle">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
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
                  <Button size="sm" variant="ghost" onClick={() => onDocView(d)} title="View in CLAW">
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const info: any = await api.documents.resolve(d.id);
                      if (info?.exists) await window.claw?.files.openItem(info.path);
                    }}
                    title="Open with default Windows app"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDocProvenance(d)} title="Save provenance certificate">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDocEmail(d)} title="Send by email">
                    <Mail className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDocEdit(d)} title="Edit metadata">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDocDelete(d.id)} title="Delete file">
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

function CaseFormModal({
  mode,
  initial,
  onClose,
  onSubmitted,
}: {
  mode: 'create' | 'edit';
  initial?: Case;
  onClose: () => void;
  onSubmitted: (c: Case) => void;
}) {
  const actor = useAppStore((s) => s.currentUser);
  const [form, setForm] = useState<CaseFormValues>({
    case_number: initial?.case_number || '',
    title: initial?.title || '',
    case_type: initial?.case_type || 'civil',
    status: initial?.status || 'open',
    court_term: initial?.court_term || 'Hilary',
    roster: initial?.roster || 'Roster A',
    presiding_judge: initial?.presiding_judge || '',
    parties_appellant: initial?.parties_appellant || '',
    parties_respondent: initial?.parties_respondent || '',
    description: initial?.description || '',
  });
  const [submitting, setSubmitting] = useState(false);

  function bind<K extends keyof CaseFormValues>(k: K) {
    return {
      value: (form[k] ?? '') as string,
      onChange: (e: any) => setForm((f) => ({ ...f, [k]: e.target.value })),
    };
  }

  async function submit() {
    if (!form.case_number.trim() || !form.title.trim()) return;
    setSubmitting(true);
    try {
      let result: Case;
      if (mode === 'edit' && initial) {
        result = (await api.cases.update(initial.id, form, actor || undefined)) as Case;
      } else {
        result = (await api.cases.create(form, actor || undefined)) as Case;
      }
      onSubmitted(result);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'edit' ? `Edit case ${initial?.case_number}` : 'New case'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="gilt"
            onClick={submit}
            disabled={submitting || !form.case_number.trim() || !form.title.trim()}
          >
            {mode === 'edit' ? 'Save changes' : 'Create case'}
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

function DocumentEditModal({
  doc,
  cases,
  onClose,
  onSaved,
}: {
  doc: CourtDocument;
  cases: Case[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const actor = useAppStore((s) => s.currentUser);
  const [caseId, setCaseId] = useState(doc.case_id || '');
  const [category, setCategory] = useState<DocCategory>(doc.category);
  const [notes, setNotes] = useState(doc.notes || '');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.documents.update(
        doc.id,
        { case_id: caseId || null, category, notes: notes || null },
        actor || undefined
      );
      onSaved();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit document metadata"
      description={doc.original_name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gilt" onClick={submit} disabled={submitting}>Save changes</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-xs text-obsidian-300 bg-obsidian-900/40 rounded-md p-3 font-mono break-all">
          sha256 {doc.sha256}
        </div>
        <Field label="Linked case">
          <Select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            options={[
              { value: '', label: '— Unfiled —' },
              ...cases.map((c) => ({ value: c.id, label: `${c.case_number} · ${c.title}` })),
            ]}
          />
        </Field>
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as DocCategory)}
            options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
          />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Custodian, version, source…" />
        </Field>
        <p className="text-[11px] text-obsidian-400">
          Only metadata is editable. The file content and its SHA-256 hash are immutable — re-upload if the file
          itself needs to change.
        </p>
      </div>
    </Modal>
  );
}
