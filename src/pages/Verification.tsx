import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, AlertTriangle, ShieldX, ScanText, Plus, Trash2, Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea, Select, Field, Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { VerificationBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtDateTime } from '../lib/format';
import { useAppStore } from '../store';
import type { Case, Verification as VerificationRecord, VerificationStatus } from '../lib/types';

const STATUSES: VerificationStatus[] = ['verified', 'high_confidence', 'escalation', 'blocked'];
const STATUS_LABEL: Record<VerificationStatus, string> = {
  verified: '100% Verified',
  high_confidence: '99% High confidence',
  escalation: '98% Escalation',
  blocked: '<98% Blocked',
};

const exampleText = `In R v Brown [2021] JMCA Crim 14, the Court reaffirmed the principle that a confession obtained in
breach of section 24 of the Constitution is inadmissible. See also Allied Insurance v Mitchell, where the
Court of Appeal applied SCCA 47/2025 reasoning to quantification. Cf. Smith v Jones [2020] EWCA Civ 211.`;

export function Verification() {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [text, setText] = useState('');
  const [caseId, setCaseId] = useState('');
  const [result, setResult] = useState<{ citations: any[]; summary: any } | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<VerificationRecord | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const cases = useQuery<Case[]>({
    queryKey: ['cases', 'list'],
    queryFn: () => api.cases.list() as Promise<Case[]>,
  });

  const history = useQuery<VerificationRecord[]>({
    queryKey: ['verification', 'list'],
    queryFn: () => api.verification.list() as Promise<VerificationRecord[]>,
  });

  const run = useMutation({
    mutationFn: () => api.verification.run({ text, caseId: caseId || undefined }, actor || undefined),
    onSuccess: (r: any) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['verification'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.verification.delete(id, actor || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['verification'] }),
  });

  function harnessTone(s: VerificationStatus) {
    return s === 'verified' ? 'verified' : s === 'high_confidence' ? 'high' : s === 'escalation' ? 'escalation' : 'blocked';
  }

  return (
    <>
      <PageHeader
        title="Verification"
        subtitle="Citation extraction and AI Truth Harness scoring"
        actions={
          <Button variant="ghost" onClick={() => setManualOpen(true)}>
            <Plus className="w-4 h-4" /> Add citation manually
          </Button>
        }
      />
      <PageBody className="space-y-6">
        <div className="grid grid-cols-4 gap-3">
          <HarnessTier
            tone="verified"
            icon={<ShieldCheck className="w-5 h-5" />}
            level="100%"
            label="Verified"
            description="No flag, full citation required."
          />
          <HarnessTier
            tone="high"
            icon={<ShieldCheck className="w-5 h-5" />}
            level="99%"
            label="High confidence"
            description="Flagged for human research."
          />
          <HarnessTier
            tone="escalation"
            icon={<AlertTriangle className="w-5 h-5" />}
            level="98%"
            label="Escalation"
            description="Double-flagged, requires verification."
          />
          <HarnessTier
            tone="blocked"
            icon={<ShieldX className="w-5 h-5" />}
            level="<98%"
            label="Blocked"
            description="Cannot be presented as fact."
          />
        </div>

        <Card title="Run a verification" subtitle="Paste text containing citations to extract and score them">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setText(exampleText)}>Use example text</Button>
            </div>
            <Field label="Text to verify">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the passage containing citations to verify…"
                className="min-h-[200px] font-mono text-sm leading-relaxed"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3 items-end">
              <Field label="Linked case" hint="optional" className="col-span-2">
                <Select
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  options={[{ value: '', label: '— None —' }, ...(cases.data || []).map((c) => ({ value: c.id, label: `${c.case_number} · ${c.title}` }))]}
                />
              </Field>
              <Button
                variant="gilt"
                disabled={!text.trim() || run.isPending}
                onClick={() => run.mutate()}
              >
                <ScanText className="w-4 h-4" /> {run.isPending ? 'Scanning…' : 'Run verification'}
              </Button>
            </div>
          </div>
        </Card>

        {result && (
          <Card title="Verification result" subtitle={`${result.citations.length} citations extracted`}>
            {result.citations.length === 0 ? (
              <p className="text-sm text-obsidian-300">
                No citations were detected in the supplied text. Use <strong>Add citation manually</strong> if the
                parser missed one.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-3 mb-5">
                  <Counter tone="verified" label="Verified" count={result.summary.verified} />
                  <Counter tone="high" label="High" count={result.summary.high_confidence} />
                  <Counter tone="escalation" label="Escalate" count={result.summary.escalation} />
                  <Counter tone="blocked" label="Blocked" count={result.summary.blocked} />
                </div>
                <Table>
                  <THead>
                    <TR>
                      <TH>Citation</TH>
                      <TH>Type</TH>
                      <TH>Confidence</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {result.citations.map((c: any) => (
                      <TR key={c.id}>
                        <TD className="font-mono text-xs">{c.citation}</TD>
                        <TD className="text-xs text-obsidian-300">{c.type}</TD>
                        <TD className="text-sm">{(c.confidence * 100).toFixed(2)}%</TD>
                        <TD>
                          <Badge tone={harnessTone(c.status)}>{c.status.replace('_', ' ')}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </>
            )}
          </Card>
        )}

        <Card
          title="Verification history"
          subtitle="Most recent 500 checks — click the pencil to override a tier, the bin to remove"
        >
          {history.isLoading && <p className="text-sm text-obsidian-300">Loading…</p>}
          {history.data && history.data.length === 0 && (
            <EmptyState
              illustration="/empty-state-audit.svg"
              title="No prior verifications"
              description="Run a verification above to populate history."
            />
          )}
          {history.data && history.data.length > 0 && (
            <Table>
              <THead>
                <TR>
                  <TH>Citation</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH>Confidence</TH>
                  <TH>Source</TH>
                  <TH>Checked at</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {history.data.map((v) => (
                  <TR key={v.id}>
                    <TD className="font-mono text-xs">{v.citation}</TD>
                    <TD className="text-xs text-obsidian-300">{v.citation_type}</TD>
                    <TD><VerificationBadge status={v.status} /></TD>
                    <TD className="text-sm">{(v.confidence * 100).toFixed(2)}%</TD>
                    <TD className="text-xs text-obsidian-300">{v.source}</TD>
                    <TD className="text-xs text-obsidian-300">{fmtDateTime(v.checked_at)}</TD>
                    <TD className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setOverrideTarget(v)} title="Override tier">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { if (confirm('Remove this entry?')) remove.mutate(v.id); }}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </PageBody>

      {overrideTarget && (
        <OverrideModal
          record={overrideTarget}
          onClose={() => setOverrideTarget(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['verification'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            setOverrideTarget(null);
          }}
        />
      )}
      {manualOpen && (
        <ManualAddModal
          cases={cases.data || []}
          onClose={() => setManualOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['verification'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
            setManualOpen(false);
          }}
        />
      )}
    </>
  );
}

function HarnessTier({ tone, icon, level, label, description }: { tone: 'verified' | 'high' | 'escalation' | 'blocked'; icon: React.ReactNode; level: string; label: string; description: string }) {
  const colors: Record<typeof tone, string> = {
    verified: 'border-truth-verified/30 text-truth-verified',
    high: 'border-truth-high/30 text-truth-high',
    escalation: 'border-truth-escalation/30 text-truth-escalation',
    blocked: 'border-truth-blocked/30 text-truth-blocked',
  };
  return (
    <div className={`panel p-4 ${colors[tone]}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-serif text-2xl">{level}</span>
      </div>
      <div className="text-sm font-medium text-obsidian-50 mt-1">{label}</div>
      <p className="text-[11px] text-obsidian-300 mt-1">{description}</p>
    </div>
  );
}

function Counter({ tone, label, count }: { tone: 'verified' | 'high' | 'escalation' | 'blocked'; label: string; count: number }) {
  return (
    <div className="surface p-3 text-center">
      <Badge tone={tone}>{label}</Badge>
      <div className="font-serif text-2xl text-obsidian-50 mt-2">{count}</div>
    </div>
  );
}

function OverrideModal({
  record,
  onClose,
  onSaved,
}: {
  record: VerificationRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const actor = useAppStore((s) => s.currentUser);
  const [status, setStatus] = useState<VerificationStatus>(record.status);
  const [notes, setNotes] = useState(record.notes || '');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.verification.override(record.id, { status, notes }, actor || undefined);
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
      title="Override Truth Harness tier"
      description={record.citation}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gilt" onClick={submit} disabled={submitting}>Save override</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-obsidian-300">
          The parser scored this as <strong>{record.status.replace('_', ' ')}</strong> at{' '}
          {(record.confidence * 100).toFixed(2)}%. If a human verification disagrees, set the correct tier here.
          The override is recorded in the audit ledger.
        </p>
        <Field label="Correct tier">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as VerificationStatus)}
            options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          />
        </Field>
        <Field label="Notes" hint="recorded with the override">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Confirmed against Lexis: judgment exists, headnote XYZ."
          />
        </Field>
      </div>
    </Modal>
  );
}

function ManualAddModal({
  cases,
  onClose,
  onSaved,
}: {
  cases: Case[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const actor = useAppStore((s) => s.currentUser);
  const [citation, setCitation] = useState('');
  const [citationType, setCitationType] = useState('manual');
  const [status, setStatus] = useState<VerificationStatus>('verified');
  const [caseId, setCaseId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!citation.trim()) return;
    setSubmitting(true);
    try {
      await api.verification.manualAdd(
        {
          citation: citation.trim(),
          citation_type: citationType,
          status,
          caseId: caseId || undefined,
          notes: notes.trim() || undefined,
        },
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
      title="Add citation manually"
      description="Use this when the parser missed a citation that should be recorded against the case file."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gilt" onClick={submit} disabled={submitting || !citation.trim()}>Record</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Citation" required>
          <Input value={citation} onChange={(e) => setCitation(e.target.value)} placeholder="[2024] JMCA Civ 12" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select
              value={citationType}
              onChange={(e) => setCitationType(e.target.value)}
              options={[
                { value: 'manual', label: 'Manual' },
                { value: 'jamaican_neutral', label: 'Jamaican neutral' },
                { value: 'court_of_appeal_jm', label: 'Court of Appeal (Jamaica)' },
                { value: 'caribbean_court', label: 'CCJ' },
                { value: 'uk_neutral', label: 'UK neutral' },
                { value: 'statute_section', label: 'Statute section' },
                { value: 'generic_case', label: 'Generic case' },
              ]}
            />
          </Field>
          <Field label="Tier">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as VerificationStatus)}
              options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            />
          </Field>
        </div>
        <Field label="Linked case">
          <Select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            options={[{ value: '', label: '— None —' }, ...cases.map((c) => ({ value: c.id, label: `${c.case_number} · ${c.title}` }))]}
          />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Source, holding, paragraph reference…" />
        </Field>
      </div>
    </Modal>
  );
}
