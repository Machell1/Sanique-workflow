import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlus, Pencil, Trash2, Save, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Field, Input, Textarea, Select } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { useAppStore } from '../../store';
import { fmtRelative } from '../../lib/format';
import type { DocumentNote } from '../../lib/types';

const COLORS: DocumentNote['color'][] = ['gilt', 'verified', 'escalation', 'blocked', 'info', 'neutral'];

interface Props {
  documentId: string;
  caseId: string | null;
}

export function NotesPanel({ documentId, caseId }: Props) {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<DocumentNote | null>(null);

  const notes = useQuery<DocumentNote[]>({
    queryKey: ['notes', documentId],
    queryFn: () => api.notes.list({ documentId }) as Promise<DocumentNote[]>,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.notes.delete(id, actor || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', documentId] }),
  });

  return (
    <aside className="h-full w-80 shrink-0 border-l border-white/10 bg-obsidian-900 flex flex-col">
      <header className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-obsidian-100">Notes</h3>
          <p className="text-[10px] text-obsidian-400">Stay linked to this document; the file itself isn't modified</p>
        </div>
        <Button size="sm" variant="gilt" onClick={() => { setComposing(true); setEditing(null); }}>
          <MessageSquarePlus className="w-3.5 h-3.5" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {notes.isLoading && <div className="p-6 flex justify-center"><Spinner /></div>}
        {!notes.isLoading && (notes.data?.length ?? 0) === 0 && !composing && (
          <div className="p-6 text-xs text-obsidian-400 text-center">
            No notes yet. Click the + button to pin one to this document or to a specific page.
          </div>
        )}
        {composing && (
          <NoteEditor
            documentId={documentId}
            caseId={caseId}
            onClose={() => setComposing(false)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ['notes', documentId] });
              setComposing(false);
            }}
          />
        )}
        {(notes.data || []).map((n) =>
          editing?.id === n.id ? (
            <NoteEditor
              key={n.id}
              documentId={documentId}
              caseId={caseId}
              note={n}
              onClose={() => setEditing(null)}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ['notes', documentId] });
                setEditing(null);
              }}
            />
          ) : (
            <article key={n.id} className="px-4 py-3 border-b border-white/5">
              <div className="flex items-start gap-2">
                <Badge tone={n.color as any}>
                  {n.page ? `p. ${n.page}` : 'whole document'}
                </Badge>
                <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(n)} title="Edit">
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm('Delete this note?')) remove.mutate(n.id); }} title="Delete">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-obsidian-50 mt-1 whitespace-pre-wrap">{n.body}</p>
              <div className="text-[10px] text-obsidian-400 mt-1">
                {n.author_name || 'unknown'} · {fmtRelative(n.created_at)}
                {n.updated_at !== n.created_at && ' · edited'}
              </div>
              <div className="mt-1 flex items-center gap-0.5">
                <Button size="sm" variant="ghost" onClick={() => setEditing(n)} title="Edit"><Pencil className="w-3 h-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm('Delete this note?')) remove.mutate(n.id); }} title="Delete"><Trash2 className="w-3 h-3" /></Button>
              </div>
            </article>
          )
        )}
      </div>
    </aside>
  );
}

function NoteEditor({
  documentId,
  caseId,
  note,
  onClose,
  onSaved,
}: {
  documentId: string;
  caseId: string | null;
  note?: DocumentNote;
  onClose: () => void;
  onSaved: () => void;
}) {
  const actor = useAppStore((s) => s.currentUser);
  const [body, setBody] = useState(note?.body || '');
  const [page, setPage] = useState<string>(note?.page ? String(note.page) : '');
  const [color, setColor] = useState<DocumentNote['color']>(note?.color || 'gilt');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        body: body.trim(),
        color,
        page: page ? parseInt(page, 10) : null,
      };
      if (note) {
        await api.notes.update(note.id, payload, actor || undefined);
      } else {
        await api.notes.create({ documentId, caseId, ...payload }, actor || undefined);
      }
      onSaved();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 py-3 border-b border-white/5 bg-obsidian-800/60">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-obsidian-300">
          {note ? 'Edit note' : 'New note'}
        </span>
        <Button size="sm" variant="ghost" onClick={onClose}><X className="w-3 h-3" /></Button>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Observation, query, action point…"
        className="min-h-[100px] text-sm"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Field label="Page" hint="blank = whole doc">
          <Input type="number" value={page} onChange={(e) => setPage(e.target.value)} placeholder="3" />
        </Field>
        <Field label="Colour">
          <Select
            value={color}
            onChange={(e) => setColor(e.target.value as DocumentNote['color'])}
            options={COLORS.map((c) => ({ value: c, label: c }))}
          />
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="gilt" onClick={submit} disabled={submitting || !body.trim()}>
          <Save className="w-3 h-3" /> Save
        </Button>
      </div>
    </div>
  );
}
