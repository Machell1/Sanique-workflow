import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PenSquare, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Field, Input } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { useAppStore } from '../../store';
import { fmtDateTime } from '../../lib/format';
import { shortHash } from '../../lib/utils';
import type { DocumentSignature, SignatureVerification } from '../../lib/types';

type Target =
  | { kind: 'generated'; generatedDocumentId: string }
  | { kind: 'uploaded'; documentId: string }
  | { kind: 'bundle'; bundleId: string };

interface Props {
  target: Target;
  disabled?: boolean;
}

export function SignatureControls({ target, disabled }: Props) {
  const qc = useQueryClient();
  const actor = useAppStore((s) => s.currentUser);
  const [signOpen, setSignOpen] = useState(false);
  const [verifying, setVerifying] = useState<Record<string, SignatureVerification | null>>({});

  const params =
    target.kind === 'generated' ? { generatedDocumentId: target.generatedDocumentId }
    : target.kind === 'uploaded' ? { documentId: target.documentId }
    : { bundleId: target.bundleId };

  const list = useQuery<DocumentSignature[]>({
    queryKey: ['signatures', target],
    queryFn: () => api.signatures.list(params) as Promise<DocumentSignature[]>,
  });

  async function verify(id: string) {
    setVerifying((v) => ({ ...v, [id]: null }));
    const result = (await api.signatures.verify(id)) as SignatureVerification;
    setVerifying((v) => ({ ...v, [id]: result }));
  }

  const sign = useMutation({
    mutationFn: (role: string) => {
      if (target.kind === 'generated') return api.signatures.signGenerated(target.generatedDocumentId, role, actor || undefined);
      if (target.kind === 'uploaded') return api.signatures.signUploaded(target.documentId, role, actor || undefined);
      return api.signatures.signBundle(target.bundleId, role, actor || undefined);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['signatures', target] });
      qc.invalidateQueries({ queryKey: ['generator'] }); // status becomes 'final' for generated
      setSignOpen(false);
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-obsidian-300">Signatures</span>
        <Button size="sm" variant="gilt" disabled={disabled} onClick={() => setSignOpen(true)}>
          <PenSquare className="w-3 h-3" /> Sign
        </Button>
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : (list.data?.length ?? 0) === 0 ? (
        <p className="text-[11px] text-obsidian-400">No signatures yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.data!.map((s) => {
            const v = verifying[s.id];
            const tone: any =
              v === null ? 'neutral'
              : v?.signature_valid && v?.content_unchanged ? 'verified'
              : v?.signature_valid && !v?.content_unchanged ? 'escalation'
              : v ? 'blocked'
              : 'neutral';
            return (
              <li key={s.id} className="surface p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-obsidian-50 font-medium truncate">{s.signer_name}</div>
                    <div className="text-[10px] text-obsidian-400">
                      {s.signer_role || 'signer'} · {fmtDateTime(s.signed_at)}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => verify(s.id)}>
                    {v === null ? <Spinner />
                      : v?.signature_valid && v?.content_unchanged ? <ShieldCheck className="w-3.5 h-3.5 text-truth-verified" />
                      : v?.signature_valid ? <ShieldAlert className="w-3.5 h-3.5 text-truth-escalation" />
                      : v ? <ShieldX className="w-3.5 h-3.5 text-truth-blocked" />
                      : <ShieldCheck className="w-3.5 h-3.5 text-obsidian-300" />}
                  </Button>
                </div>
                {v && (
                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                    <Badge tone={tone}>
                      {!v.signature_valid ? 'signature forged'
                        : !v.content_unchanged ? 'content drifted'
                        : 'verified'}
                    </Badge>
                    <code className="text-[10px] text-obsidian-400 font-mono">fp {v.public_key_fingerprint}</code>
                  </div>
                )}
                <code className="text-[10px] text-obsidian-400 font-mono block mt-1 break-all">
                  sha256 {shortHash(s.content_sha256, 22)}
                </code>
              </li>
            );
          })}
        </ul>
      )}

      {signOpen && (
        <SignModal
          onClose={() => setSignOpen(false)}
          onSign={(role) => sign.mutate(role)}
          submitting={sign.isPending}
          target={target}
        />
      )}
    </div>
  );
}

function SignModal({
  onClose, onSign, submitting, target,
}: {
  onClose: () => void;
  onSign: (role: string) => void;
  submitting: boolean;
  target: Target;
}) {
  const actor = useAppStore((s) => s.currentUser);
  const [role, setRole] = useState(actor?.rank || actor?.role || 'signer');
  const targetLabel =
    target.kind === 'generated' ? 'this generated draft (status will become FINAL)'
    : target.kind === 'uploaded' ? 'this uploaded document (its SHA-256 seal will be signed)'
    : 'this bundle (the merged PDF SHA-256 will be signed)';

  return (
    <Modal
      open
      onClose={onClose}
      title="Apply electronic signature"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="gilt" onClick={() => onSign(role)} disabled={submitting || !actor}>
            {submitting ? 'Signing…' : 'Sign'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-obsidian-200">
          You are about to sign <strong>{targetLabel}</strong> as <strong>{actor?.name || '(no active user)'}</strong>.
        </p>
        <Field label="Capacity" hint="how you want this signature labelled in the ledger">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Counsel / Registrar / Judge" />
        </Field>
        <div className="text-[11px] text-obsidian-400 space-y-1.5 surface p-3">
          <p>
            CLAW will sign the document with your private Ed25519 key, stored locally for you. The signature
            commits the document's SHA-256 hash, your name, your capacity, and the timestamp. The public
            key travels with the signature so anyone with this CLAW install (or the standalone verifier) can
            confirm authenticity.
          </p>
          <p>
            If the underlying content changes later, the verifier will say <em>content drifted</em> — the
            signature is still cryptographically yours, but the bytes it covers have moved.
          </p>
        </div>
      </div>
    </Modal>
  );
}
