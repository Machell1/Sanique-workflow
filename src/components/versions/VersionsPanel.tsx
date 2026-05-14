import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Undo2, X, ArrowLeftRight } from 'lucide-react';
import { diffLines } from 'diff';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { fmtDateTime, fmtRelative } from '../../lib/format';
import { useAppStore } from '../../store';
import type { DraftVersionSummary, DraftVersionDetail } from '../../lib/types';

interface Props {
  draftId: string;
  onClose: () => void;
  onRestored: () => void;
}

export function VersionsPanel({ draftId, onClose, onRestored }: Props) {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [diffMode, setDiffMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);

  const list = useQuery<DraftVersionSummary[]>({
    queryKey: ['versions', draftId],
    queryFn: () => api.versions.list(draftId) as Promise<DraftVersionSummary[]>,
  });

  const detail = useQuery<DraftVersionDetail>({
    queryKey: ['version', activeId],
    enabled: !!activeId,
    queryFn: () => api.versions.get(activeId!) as Promise<DraftVersionDetail>,
  });

  const compareDetail = useQuery<DraftVersionDetail>({
    queryKey: ['version', compareId],
    enabled: !!compareId,
    queryFn: () => api.versions.get(compareId!) as Promise<DraftVersionDetail>,
  });

  const restore = useMutation({
    mutationFn: (id: string) => api.versions.restore(id, actor || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['generator'] });
      qc.invalidateQueries({ queryKey: ['versions', draftId] });
      onRestored();
    },
  });

  const diff = diffMode && detail.data && compareDetail.data
    ? diffLines(compareDetail.data.content, detail.data.content)
    : null;

  return (
    <aside className="h-full w-[28rem] shrink-0 border-l border-white/10 bg-obsidian-900 flex flex-col">
      <header className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-obsidian-100">Versions</h3>
          <p className="text-[10px] text-obsidian-400">Every save snapshots the body</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}><X className="w-4 h-4" /></Button>
      </header>

      {/* List of versions */}
      <div className="border-b border-white/5 max-h-60 overflow-y-auto">
        {list.isLoading && <div className="p-6 flex justify-center"><Spinner /></div>}
        {list.data?.length === 0 && (
          <div className="p-6 text-xs text-obsidian-400 text-center">No saved versions yet.</div>
        )}
        {list.data?.map((v) => {
          const isActive = activeId === v.id;
          const isCompare = compareId === v.id;
          return (
            <button
              key={v.id}
              onClick={() => {
                if (diffMode) {
                  if (isCompare) setCompareId(null);
                  else setCompareId(v.id);
                } else {
                  setActiveId(v.id);
                }
              }}
              className={`w-full text-left px-4 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors ${
                isActive ? 'bg-gilt-500/10' : isCompare ? 'bg-sky-500/10' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <Badge tone="neutral">v{v.version_no}</Badge>
                <Badge tone={v.status === 'final' ? 'verified' : v.status === 'reviewed' ? 'high' : 'neutral'}>
                  {v.status}
                </Badge>
                {isCompare && <Badge tone="info">compare</Badge>}
              </div>
              <div className="text-sm text-obsidian-50 mt-1 truncate">{v.title}</div>
              <div className="text-[11px] text-obsidian-400">
                {v.author_name || 'unknown'} · {fmtRelative(v.saved_at)} · {v.body_chars} chars
              </div>
            </button>
          );
        })}
      </div>

      {/* Version detail / diff */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
          <div className="text-xs text-obsidian-300">
            {!activeId ? 'Pick a version to inspect.' : detail.data ? `v${detail.data.version_no} · ${fmtDateTime(detail.data.saved_at)}` : '…'}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={diffMode ? 'gilt' : 'ghost'}
              onClick={() => setDiffMode((d) => !d)}
              title="Toggle diff mode — pick a second version on the left to compare"
              disabled={!activeId}
            >
              <ArrowLeftRight className="w-3 h-3" />
            </Button>
            {activeId && (
              <Button
                size="sm"
                variant="gilt"
                onClick={() => { if (confirm('Restore this version? The current content becomes a new snapshot.')) restore.mutate(activeId); }}
              >
                <Undo2 className="w-3 h-3" /> Restore
              </Button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm font-mono whitespace-pre-wrap leading-relaxed">
          {!activeId && (
            <p className="text-obsidian-400 text-xs">
              Click a version on the left to view its content. Click the diff icon then pick a second
              version to see the changes between the two.
            </p>
          )}
          {activeId && detail.isLoading && <Spinner />}
          {activeId && detail.data && !diff && (
            <pre className="text-obsidian-100">{detail.data.content}</pre>
          )}
          {diff && (
            <pre>
              {diff.map((part, i) => (
                <span
                  key={i}
                  className={
                    part.added
                      ? 'bg-truth-verified/15 text-truth-verified'
                      : part.removed
                      ? 'bg-truth-blocked/15 text-truth-blocked line-through'
                      : 'text-obsidian-300'
                  }
                >
                  {part.value}
                </span>
              ))}
            </pre>
          )}
        </div>
      </div>
    </aside>
  );
}
