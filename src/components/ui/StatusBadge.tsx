import { Badge } from './Badge';
import type { CaseStatus, VerificationStatus } from '../../lib/types';

const caseTone: Record<CaseStatus, 'neutral' | 'verified' | 'high' | 'escalation' | 'blocked' | 'info'> = {
  open: 'info',
  reserved: 'high',
  judgment_pending: 'escalation',
  closed: 'neutral',
};

const caseLabel: Record<CaseStatus, string> = {
  open: 'Open',
  reserved: 'Reserved',
  judgment_pending: 'Judgment pending',
  closed: 'Closed',
};

const verifTone: Record<VerificationStatus, 'verified' | 'high' | 'escalation' | 'blocked'> = {
  verified: 'verified',
  high_confidence: 'high',
  escalation: 'escalation',
  blocked: 'blocked',
};

const verifLabel: Record<VerificationStatus, string> = {
  verified: '100% Verified',
  high_confidence: '99% High',
  escalation: '98% Escalate',
  blocked: '<98% Blocked',
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <Badge tone={caseTone[status]}>{caseLabel[status]}</Badge>;
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return <Badge tone={verifTone[status]}>{verifLabel[status]}</Badge>;
}
