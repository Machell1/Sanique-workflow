import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, AlertTriangle, ShieldX, ScanText } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea, Select, Field } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { VerificationBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';
import { fmtDateTime } from '../lib/format';
import { useAppStore } from '../store';
import type { Case, Verification as VerificationRecord, VerificationStatus } from '../lib/types';

const exampleText = `In R v Brown [2021] JMCA Crim 14, the Court reaffirmed the principle that a confession obtained in
breach of section 24 of the Constitution is inadmissible. See also Allied Insurance v Mitchell, where the
Court of Appeal applied SCCA 47/2025 reasoning to quantification. Cf. Smith v Jones [2020] EWCA Civ 211.`;

export function Verification() {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [text, setText] = useState('');
  const [caseId, setCaseId] = useState('');
  const [result, setResult] = useState<{ citations: any[]; summary: any } | null>(null);

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

  function harnessTone(s: VerificationStatus) {
    return s === 'verified' ? 'verified' : s === 'high_confidence' ? 'high' : s === 'escalation' ? 'escalation' : 'blocked';
  }

  return (
    <>
      <PageHeader
        title="Verification"
        subtitle="Citation extraction and AI Truth Harness scoring"
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
              <p className="text-sm text-obsidian-300">No citations were detected in the supplied text.</p>
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

        <Card title="Verification history" subtitle="Most recent 500 checks">
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
                  <TH>Checked at</TH>
                </TR>
              </THead>
              <TBody>
                {history.data.map((v) => (
                  <TR key={v.id}>
                    <TD className="font-mono text-xs">{v.citation}</TD>
                    <TD className="text-xs text-obsidian-300">{v.citation_type}</TD>
                    <TD><VerificationBadge status={v.status} /></TD>
                    <TD className="text-sm">{(v.confidence * 100).toFixed(2)}%</TD>
                    <TD className="text-xs text-obsidian-300">{fmtDateTime(v.checked_at)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </PageBody>
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
