import { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field, Input, Textarea } from '../ui/Input';
import { api } from '../../lib/api';
import { useAppStore } from '../../store';

interface Props {
  onClose: () => void;
  target:
    | { kind: 'document'; documentId: string; defaultSubject: string }
    | { kind: 'generated'; generatedDocumentId: string; defaultSubject: string };
}

export function EmailComposeModal({ onClose, target }: Props) {
  const actor = useAppStore((s) => s.currentUser);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(target.defaultSubject);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const input = { to, cc, subject, body };
      const res: any =
        target.kind === 'document'
          ? await api.email.exportDocument({ documentId: target.documentId, ...input }, actor || undefined)
          : await api.email.exportGenerated({ generatedDocumentId: target.generatedDocumentId, ...input, format: 'md' }, actor || undefined);
      if (!res?.ok) {
        setErr(res?.error || 'Failed to open default mail client.');
        return;
      }
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Send by email"
      description="CLAW writes an .eml file and opens it in your default mail client — recipient and send action are yours."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gilt" onClick={submit} disabled={submitting}>
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</> : <><Mail className="w-4 h-4" /> Open in mail client</>}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="To"><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@coa.gov.jm" /></Field>
          <Field label="Cc"><Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" /></Field>
        </div>
        <Field label="Subject" required>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Body">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[160px]"
            placeholder={`Dear …\n\nPlease find attached …\n\nRegards,\n${actor?.name || ''}`}
          />
        </Field>
        {err && <div className="text-sm text-truth-blocked surface p-2 border-truth-blocked/30">{err}</div>}
        <p className="text-[11px] text-obsidian-400">
          The document is attached automatically. CLAW does not see your final draft or who you send it to —
          your mail client owns the rest of the flow.
        </p>
      </div>
    </Modal>
  );
}
