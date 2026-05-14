import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  addMonths,
  subMonths,
} from 'date-fns';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Field, Input, Select, Textarea } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import type { CalendarEvent, EventType, Case } from '../lib/types';

const TERMS = ['Hilary', 'Easter', 'Trinity'];
const ROSTERS = ['Roster A', 'Roster B', 'Roster C', 'Roster D'];
const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'hearing', label: 'Hearing' },
  { value: 'case_management', label: 'Case management' },
  { value: 'judgment_delivery', label: 'Judgment delivery' },
  { value: 'admin', label: 'Admin' },
  { value: 'deadline', label: 'Deadline' },
];

const EVENT_COLORS: Record<EventType, string> = {
  hearing: 'bg-sky-500/30 text-sky-100',
  case_management: 'bg-violet-500/30 text-violet-100',
  judgment_delivery: 'bg-gilt-500/30 text-gilt-100',
  admin: 'bg-obsidian-500/30 text-obsidian-100',
  deadline: 'bg-truth-blocked/30 text-red-100',
};

export function Schedule() {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [cursor, setCursor] = useState(new Date());
  const [term, setTerm] = useState<string>('');
  const [roster, setRoster] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const visibleStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const visibleEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });

  const events = useQuery<CalendarEvent[]>({
    queryKey: ['calendar', visibleStart.getTime(), visibleEnd.getTime(), term, roster],
    queryFn: () =>
      api.calendar.list({
        from: visibleStart.getTime(),
        to: visibleEnd.getTime(),
        term: term || undefined,
        roster: roster || undefined,
      }) as Promise<CalendarEvent[]>,
  });

  const cases = useQuery<Case[]>({
    queryKey: ['cases', 'list'],
    queryFn: () => api.cases.list() as Promise<Case[]>,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.calendar.delete(id, actor || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  });

  const days = useMemo(() => eachDayOfInterval({ start: visibleStart, end: visibleEnd }), [visibleStart, visibleEnd]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    (events.data || []).forEach((e) => {
      const key = format(new Date(e.start_at), 'yyyy-MM-dd');
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    });
    return map;
  }, [events.data]);

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="Court calendar across three terms and four rosters"
        actions={
          <Button variant="gilt" onClick={() => { setSelectedDate(new Date()); setCreateOpen(true); }}>
            <Plus className="w-4 h-4" /> New event
          </Button>
        }
      />
      <PageBody className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setCursor(subMonths(cursor, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h2 className="font-serif text-xl text-obsidian-50 min-w-[180px] text-center">
                {format(cursor, 'MMMM yyyy')}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setCursor(addMonths(cursor, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                options={[{ value: '', label: 'All terms' }, ...TERMS.map((t) => ({ value: t, label: t }))]}
                className="h-9 w-36"
              />
              <Select
                value={roster}
                onChange={(e) => setRoster(e.target.value)}
                options={[{ value: '', label: 'All rosters' }, ...ROSTERS.map((r) => ({ value: r, label: r }))]}
                className="h-9 w-36"
              />
            </div>
          </div>
        </Card>

        <Card>
          {events.isLoading && <div className="py-12 flex justify-center"><Spinner /></div>}
          {!events.isLoading && (
            <div className="grid grid-cols-7 gap-px bg-white/5 rounded-md overflow-hidden">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="bg-obsidian-900 px-2 py-2 text-[11px] uppercase text-obsidian-300 font-medium">
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayEvents = eventsByDay.get(key) || [];
                const inMonth = isSameMonth(day, cursor);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={key}
                    onClick={() => { setSelectedDate(day); setCreateOpen(true); }}
                    className={cn(
                      'bg-obsidian-900/80 min-h-[110px] p-2 text-left transition-colors hover:bg-obsidian-700/50',
                      !inMonth && 'opacity-40'
                    )}
                  >
                    <div className={cn('text-xs font-medium mb-1.5 inline-flex items-center gap-1', isToday && 'text-gilt-300')}>
                      {format(day, 'd')}
                      {isToday && <span className="w-1 h-1 rounded-full bg-gilt-400" />}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((e) => (
                        <div
                          key={e.id}
                          className={cn('text-[10px] px-1.5 py-0.5 rounded truncate', EVENT_COLORS[e.event_type])}
                          title={e.title}
                        >
                          {format(new Date(e.start_at), 'HH:mm')} · {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-obsidian-300">+{dayEvents.length - 3} more</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="All events this view" subtitle={`${events.data?.length || 0} entries`}>
          {!events.data || events.data.length === 0 ? (
            <p className="text-sm text-obsidian-300 py-4">No events in the visible range.</p>
          ) : (
            <ul className="divide-y divide-white/5 -mx-2">
              {events.data.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-2 py-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <CalendarIcon className="w-4 h-4 text-gilt-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-obsidian-50 truncate">{e.title}</div>
                      <div className="text-[11px] text-obsidian-300">
                        {format(new Date(e.start_at), 'd MMM yyyy, HH:mm')}–{format(new Date(e.end_at), 'HH:mm')}
                        {e.case_number && ` · ${e.case_number}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{e.event_type.replace('_', ' ')}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { if (confirm('Delete this event?')) remove.mutate(e.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>

      {createOpen && (
        <CreateEventModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          initialDate={selectedDate || new Date()}
          cases={cases.data || []}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['calendar'] });
            setCreateOpen(false);
          }}
        />
      )}
    </>
  );
}

function CreateEventModal({
  open,
  onClose,
  initialDate,
  cases,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialDate: Date;
  cases: Case[];
  onCreated: () => void;
}) {
  const actor = useAppStore((s) => s.currentUser);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(format(initialDate, 'yyyy-MM-dd'));
  const [start, setStart] = useState('09:30');
  const [end, setEnd] = useState('11:00');
  const [type, setType] = useState<EventType>('hearing');
  const [caseId, setCaseId] = useState('');
  const [term, setTerm] = useState('Hilary');
  const [roster, setRoster] = useState('Roster A');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const startMs = new Date(`${date}T${start}:00`).getTime();
      const endMs = new Date(`${date}T${end}:00`).getTime();
      await api.calendar.create(
        {
          title: title.trim(),
          start_at: startMs,
          end_at: endMs,
          event_type: type,
          case_id: caseId || null,
          court_term: term,
          roster,
          description: description.trim() || null,
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
      title="New calendar event"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gilt" onClick={submit} disabled={submitting || !title.trim()}>Create</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hearing — Smith v Jones" autoFocus />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Start"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as EventType)} options={EVENT_TYPES} />
          </Field>
          <Field label="Term">
            <Select value={term} onChange={(e) => setTerm(e.target.value)} options={TERMS.map((t) => ({ value: t, label: t }))} />
          </Field>
          <Field label="Roster">
            <Select value={roster} onChange={(e) => setRoster(e.target.value)} options={ROSTERS.map((r) => ({ value: r, label: r }))} />
          </Field>
        </div>
        <Field label="Linked case">
          <Select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            options={[{ value: '', label: '— None —' }, ...cases.map((c) => ({ value: c.id, label: `${c.case_number} · ${c.title}` }))]}
          />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}
