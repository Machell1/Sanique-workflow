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

  return db;
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
