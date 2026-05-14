-- Sanique's workspace — SQLite schema
-- All timestamps are stored as Unix milliseconds (INTEGER).

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('judge','registrar','counsel','clerk','admin')),
  rank TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  case_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK (case_type IN ('civil','criminal','application','procedural','miscellaneous')),
  status TEXT NOT NULL CHECK (status IN ('open','reserved','judgment_pending','closed')),
  filed_date INTEGER,
  court_term TEXT,
  roster TEXT,
  presiding_judge TEXT,
  parties_appellant TEXT,
  parties_respondent TEXT,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  sha256 TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('record_of_appeal','submission','judgment','order','exhibit','correspondence','draft','other')),
  uploaded_by TEXT REFERENCES users(id),
  uploaded_at INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  notes TEXT,
  content_indexed_at INTEGER,
  content_pages INTEGER
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('hearing','case_management','judgment_delivery','admin','deadline')),
  location TEXT,
  court_term TEXT,
  roster TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_items (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('intake','review','drafting','verification','delivery')),
  assigned_to TEXT REFERENCES users(id),
  priority TEXT NOT NULL CHECK (priority IN ('low','normal','high','urgent')),
  due_date INTEGER,
  blocked_reason TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT,
  prev_hash TEXT,
  hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
  citation TEXT NOT NULL,
  citation_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('verified','high_confidence','escalation','blocked')),
  confidence REAL NOT NULL,
  source TEXT,
  notes TEXT,
  checked_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS generated_documents (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','reviewed','final')),
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_threads (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  confidence REAL,
  citations TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_at);
CREATE INDEX IF NOT EXISTS idx_workflow_stage ON workflow_items(stage);
CREATE INDEX IF NOT EXISTS idx_workflow_case ON workflow_items(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_verifications_case ON verifications(case_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_thread ON agent_messages(thread_id);

-- v2.6.0 schema additions ---------------------------------------------------

-- Compound PDFs produced by merging multiple source documents (e.g. Record
-- of Appeal). The output is itself a `documents` row; this table records
-- which sources produced it, in order.
CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY,
  output_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_documents TEXT NOT NULL, -- JSON array of {document_id, page_count}
  page_count INTEGER,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bundles_case ON bundles(case_id);

-- Every save of a generated document snapshots its full content here so
-- the lawyer can scroll back to yesterday's wording or diff two versions.
CREATE TABLE IF NOT EXISTS draft_versions (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES generated_documents(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  saved_by TEXT REFERENCES users(id),
  saved_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_draft_versions ON draft_versions(draft_id, version_no);

-- Text notes the user pins to a document (whole-doc or per-page).
-- First-pass annotation system; not a paint-on-PDF
-- replacement, but a structured way to record observations without
-- modifying the underlying file (which would break its SHA-256 seal).
CREATE TABLE IF NOT EXISTS document_notes (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
  page INTEGER, -- NULL = whole-document note
  body TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'gilt' CHECK (color IN ('gilt','verified','escalation','blocked','info','neutral')),
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_document_notes_doc ON document_notes(document_id);

-- Per-user Ed25519 keypair. Generated on first use of the signing
-- feature; private key stays on this machine; public key travels with
-- every signed document so anyone with the public key can verify the
-- signature (a small standalone verifier ships with the repo).
CREATE TABLE IF NOT EXISTS user_keys (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_key_pem TEXT NOT NULL,
  private_key_pem TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- A cryptographic signature affixed to a document (uploaded, generated,
-- or bundle). The signed payload is the content's SHA-256 plus the
-- signer's name plus the timestamp; the signature itself is base64
-- Ed25519 over that payload.
CREATE TABLE IF NOT EXISTS document_signatures (
  id TEXT PRIMARY KEY,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  generated_document_id TEXT REFERENCES generated_documents(id) ON DELETE CASCADE,
  bundle_id TEXT REFERENCES bundles(id) ON DELETE CASCADE,
  signed_by TEXT NOT NULL REFERENCES users(id),
  signer_name TEXT NOT NULL,
  signer_role TEXT,
  content_sha256 TEXT NOT NULL,
  signature_b64 TEXT NOT NULL,
  public_key_pem TEXT NOT NULL,
  signed_at INTEGER NOT NULL,
  CHECK (
    (document_id IS NOT NULL AND generated_document_id IS NULL AND bundle_id IS NULL) OR
    (document_id IS NULL AND generated_document_id IS NOT NULL AND bundle_id IS NULL) OR
    (document_id IS NULL AND generated_document_id IS NULL AND bundle_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_signatures_document ON document_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_generated ON document_signatures(generated_document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_bundle ON document_signatures(bundle_id);

-- ─── Full-text search (FTS5) ───
-- Each FTS table mirrors the searchable columns of its source table.
-- Triggers keep them in sync on INSERT / UPDATE / DELETE so we never serve
-- stale results. The `rowid` column is the FTS5 join key and stores the
-- source row's primary key (or rowid for tables with INTEGER PKs).

CREATE VIRTUAL TABLE IF NOT EXISTS cases_fts USING fts5(
  case_number, title, parties, description, content=''
);
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  original_name, notes, content=''
);
CREATE VIRTUAL TABLE IF NOT EXISTS documents_content_fts USING fts5(
  body, content=''
);
CREATE VIRTUAL TABLE IF NOT EXISTS generated_documents_fts USING fts5(
  title, body, content=''
);
CREATE VIRTUAL TABLE IF NOT EXISTS agent_messages_fts USING fts5(
  content, content=''
);
CREATE VIRTUAL TABLE IF NOT EXISTS audit_log_fts USING fts5(
  action, entity_id, payload, actor_name, content=''
);

-- Cases triggers
CREATE TRIGGER IF NOT EXISTS cases_ai AFTER INSERT ON cases BEGIN
  INSERT INTO cases_fts(rowid, case_number, title, parties, description)
  VALUES (new.oid, new.case_number, new.title,
          coalesce(new.parties_appellant,'') || ' ' || coalesce(new.parties_respondent,''),
          coalesce(new.description,''));
END;
CREATE TRIGGER IF NOT EXISTS cases_ad AFTER DELETE ON cases BEGIN
  INSERT INTO cases_fts(cases_fts, rowid, case_number, title, parties, description)
  VALUES ('delete', old.oid, old.case_number, old.title,
          coalesce(old.parties_appellant,'') || ' ' || coalesce(old.parties_respondent,''),
          coalesce(old.description,''));
END;
CREATE TRIGGER IF NOT EXISTS cases_au AFTER UPDATE ON cases BEGIN
  INSERT INTO cases_fts(cases_fts, rowid, case_number, title, parties, description)
  VALUES ('delete', old.oid, old.case_number, old.title,
          coalesce(old.parties_appellant,'') || ' ' || coalesce(old.parties_respondent,''),
          coalesce(old.description,''));
  INSERT INTO cases_fts(rowid, case_number, title, parties, description)
  VALUES (new.oid, new.case_number, new.title,
          coalesce(new.parties_appellant,'') || ' ' || coalesce(new.parties_respondent,''),
          coalesce(new.description,''));
END;

-- Documents triggers
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, original_name, notes)
  VALUES (new.oid, new.original_name, coalesce(new.notes,''));
END;
CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, original_name, notes)
  VALUES ('delete', old.oid, old.original_name, coalesce(old.notes,''));
  INSERT INTO documents_content_fts(documents_content_fts, rowid, body)
  SELECT 'delete', old.oid, body FROM documents_content_fts WHERE rowid = old.oid;
END;
CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, original_name, notes)
  VALUES ('delete', old.oid, old.original_name, coalesce(old.notes,''));
  INSERT INTO documents_fts(rowid, original_name, notes)
  VALUES (new.oid, new.original_name, coalesce(new.notes,''));
END;

-- Generated documents triggers
CREATE TRIGGER IF NOT EXISTS gen_ai AFTER INSERT ON generated_documents BEGIN
  INSERT INTO generated_documents_fts(rowid, title, body)
  VALUES (new.oid, new.title, new.content);
END;
CREATE TRIGGER IF NOT EXISTS gen_ad AFTER DELETE ON generated_documents BEGIN
  INSERT INTO generated_documents_fts(generated_documents_fts, rowid, title, body)
  VALUES ('delete', old.oid, old.title, old.content);
END;
CREATE TRIGGER IF NOT EXISTS gen_au AFTER UPDATE ON generated_documents BEGIN
  INSERT INTO generated_documents_fts(generated_documents_fts, rowid, title, body)
  VALUES ('delete', old.oid, old.title, old.content);
  INSERT INTO generated_documents_fts(rowid, title, body)
  VALUES (new.oid, new.title, new.content);
END;

-- Agent messages triggers (only user/assistant content; ignore system)
CREATE TRIGGER IF NOT EXISTS agent_msg_ai AFTER INSERT ON agent_messages
WHEN new.role IN ('user','assistant')
BEGIN
  INSERT INTO agent_messages_fts(rowid, content) VALUES (new.oid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS agent_msg_ad AFTER DELETE ON agent_messages BEGIN
  INSERT INTO agent_messages_fts(agent_messages_fts, rowid, content)
  VALUES ('delete', old.oid, old.content);
END;

-- Audit triggers
CREATE TRIGGER IF NOT EXISTS audit_ai AFTER INSERT ON audit_log BEGIN
  INSERT INTO audit_log_fts(rowid, action, entity_id, payload, actor_name)
  VALUES (new.id, new.action, new.entity_id, coalesce(new.payload,''), coalesce(new.actor_name,''));
END;
-- audit_log is append-only so no delete/update triggers
