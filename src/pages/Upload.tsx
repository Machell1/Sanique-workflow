import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload as UploadIcon, FileText, CheckCircle2, ShieldCheck } from 'lucide-react';
import { api, isElectron } from '../lib/api';
import { extractAndIndex } from '../lib/extract';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Field, Select, Textarea } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useAppStore } from '../store';
import { CATEGORY_LABELS } from '../lib/utils';
import { fmtBytes, fmtRelative } from '../lib/format';
import { shortHash } from '../lib/utils';
import type { Case, CourtDocument, DocCategory } from '../lib/types';

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

export function UploadPage() {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [caseId, setCaseId] = useState('');
  const [category, setCategory] = useState<DocCategory>('submission');
  const [notes, setNotes] = useState('');
  const [pickedPaths, setPickedPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [recentlyUploaded, setRecentlyUploaded] = useState<CourtDocument[]>([]);

  const cases = useQuery<Case[]>({
    queryKey: ['cases', 'list'],
    queryFn: () => api.cases.list() as Promise<Case[]>,
  });

  const documents = useQuery<CourtDocument[]>({
    queryKey: ['documents', 'list'],
    queryFn: () => api.documents.list() as Promise<CourtDocument[]>,
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!pickedPaths.length) return;
      const results: CourtDocument[] = [];
      for (const path of pickedPaths) {
        const filename = path.split(/[\\/]/).pop() || path;
        const doc = await api.documents.upload(
          {
            sourcePath: path,
            originalName: filename,
            caseId: caseId || null,
            category,
            notes: notes || null,
          },
          actor || undefined
        );
        results.push(doc as CourtDocument);
      }
      return results;
    },
    onSuccess: async (docs) => {
      if (docs) setRecentlyUploaded((prev) => [...docs, ...prev].slice(0, 8));
      setPickedPaths([]);
      setNotes('');
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      // Background-index the text of each uploaded document so the search
      // module can find phrases inside the PDF / DOCX / text body. We do
      // not block the UI; failures are logged and the document stays
      // searchable by filename / notes regardless.
      if (docs) {
        for (const d of docs) {
          extractAndIndex(d, api).then((ok) => {
            if (ok) qc.invalidateQueries({ queryKey: ['documents'] });
          });
        }
      }
    },
  });

  async function pickFiles() {
    if (!isElectron()) {
      alert('File picking is only available in the desktop application.');
      return;
    }
    setBusy(true);
    try {
      const result = await window.claw.files.pick({
        multi: true,
        filters: [
          { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'rtf'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
      if (!result.canceled && result.paths) setPickedPaths(result.paths);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Upload"
        subtitle="Multi-format ingestion · PDF, DOCX, XLSX, PPTX with SHA-256 chain of custody"
      />
      <PageBody className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="1. Pick files" subtitle="Held in app data — never sent off-device">
            <button
              onClick={pickFiles}
              disabled={busy}
              className="w-full border-2 border-dashed border-white/10 hover:border-gilt-500/50 rounded-xl py-12 px-6 text-center transition-colors group"
            >
              <UploadIcon className="w-10 h-10 text-obsidian-400 group-hover:text-gilt-300 mx-auto mb-3" />
              <div className="text-sm font-medium text-obsidian-100">
                {pickedPaths.length === 0 ? 'Click to pick documents' : `${pickedPaths.length} file(s) selected`}
              </div>
              <div className="text-xs text-obsidian-300 mt-1">PDF, DOCX, XLSX, PPTX, TXT, RTF</div>
            </button>
            {pickedPaths.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs">
                {pickedPaths.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-obsidian-200">
                    <FileText className="w-3 h-3 text-gilt-400 shrink-0" />
                    <span className="truncate">{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="2. Categorise" subtitle="Assign to a case or leave unfiled">
            <div className="space-y-4">
              <Field label="Linked case" hint="optional">
                <Select
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  options={[
                    { value: '', label: '— Unfiled —' },
                    ...(cases.data || []).map((c) => ({ value: c.id, label: `${c.case_number} · ${c.title}` })),
                  ]}
                />
              </Field>
              <Field label="Category" required>
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DocCategory)}
                  options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
                />
              </Field>
              <Field label="Notes" hint="optional">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brief description, custodian, etc." />
              </Field>
            </div>
          </Card>

          <Card title="3. Confirm filing" subtitle="Each file is hashed before storage">
            <div className="text-xs text-obsidian-300 space-y-3 mb-4">
              <p>
                When you confirm, the workspace computes a SHA-256 hash of every file and writes it to the audit ledger
                along with the original filename, size, mime type, and the actor's identity.
              </p>
              <p>The original file is then copied into the local file vault. Nothing leaves the machine.</p>
            </div>
            <Button
              variant="gilt"
              size="lg"
              className="w-full"
              disabled={pickedPaths.length === 0 || upload.isPending}
              onClick={() => upload.mutate()}
            >
              <ShieldCheck className="w-4 h-4" />
              {upload.isPending
                ? 'Filing…'
                : pickedPaths.length === 0
                ? 'Choose files first'
                : `File ${pickedPaths.length} document(s)`}
            </Button>
            {upload.isError && (
              <div className="text-xs text-truth-blocked mt-3">{(upload.error as Error).message}</div>
            )}
          </Card>
        </div>

        {recentlyUploaded.length > 0 && (
          <Card title="Just uploaded" subtitle="Confirmed entries with their integrity hashes">
            <ul className="divide-y divide-white/5 -mx-2">
              {recentlyUploaded.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-2 py-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <CheckCircle2 className="w-5 h-5 text-truth-verified shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-obsidian-50 truncate">{d.original_name}</div>
                      <div className="text-[11px] text-obsidian-300">
                        {fmtBytes(d.size)} · {CATEGORY_LABELS[d.category]} · sha256 {shortHash(d.sha256, 14)}
                      </div>
                    </div>
                  </div>
                  <Badge tone="verified">Filed</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card
          title="All documents in vault"
          subtitle={`${documents.data?.length || 0} files · stored locally with cryptographic integrity`}
        >
          {!documents.data || documents.data.length === 0 ? (
            <EmptyState
              illustration="/empty-state-upload.svg"
              title="No documents filed yet"
              description="Pick a file above and confirm to file your first document. Each filing is sealed with a SHA-256 hash."
            />
          ) : (
            <ul className="divide-y divide-white/5 -mx-2">
              {documents.data.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-2 py-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="w-4 h-4 text-gilt-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-obsidian-50 truncate">{d.original_name}</div>
                      <div className="text-[11px] text-obsidian-300">
                        {fmtBytes(d.size)} · {fmtRelative(d.uploaded_at)} · {shortHash(d.sha256, 14)}
                      </div>
                    </div>
                  </div>
                  <Badge tone="neutral">{CATEGORY_LABELS[d.category]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
