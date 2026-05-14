const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

let db = null;
let dataDir = null;

function init(userDataPath) {
  dataDir = path.join(userDataPath, 'claw-data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'files'), { recursive: true });

  const dbPath = path.join(dataDir, 'claw.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Migrations for columns added after the original schema (idempotent).
  try {
    db.exec('ALTER TABLE documents ADD COLUMN content_indexed_at INTEGER');
  } catch (e) { /* already exists */ }
  try {
    db.exec('ALTER TABLE documents ADD COLUMN content_pages INTEGER');
  } catch (e) { /* already exists */ }

  // Record initial schema version
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get();
  if (!row || row.v == null) {
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(1, Date.now());
  }

  // Seed defaults if first run
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    require('./seed.cjs').runSeed(db);
  }

  // Backfill FTS tables on first run after upgrading to v2.4.x.
  // (Empty content tables on a populated install means we just got the schema
  // change. Triggers will keep new rows in sync; we backfill old rows here.)
  backfillFts(db);

  // Backfill missing default settings (for upgrades from older versions
  // that didn't have a particular setting key).
  backfillDefaultSettings(db);

  return db;
}

function backfillFts(db) {
  const exists = (sql) => {
    try { db.prepare(sql).get(); return true; } catch { return false; }
  };
  if (!exists('SELECT 1 FROM cases_fts LIMIT 1')) return;
  const empty = db.prepare('SELECT COUNT(*) AS c FROM cases_fts').get().c === 0;
  const haveCases = db.prepare('SELECT COUNT(*) AS c FROM cases').get().c > 0;
  if (!empty || !haveCases) return;

  const tx = db.transaction(() => {
    const cases = db.prepare('SELECT oid, * FROM cases').all();
    for (const c of cases) {
      db.prepare(
        'INSERT INTO cases_fts(rowid, case_number, title, parties, description) VALUES (?, ?, ?, ?, ?)'
      ).run(c.oid, c.case_number, c.title,
        (c.parties_appellant || '') + ' ' + (c.parties_respondent || ''),
        c.description || ''
      );
    }
    const docs = db.prepare('SELECT oid, * FROM documents').all();
    for (const d of docs) {
      db.prepare('INSERT INTO documents_fts(rowid, original_name, notes) VALUES (?, ?, ?)')
        .run(d.oid, d.original_name, d.notes || '');
    }
    const gens = db.prepare('SELECT oid, * FROM generated_documents').all();
    for (const g of gens) {
      db.prepare('INSERT INTO generated_documents_fts(rowid, title, body) VALUES (?, ?, ?)')
        .run(g.oid, g.title, g.content);
    }
    const msgs = db.prepare("SELECT oid, * FROM agent_messages WHERE role IN ('user','assistant')").all();
    for (const m of msgs) {
      db.prepare('INSERT INTO agent_messages_fts(rowid, content) VALUES (?, ?)').run(m.oid, m.content);
    }
    const audit = db.prepare('SELECT * FROM audit_log').all();
    for (const a of audit) {
      db.prepare('INSERT INTO audit_log_fts(rowid, action, entity_id, payload, actor_name) VALUES (?, ?, ?, ?, ?)')
        .run(a.id, a.action, a.entity_id, a.payload || '', a.actor_name || '');
    }
  });
  tx();
}

function backfillDefaultSettings(db) {
  const defaults = {
    'compliance.print_provenance': 'true',
  };
  const now = Date.now();
  for (const [k, v] of Object.entries(defaults)) {
    const have = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(k);
    if (!have) {
      db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(k, v, now);
    }
  }
}

function get() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function getDataDir() {
  if (!dataDir) throw new Error('Data dir not initialized');
  return dataDir;
}

function getFilesDir() {
  return path.join(getDataDir(), 'files');
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { init, get, getDataDir, getFilesDir, close };
