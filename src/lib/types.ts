// Domain types — mirror SQLite schema. All timestamps are ms since epoch.

export type CaseType = 'civil' | 'criminal' | 'application' | 'procedural' | 'miscellaneous';
export type CaseStatus = 'open' | 'reserved' | 'judgment_pending' | 'closed';

export interface Case {
  id: string;
  case_number: string;
  title: string;
  case_type: CaseType;
  status: CaseStatus;
  filed_date: number | null;
  court_term: string | null;
  roster: string | null;
  presiding_judge: string | null;
  parties_appellant: string | null;
  parties_respondent: string | null;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export type DocCategory =
  | 'record_of_appeal'
  | 'submission'
  | 'judgment'
  | 'order'
  | 'exhibit'
  | 'correspondence'
  | 'draft'
  | 'other';

export interface CourtDocument {
  id: string;
  case_id: string | null;
  filename: string;
  original_name: string;
  mime_type: string | null;
  size: number | null;
  sha256: string;
  category: DocCategory;
  uploaded_by: string | null;
  uploaded_at: number;
  storage_path: string;
  notes: string | null;
  content_indexed_at: number | null;
  content_pages: number | null;
}

export type EventType = 'hearing' | 'case_management' | 'judgment_delivery' | 'admin' | 'deadline';
export interface CalendarEvent {
  id: string;
  case_id: string | null;
  case_number?: string | null;
  case_title?: string | null;
  title: string;
  description: string | null;
  start_at: number;
  end_at: number;
  event_type: EventType;
  location: string | null;
  court_term: string | null;
  roster: string | null;
  created_at: number;
}

export type WorkflowStage = 'intake' | 'review' | 'drafting' | 'verification' | 'delivery';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface WorkflowItem {
  id: string;
  case_id: string | null;
  case_number?: string | null;
  case_title?: string | null;
  assignee_name?: string | null;
  title: string;
  stage: WorkflowStage;
  assigned_to: string | null;
  priority: Priority;
  due_date: number | null;
  blocked_reason: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface AuditEntry {
  id: number;
  timestamp: number;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  payload: string | null;
  prev_hash: string;
  hash: string;
}

export type VerificationStatus = 'verified' | 'high_confidence' | 'escalation' | 'blocked';

export interface Verification {
  id: string;
  document_id: string | null;
  case_id: string | null;
  citation: string;
  citation_type: string | null;
  status: VerificationStatus;
  confidence: number;
  source: string | null;
  notes: string | null;
  checked_at: number;
}

export interface GeneratedDocument {
  id: string;
  case_id: string | null;
  doc_type: string;
  title: string;
  content: string;
  status: 'draft' | 'reviewed' | 'final';
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface AgentThread {
  id: string;
  case_id: string | null;
  case_number?: string | null;
  case_title?: string | null;
  message_count?: number;
  title: string;
  created_at: number;
  updated_at: number;
  messages?: AgentMessage[];
}

export interface AgentMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  confidence: number | null;
  citations: string | null;
  created_at: number;
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  role: 'judge' | 'registrar' | 'counsel' | 'clerk' | 'admin';
  rank: string | null;
  is_current?: number;
  created_at?: number;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: number;
  _masked?: boolean;
}

export interface DashboardSnapshot {
  cases: { total: number; open: number; reserved: number; judgment_pending: number };
  upcomingEvents: CalendarEvent[];
  overdueWork: WorkflowItem[];
  recentDocs: { id: string; original_name: string; sha256: string; uploaded_at: number }[];
  verificationCounts: { status: VerificationStatus; count: number }[];
  auditSnapshot: AuditEntry[];
  auditChain: { ok: boolean; brokenAt?: number; total: number };
}

export interface PipelineSummary {
  stages: WorkflowStage[];
  byStage: { stage: WorkflowStage; count: number }[];
  blocked: number;
  overdue: number;
  bottleneck: { stage: WorkflowStage | null; count: number };
}

// IPC envelope
export interface IpcOk<T> {
  ok: true;
  data: T;
}
export interface IpcErr {
  ok: false;
  error: string;
}
export type IpcResult<T> = IpcOk<T> | IpcErr;

declare global {
  interface Window {
    claw: {
      api: {
        invoke: <T = unknown>(channel: string, args?: unknown) => Promise<IpcResult<T>>;
      };
      files: {
        pick: (options?: { multi?: boolean; filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; paths?: string[] }>;
        pickSave: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; path?: string }>;
        showItem: (path: string) => Promise<boolean>;
        openItem: (path: string) => Promise<boolean>;
      };
      app: {
        version: () => Promise<string>;
        dataDir: () => Promise<string>;
        print: () => Promise<{ ok: boolean; error?: string | null }>;
      };
    };
  }
}
