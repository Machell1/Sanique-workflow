import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldX, Search, Download, History } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { EmptyState } from '../components/ui/EmptyState';
import { FullPageSpinner } from '../components/ui/Spinner';
import { fmtDateTime } from '../lib/format';
import { shortHash } from '../lib/utils';
import type { AuditEntry } from '../lib/types';

export function Audit() {
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const chain = useQuery<{ ok: boolean; total: number; brokenAt?: number }>({
    queryKey: ['audit', 'verify'],
    queryFn: () => api.audit.verify() as Promise<{ ok: boolean; total: number; brokenAt?: number }>,
  });

  const list = useQuery<AuditEntry[]>({
    queryKey: ['audit', 'list', activeSearch, page],
    queryFn: () =>
      api.audit.list({
        search: activeSearch || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }) as Promise<AuditEntry[]>,
  });

  const count = useQuery<number>({
    queryKey: ['audit', 'count', activeSearch],
    queryFn: () => api.audit.count({ search: activeSearch || undefined }) as Promise<number>,
  });

  function exportJson() {
    if (!list.data) return;
    const blob = new Blob([JSON.stringify(list.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claw-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (chain.isLoading || list.isLoading) return <FullPageSpinner label="Verifying chain…" />;

  return (
    <>
      <PageHeader
        title="Audit ledger"
        subtitle="Immutable, hash-chained record of every significant action"
        actions={
          <Button variant="ghost" onClick={exportJson}>
            <Download className="w-4 h-4" /> Export JSON
          </Button>
        }
      />

      <PageBody className="space-y-6">
        <Card
          title="Chain integrity"
          subtitle={chain.data?.ok ? 'Cryptographically verified end-to-end' : 'Chain has been tampered'}
        >
          <div className="flex items-center gap-4">
            {chain.data?.ok ? (
              <ShieldCheck className="w-12 h-12 text-truth-verified" />
            ) : (
              <ShieldX className="w-12 h-12 text-truth-blocked" />
            )}
            <div className="flex-1">
              <div className="font-serif text-2xl text-obsidian-50">
                {chain.data?.ok ? 'INTACT' : 'BROKEN'}
              </div>
              <div className="text-sm text-obsidian-300 mt-1">
                {chain.data?.total} entries · SHA-256 hash chain · GENESIS → current
              </div>
              {!chain.data?.ok && (
                <div className="text-sm text-truth-blocked mt-1">
                  Tampering detected at entry #{chain.data?.brokenAt}.
                </div>
              )}
            </div>
            <Badge tone={chain.data?.ok ? 'verified' : 'blocked'}>
              {chain.data?.total || 0} entries
            </Badge>
          </div>
        </Card>

        <Card
          title="Ledger"
          subtitle={`Showing ${list.data?.length || 0} of ${count.data || 0}`}
          actions={
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setActiveSearch(search);
                setPage(0);
              }}
            >
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-obsidian-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search action, entity, actor"
                  className="pl-8 h-9 w-72"
                />
              </div>
              <Button size="sm" variant="secondary" type="submit">Filter</Button>
            </form>
          }
        >
          {list.data?.length === 0 ? (
            <EmptyState
              illustration="/empty-state-audit.svg"
              title="No audit entries yet"
              description="Audit entries are written automatically when you create cases, upload documents, run verifications, or change settings."
            />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH className="w-16">#</TH>
                    <TH>Timestamp</TH>
                    <TH>Actor</TH>
                    <TH>Action</TH>
                    <TH>Entity</TH>
                    <TH>Hash</TH>
                  </TR>
                </THead>
                <TBody>
                  {(list.data || []).map((entry) => (
                    <TR key={entry.id}>
                      <TD className="font-mono text-xs text-obsidian-400">{entry.id}</TD>
                      <TD className="text-xs">{fmtDateTime(entry.timestamp)}</TD>
                      <TD className="text-sm">{entry.actor_name || <span className="text-obsidian-400">system</span>}</TD>
                      <TD>
                        <Badge tone="gilt">{entry.action}</Badge>
                      </TD>
                      <TD className="text-xs text-obsidian-300">
                        {entry.entity_type} · {shortHash(entry.entity_id, 12)}
                      </TD>
                      <TD>
                        <code className="text-[10px] font-mono text-obsidian-400">{shortHash(entry.hash, 14)}</code>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/5">
                <div className="text-xs text-obsidian-300">
                  Page {page + 1} of {Math.max(1, Math.ceil((count.data || 0) / PAGE_SIZE))}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={(page + 1) * PAGE_SIZE >= (count.data || 0)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        <Card title="How the chain works" subtitle="Tamper-evidence by construction">
          <div className="prose prose-invert max-w-none text-sm text-obsidian-200">
            <p>
              Each entry in the audit log carries the SHA-256 hash of its own canonical material plus the
              hash of the previous entry. The genesis entry uses the literal string{' '}
              <code className="text-gilt-300">GENESIS</code> as its predecessor.
            </p>
            <p className="mt-2">
              Modifying any historic entry — even by a single byte — will cause its computed hash to no longer match
              the stored hash, and will break the chain for every subsequent entry. The integrity check above re-derives
              every hash from scratch and detects the first mismatch.
            </p>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
