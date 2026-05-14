import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, AlertCircle, Clock, GripVertical } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input, Field, Select, Textarea } from '../components/ui/Input';
import { FullPageSpinner } from '../components/ui/Spinner';
import { fmtRelative } from '../lib/format';
import { STAGE_LABELS } from '../lib/utils';
import { useAppStore } from '../store';
import type { WorkflowItem, WorkflowStage, PipelineSummary, Case, Priority } from '../lib/types';

const STAGES: WorkflowStage[] = ['intake', 'review', 'drafting', 'verification', 'delivery'];
const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

export function Workflow() {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [createOpen, setCreateOpen] = useState(false);

  const items = useQuery<WorkflowItem[]>({
    queryKey: ['workflow', 'list'],
    queryFn: () => api.workflow.list() as Promise<WorkflowItem[]>,
  });
  const summary = useQuery<PipelineSummary>({
    queryKey: ['workflow', 'summary'],
    queryFn: () => api.workflow.summary() as Promise<PipelineSummary>,
  });
  const cases = useQuery<Case[]>({
    queryKey: ['cases', 'list'],
    queryFn: () => api.cases.list() as Promise<Case[]>,
  });

  const advance = useMutation({
    mutationFn: (id: string) => api.workflow.advance(id, actor || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.workflow.delete(id, actor || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow'] }),
  });

  if (items.isLoading || summary.isLoading) return <FullPageSpinner label="Reading pipeline…" />;

  const grouped: Record<WorkflowStage, WorkflowItem[]> = {
    intake: [], review: [], drafting: [], verification: [], delivery: [],
  };
  (items.data || []).forEach((it) => grouped[it.stage].push(it));

  const bottleneck = summary.data?.bottleneck;

  return (
    <>
      <PageHeader
        title="Workflow"
        subtitle="Five-stage pipeline · intake → review → drafting → verification → delivery"
        actions={
          <>
            {bottleneck?.stage && (
              <Badge tone="escalation" className="mr-2">
                <AlertCircle className="w-3 h-3" /> bottleneck: {STAGE_LABELS[bottleneck.stage]} ({bottleneck.count})
              </Badge>
            )}
            <Button variant="gilt" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> New task
            </Button>
          </>
        }
      />

      <PageBody>
        {summary.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            <Stat label="In pipeline" value={(items.data || []).length} />
            <Stat label="Overdue" value={summary.data.overdue} tone="escalation" />
            <Stat label="Blocked" value={summary.data.blocked} tone="blocked" />
            {summary.data.byStage.map((s) => (
              <Stat key={s.stage} label={STAGE_LABELS[s.stage]} value={s.count} subtle />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {STAGES.map((stage, idx) => (
            <div key={stage} className="panel flex flex-col min-h-[60vh]">
              <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-obsidian-400">Stage {idx + 1}</div>
                  <h3 className="font-serif text-lg text-obsidian-50">{STAGE_LABELS[stage]}</h3>
                </div>
                <Badge tone="neutral">{grouped[stage].length}</Badge>
              </header>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {grouped[stage].length === 0 && (
                  <div className="text-xs text-obsidian-400 px-2 py-6 text-center border border-dashed border-white/5 rounded-md">
                    No items
                  </div>
                )}
                {grouped[stage].map((item) => (
                  <article key={item.id} className="surface p-3 group">
                    <div className="flex items-start justify-between gap-2">
                      <GripVertical className="w-3.5 h-3.5 text-obsidian-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-obsidian-50 leading-tight">{item.title}</h4>
                        {item.case_number && (
                          <p className="text-[11px] text-obsidian-300 mt-1 truncate">{item.case_number} · {item.case_title}</p>
                        )}
                      </div>
                      <PriorityBadge priority={item.priority} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-obsidian-400">
                      {item.due_date ? (
                        <span className={`flex items-center gap-1 ${item.due_date < Date.now() ? 'text-truth-escalation' : ''}`}>
                          <Clock className="w-3 h-3" /> {fmtRelative(item.due_date)}
                        </span>
                      ) : (
                        <span>—</span>
                      )}
                      {item.assignee_name && <span>{item.assignee_name}</span>}
                    </div>
                    <div className="mt-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {idx < STAGES.length - 1 && (
                        <Button size="sm" variant="ghost" onClick={() => advance.mutate(item.id)}>
                          Advance <ChevronRight className="w-3 h-3" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (confirm('Delete this task?')) remove.mutate(item.id);
                      }}>
                        Delete
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PageBody>

      {createOpen && (
        <CreateItemModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          cases={cases.data || []}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['workflow'] });
            setCreateOpen(false);
          }}
        />
      )}
    </>
  );
}

function Stat({ label, value, tone, subtle }: { label: string; value: number; tone?: 'escalation' | 'blocked'; subtle?: boolean }) {
  const accent =
    tone === 'escalation'
      ? 'border-truth-escalation/30 text-truth-escalation'
      : tone === 'blocked'
      ? 'border-truth-blocked/30 text-truth-blocked'
      : 'border-white/5 text-obsidian-50';
  return (
    <div className={`panel p-3 ${accent}`}>
      <div className={`text-[10px] uppercase tracking-wider ${subtle ? 'text-obsidian-400' : 'text-obsidian-300'}`}>{label}</div>
      <div className="font-serif text-2xl mt-1">{value}</div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const tone = priority === 'urgent' ? 'blocked' : priority === 'high' ? 'escalation' : priority === 'normal' ? 'info' : 'neutral';
  return <Badge tone={tone as any}>{priority}</Badge>;
}

function CreateItemModal({
  open,
  onClose,
  cases,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  cases: Case[];
  onCreated: () => void;
}) {
  const actor = useAppStore((s) => s.currentUser);
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<WorkflowStage>('intake');
  const [priority, setPriority] = useState<Priority>('normal');
  const [caseId, setCaseId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await api.workflow.create(
        {
          title: title.trim(),
          stage,
          priority,
          case_id: caseId || null,
          due_date: dueDate ? new Date(dueDate).getTime() : null,
          notes: notes.trim() || null,
        },
        actor || undefined
      );
      onCreated();
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
      title="New workflow task"
      description="Add a task to the pipeline."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gilt" onClick={submit} disabled={submitting || !title.trim()}>
            Create task
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cross-reference exhibits" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stage">
            <Select
              value={stage}
              onChange={(e) => setStage(e.target.value as WorkflowStage)}
              options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
            />
          </Field>
          <Field label="Priority">
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))}
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
        <Field label="Due date">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context" />
        </Field>
      </div>
    </Modal>
  );
}
