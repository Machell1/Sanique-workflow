import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncate(s: string, n = 80) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function shortHash(h: string, n = 8) {
  if (!h) return '';
  if (h.length <= n) return h;
  return h.slice(0, n) + '…';
}

export function classifyConfidence(c: number | null | undefined): {
  label: string;
  color: 'verified' | 'high' | 'escalation' | 'blocked';
  description: string;
} {
  if (c == null) return { label: 'Unrated', color: 'escalation', description: 'No confidence score available.' };
  if (c >= 1.0) return { label: '100% — Verified', color: 'verified', description: 'No flag, full citation required.' };
  if (c >= 0.99) return { label: '99% — High confidence', color: 'high', description: 'Flagged for human research.' };
  if (c >= 0.98) return { label: '98% — Escalation', color: 'escalation', description: 'Double-flagged, requires verification.' };
  return { label: '<98% — Blocked', color: 'blocked', description: 'Cannot be presented as fact.' };
}

export const STAGE_LABELS: Record<string, string> = {
  intake: 'Intake',
  review: 'Review',
  drafting: 'Drafting',
  verification: 'Verification',
  delivery: 'Delivery',
};

export const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  reserved: 'Reserved',
  judgment_pending: 'Judgment pending',
  closed: 'Closed',
};

export const TYPE_LABELS: Record<string, string> = {
  civil: 'Civil',
  criminal: 'Criminal',
  application: 'Application',
  procedural: 'Procedural',
  miscellaneous: 'Miscellaneous',
};

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface ProvenanceFacts {
  appVersion: string;
  documentId: string;
  title: string;
  docType: string;
  status: string;
  authorName: string;
  createdAt: number;
  exportedAt: number;
  contentSha256: string;
}

export function formatProvenanceBlock(p: ProvenanceFacts): string {
  return [
    '',
    '— — — — — — — — — — — — — — — — — — — — — — — — — — — — — — —',
    'PROVENANCE',
    '— — — — — — — — — — — — — — — — — — — — — — — — — — — — — — —',
    `Application       CLAW v${p.appVersion}`,
    `Document ID       ${p.documentId}`,
    `Document type     ${p.docType}`,
    `Status            ${p.status}`,
    `Author            ${p.authorName}`,
    `Created           ${new Date(p.createdAt).toISOString()}`,
    `Exported          ${new Date(p.exportedAt).toISOString()}`,
    `Content SHA-256   ${p.contentSha256}`,
    '',
    'This hash is computed over the document body at the moment of export.',
    'It proves the file you are holding is identical to what CLAW produced',
    'at the timestamp above. Any edit made in a word processor after export',
    'invalidates this seal. To verify, re-hash the body of this document',
    'and compare against the value above; or cross-check the document ID',
    'against the CLAW audit ledger.',
    '— — — — — — — — — — — — — — — — — — — — — — — — — — — — — — —',
  ].join('\n');
}

export const CATEGORY_LABELS: Record<string, string> = {
  record_of_appeal: 'Record of Appeal',
  submission: 'Submission',
  judgment: 'Judgment',
  order: 'Order',
  exhibit: 'Exhibit',
  correspondence: 'Correspondence',
  draft: 'Draft',
  other: 'Other',
};
