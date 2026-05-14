import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  Files,
  FileSearch,
  ShieldCheck,
  ShieldX,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Spinner, FullPageSpinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { fmtRelative, fmtDateTime } from '../lib/format';
import { shortHash } from '../lib/utils';
import type { DashboardSnapshot, VerificationStatus } from '../lib/types';

const verifTone: Record<VerificationStatus, 'verified' | 'high' | 'escalation' | 'blocked'> = {
  verified: 'verified',
  high_confidence: 'high',
  escalation: 'escalation',
  blocked: 'blocked',
};

export function Dashboard() {
  const { data, isLoading, error } = useQuery<DashboardSnapshot>({
    queryKey: ['dashboard'],
    queryFn: () => api.dashboard.snapshot() as Promise<DashboardSnapshot>,
    refetchInterval: 30_000,
  });

  if (isLoading) return <FullPageSpinner label="Compiling truth field…" />;
  if (error)
    return (
      <PageBody>
        <div className="panel p-6 text-truth-blocked">
          <h3 className="font-semibold">Dashboard unavailable</h3>
          <p className="text-sm mt-1">{(error as Error).message}</p>
        </div>
      </PageBody>
    );
  if (!data) return null;

  const totalCases = data.cases.total;
  const trustPct = totalCases ? Math.round((data.cases.open / totalCases) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Truth field"
        subtitle={`Court of Appeal · operational snapshot · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
      />
      <PageBody className="space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi
            icon={<Files className="w-5 h-5 text-gilt-300" />}
            label="Cases (total)"
            value={String(data.cases.total)}
            footnote={`${data.cases.open} open · ${data.cases.reserved} reserved`}
          />
          <Kpi
            icon={<CalendarClock className="w-5 h-5 text-sky-300" />}
            label="Judgment pending"
            value={String(data.cases.judgment_pending)}
            footnote="Review with priority"
            tone={data.cases.judgment_pending > 0 ? 'escalation' : 'neutral'}
          />
          <Kpi
            icon={<AlertTriangle className="w-5 h-5 text-truth-escalation" />}
            label="Overdue work"
            value={String(data.overdueWork.length)}
            footnote="Items past due date"
            tone={data.overdueWork.length > 0 ? 'escalation' : 'verified'}
          />
          <Kpi
            icon={data.auditChain.ok ? <ShieldCheck className="w-5 h-5 text-truth-verified" /> : <ShieldX className="w-5 h-5 text-truth-blocked" />}
            label="Audit chain"
            value={data.auditChain.ok ? 'Intact' : 'Broken'}
            footnote={`${data.auditChain.total} entries verified`}
            tone={data.auditChain.ok ? 'verified' : 'blocked'}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Truth gauge */}
          <Card title="Truth Harness" subtitle="Cases live in pipeline">
            <div className="h-48 -mx-2">
              <ResponsiveContainer>
                <RadialBarChart
                  innerRadius="70%"
                  outerRadius="100%"
                  data={[{ name: 'open', value: trustPct, fill: '#daab35' }]}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar background={{ fill: 'rgba(255,255,255,0.05)' }} dataKey="value" cornerRadius={8} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center -mt-32 pointer-events-none">
              <div className="font-serif text-4xl text-gilt-300">{trustPct}%</div>
              <div className="text-[11px] uppercase tracking-widest text-obsidian-300 mt-1">Active load</div>
            </div>
            <div className="mt-12 text-xs text-obsidian-300">
              <div className="flex justify-between"><span>Open</span><span className="text-obsidian-100 font-medium">{data.cases.open}</span></div>
              <div className="flex justify-between mt-1"><span>Reserved</span><span className="text-obsidian-100 font-medium">{data.cases.reserved}</span></div>
              <div className="flex justify-between mt-1"><span>Judgment pending</span><span className="text-obsidian-100 font-medium">{data.cases.judgment_pending}</span></div>
            </div>
          </Card>

          {/* Verification mix */}
          <Card title="Verification activity" subtitle="Last citation checks">
            {data.verificationCounts.length === 0 ? (
              <div className="text-sm text-obsidian-300 py-6">
                No citations checked yet. Run a verification from the{' '}
                <Link to="/verification" className="text-gilt-300 underline">Verification</Link> module.
              </div>
            ) : (
              <ul className="space-y-2.5">
                {data.verificationCounts.map((v) => (
                  <li key={v.status} className="flex items-center justify-between">
                    <Badge tone={verifTone[v.status]}>
                      {v.status.replace('_', ' ')}
                    </Badge>
                    <span className="text-2xl font-serif text-obsidian-50">{v.count}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 pt-4 border-t border-white/5">
              <Link to="/verification" className="text-xs text-gilt-300 inline-flex items-center gap-1 hover:underline">
                Open Verification <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </Card>

          {/* Upcoming */}
          <Card title="Upcoming hearings" subtitle="Next 30 days">
            {data.upcomingEvents.length === 0 ? (
              <div className="text-sm text-obsidian-300 py-6">No scheduled hearings in the next 30 days.</div>
            ) : (
              <ul className="space-y-3">
                {data.upcomingEvents.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex items-start gap-3">
                    <div className="bg-obsidian-700/60 rounded px-2 py-1 text-center min-w-[44px]">
                      <div className="text-[10px] uppercase text-obsidian-300">
                        {new Date(e.start_at).toLocaleString('en-GB', { month: 'short' })}
                      </div>
                      <div className="font-serif text-lg text-gilt-300 leading-none">
                        {new Date(e.start_at).getDate()}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-obsidian-50 truncate">{e.title}</div>
                      <div className="text-[11px] text-obsidian-300">
                        {e.case_number || e.event_type.replace('_', ' ')} · {new Date(e.start_at).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Overdue work */}
          <Card
            title="Overdue work"
            subtitle="Bottlenecks needing attention"
            actions={
              <Link to="/workflow"><Button size="sm" variant="ghost">Open workflow</Button></Link>
            }
          >
            {data.overdueWork.length === 0 ? (
              <div className="text-sm text-truth-verified py-6 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Pipeline is clear of overdue items.
              </div>
            ) : (
              <ul className="divide-y divide-white/5 -mx-2">
                {data.overdueWork.slice(0, 6).map((w) => (
                  <li key={w.id} className="flex items-center justify-between px-2 py-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-obsidian-50 truncate">{w.title}</div>
                      <div className="text-[11px] text-obsidian-300 truncate">
                        {w.case_number || '—'} · stage {w.stage}
                      </div>
                    </div>
                    <Badge tone="escalation">due {fmtRelative(w.due_date)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Recent activity */}
          <Card
            title="Audit ledger (latest)"
            subtitle="Hash-chained, immutable"
            actions={
              <Link to="/audit"><Button size="sm" variant="ghost">Open audit</Button></Link>
            }
          >
            <ul className="divide-y divide-white/5 -mx-2">
              {data.auditSnapshot.map((entry) => (
                <li key={entry.id} className="px-2 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="gilt">{entry.action}</Badge>
                      <span className="text-xs text-obsidian-300 truncate">
                        {entry.entity_type} · {shortHash(entry.entity_id, 12)}
                      </span>
                    </div>
                    <div className="text-[11px] text-obsidian-400 mt-1">
                      {entry.actor_name || 'system'} · {fmtDateTime(entry.timestamp)}
                    </div>
                  </div>
                  <code className="text-[10px] font-mono text-obsidian-300 hidden md:block">
                    {shortHash(entry.hash, 12)}
                  </code>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Recent docs strip */}
        <Card title="Recent uploads" subtitle="Most recently filed documents">
          {data.recentDocs.length === 0 ? (
            <div className="text-sm text-obsidian-300 py-6 text-center">
              No documents uploaded yet. <Link to="/upload" className="text-gilt-300 underline">Upload one</Link>.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {data.recentDocs.map((d) => (
                <Link
                  key={d.id}
                  to="/cabinet"
                  className="surface p-3 hover:border-gilt-500/40 transition-colors group"
                >
                  <FileSearch className="w-5 h-5 text-gilt-400 mb-2" />
                  <div className="text-xs font-medium text-obsidian-50 truncate group-hover:text-gilt-200">
                    {d.original_name}
                  </div>
                  <div className="text-[10px] font-mono text-obsidian-400 mt-1">{shortHash(d.sha256, 12)}</div>
                  <div className="text-[10px] text-obsidian-300 mt-1">{fmtRelative(d.uploaded_at)}</div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </PageBody>
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  footnote,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  footnote: string;
  tone?: 'neutral' | 'verified' | 'escalation' | 'blocked';
}) {
  const accent =
    tone === 'verified'
      ? 'border-truth-verified/30 shadow-glow-verified'
      : tone === 'escalation'
      ? 'border-truth-escalation/30'
      : tone === 'blocked'
      ? 'border-truth-blocked/30'
      : 'border-white/5';
  return (
    <div className={`panel p-4 ${accent}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-obsidian-300">{label}</span>
        {icon}
      </div>
      <div className="font-serif text-3xl text-obsidian-50 mt-2">{value}</div>
      <div className="text-[11px] text-obsidian-300 mt-1">{footnote}</div>
    </div>
  );
}
