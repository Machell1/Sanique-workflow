import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, Send, Trash2, MessageSquare, Settings as SettingsIcon, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { PageHeader, PageBody } from '../components/layout/AppLayout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Textarea, Field, Select } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { fmtRelative, fmtDateTime } from '../lib/format';
import { classifyConfidence } from '../lib/utils';
import { useAppStore } from '../store';
import type { AgentThread, Case, Setting } from '../lib/types';

export function Agent() {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const threads = useQuery<AgentThread[]>({
    queryKey: ['agent', 'threads'],
    queryFn: () => api.agent.threads() as Promise<AgentThread[]>,
  });

  const cases = useQuery<Case[]>({
    queryKey: ['cases', 'list'],
    queryFn: () => api.cases.list() as Promise<Case[]>,
  });

  const settings = useQuery<Setting[]>({
    queryKey: ['settings', 'all'],
    queryFn: () => api.settings.all() as Promise<Setting[]>,
  });

  const provider = settings.data?.find((s) => s.key === 'ai.provider')?.value || 'none';
  const apiKeySet = (settings.data?.find((s) => s.key === 'ai.api_key')?.value || '').length > 0;

  useEffect(() => {
    if (!activeId && threads.data && threads.data.length > 0) {
      setActiveId(threads.data[0].id);
    }
  }, [threads.data, activeId]);

  const thread = useQuery<AgentThread>({
    queryKey: ['agent', 'thread', activeId],
    enabled: !!activeId,
    queryFn: () => api.agent.thread(activeId!) as Promise<AgentThread>,
  });

  const send = useMutation({
    mutationFn: (content: string) =>
      api.agent.send({ threadId: activeId!, content }, actor || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'thread', activeId] });
      qc.invalidateQueries({ queryKey: ['agent', 'threads'] });
      setDraft('');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.agent.deleteThread(id, actor || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'threads'] });
      setActiveId(null);
    },
  });

  const rename = useMutation({
    mutationFn: (patch: { id: string; title: string; case_id: string | null }) =>
      api.agent.updateThread(patch.id, { title: patch.title, case_id: patch.case_id }, actor || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'threads'] });
      qc.invalidateQueries({ queryKey: ['agent', 'thread', activeId] });
    },
  });

  const [renameOpen, setRenameOpen] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread.data?.messages?.length, send.isPending]);

  function submitMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !activeId || send.isPending) return;
    send.mutate(draft.trim());
  }

  return (
    <>
      <PageHeader
        title="Agent — KIMI CLAW"
        subtitle="AI legal assistant · grounded in your case file"
        actions={
          <>
            {provider === 'none' || !apiKeySet ? (
              <Link to="/settings">
                <Button variant="gilt">
                  <SettingsIcon className="w-4 h-4" /> Configure provider
                </Button>
              </Link>
            ) : (
              <Badge tone="verified">{provider} · key configured</Badge>
            )}
            <Button variant="gilt" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> New conversation
            </Button>
          </>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-220px)] min-h-[600px]">
          <div className="panel flex flex-col">
            <header className="px-4 py-3 border-b border-white/5">
              <h3 className="text-sm font-medium text-obsidian-100">Conversations</h3>
            </header>
            <div className="flex-1 overflow-y-auto">
              {threads.isLoading && (
                <div className="px-4 py-6 flex justify-center"><Spinner /></div>
              )}
              {threads.data?.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-obsidian-400">
                  No conversations yet
                </div>
              )}
              {threads.data?.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
                    activeId === t.id ? 'bg-gilt-500/10 border-l-2 border-l-gilt-400' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-obsidian-50 truncate">{t.title}</div>
                      {t.case_number && <div className="text-[11px] text-gilt-300 truncate">{t.case_number}</div>}
                    </div>
                    <MessageSquare className="w-3 h-3 text-obsidian-400 mt-1" />
                  </div>
                  <div className="text-[10px] text-obsidian-400 mt-1">
                    {t.message_count || 0} messages · {fmtRelative(t.updated_at)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="panel flex flex-col lg:col-span-3">
            {!activeId ? (
              <EmptyState
                illustration="/empty-state-agent.svg"
                title="Pick a conversation or start a new one"
                description="KIMI CLAW will help research authorities, summarise transcripts, and draft outline submissions. Always verify any citation before relying on it."
                action={
                  <Button variant="gilt" onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4" /> New conversation
                  </Button>
                }
              />
            ) : thread.isLoading ? (
              <div className="flex-1 flex items-center justify-center"><Spinner /></div>
            ) : (
              <>
                <header className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-obsidian-50">{thread.data?.title}</h2>
                    {thread.data?.case_number && (
                      <p className="text-[11px] text-obsidian-300 mt-0.5">{thread.data.case_number} · {thread.data.case_title}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setRenameOpen(true)} title="Rename / relink">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { if (confirm('Delete this conversation?')) remove.mutate(activeId!); }}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </header>

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
                  {(!thread.data?.messages || thread.data.messages.length === 0) && (
                    <div className="text-center text-sm text-obsidian-300 py-8">
                      Send the first message below.
                    </div>
                  )}
                  {thread.data?.messages?.map((m) => (
                    <article
                      key={m.id}
                      className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div
                        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                          m.role === 'user' ? 'bg-obsidian-700' : 'bg-gilt-500/20 border border-gilt-500/40'
                        }`}
                      >
                        {m.role === 'user' ? <span className="text-[11px] text-obsidian-200">YOU</span> : <Bot className="w-3.5 h-3.5 text-gilt-300" />}
                      </div>
                      <div className={`max-w-[80%] ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                        <div
                          className={`inline-block whitespace-pre-wrap text-sm rounded-lg px-4 py-3 ${
                            m.role === 'user'
                              ? 'bg-obsidian-700 text-obsidian-50'
                              : 'bg-obsidian-800/80 border border-white/5 text-obsidian-100'
                          }`}
                        >
                          {m.content}
                        </div>
                        <div className="text-[10px] text-obsidian-400 mt-1">
                          {fmtDateTime(m.created_at)}
                          {m.confidence != null && (
                            <Badge tone={classifyConfidence(m.confidence).color} className="ml-2">
                              {classifyConfidence(m.confidence).label}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                  {send.isPending && (
                    <div className="flex gap-3">
                      <div className="shrink-0 w-7 h-7 rounded-full bg-gilt-500/20 border border-gilt-500/40 flex items-center justify-center">
                        <Bot className="w-3.5 h-3.5 text-gilt-300" />
                      </div>
                      <div className="bg-obsidian-800/80 border border-white/5 rounded-lg px-4 py-3 inline-flex items-center gap-2 text-sm text-obsidian-300">
                        <Spinner /> KIMI is thinking…
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={submitMessage} className="border-t border-white/5 p-4">
                  <div className="flex gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Ask KIMI CLAW about authorities, draft a section, summarise transcripts…"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitMessage(e as any);
                      }}
                      className="flex-1 min-h-[60px]"
                    />
                    <Button type="submit" variant="gilt" disabled={!draft.trim() || send.isPending} className="self-end">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="text-[10px] text-obsidian-400 mt-2">
                    Press Ctrl+Enter to send. KIMI's output is advisory; verify all citations.
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </PageBody>

      {createOpen && (
        <CreateThreadModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          cases={cases.data || []}
          onCreated={(t) => {
            qc.invalidateQueries({ queryKey: ['agent', 'threads'] });
            setActiveId(t.id);
            setCreateOpen(false);
          }}
        />
      )}
      {renameOpen && thread.data && (
        <RenameThreadModal
          thread={thread.data}
          cases={cases.data || []}
          onClose={() => setRenameOpen(false)}
          onSaved={(patch) => {
            rename.mutate({ id: thread.data!.id, ...patch });
            setRenameOpen(false);
          }}
        />
      )}
    </>
  );
}

function RenameThreadModal({
  thread,
  cases,
  onClose,
  onSaved,
}: {
  thread: AgentThread;
  cases: Case[];
  onClose: () => void;
  onSaved: (patch: { title: string; case_id: string | null }) => void;
}) {
  const [title, setTitle] = useState(thread.title);
  const [caseId, setCaseId] = useState(thread.case_id || '');

  return (
    <Modal
      open
      onClose={onClose}
      title="Rename conversation"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gilt" onClick={() => onSaved({ title: title.trim() || 'Untitled', case_id: caseId || null })}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="block w-full h-10 rounded-md bg-obsidian-900/60 border border-white/10 px-3 py-2 text-sm text-obsidian-50 placeholder:text-obsidian-300 focus:outline-none focus:ring-2 focus:ring-gilt-500/40"
            autoFocus
          />
        </Field>
        <Field label="Linked case">
          <Select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            options={[{ value: '', label: '— None —' }, ...cases.map((c) => ({ value: c.id, label: `${c.case_number} · ${c.title}` }))]}
          />
        </Field>
      </div>
    </Modal>
  );
}

function CreateThreadModal({
  open,
  onClose,
  cases,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  cases: Case[];
  onCreated: (t: AgentThread) => void;
}) {
  const actor = useAppStore((s) => s.currentUser);
  const [title, setTitle] = useState('');
  const [caseId, setCaseId] = useState('');

  async function submit() {
    const t = (await api.agent.createThread({ title: title || 'New conversation', caseId: caseId || undefined }, actor || undefined)) as AgentThread;
    onCreated(t);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New conversation"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gilt" onClick={submit}>Create</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Research bail authorities"
            className="block w-full h-10 rounded-md bg-obsidian-900/60 border border-white/10 px-3 py-2 text-sm text-obsidian-50 placeholder:text-obsidian-300 focus:outline-none focus:ring-2 focus:ring-gilt-500/40"
            autoFocus
          />
        </Field>
        <Field label="Linked case" hint="optional">
          <Select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            options={[{ value: '', label: '— None —' }, ...cases.map((c) => ({ value: c.id, label: `${c.case_number} · ${c.title}` }))]}
          />
        </Field>
      </div>
    </Modal>
  );
}
