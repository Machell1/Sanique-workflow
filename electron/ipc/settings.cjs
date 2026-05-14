const { get } = require('../db/connection.cjs');
const { appendAudit } = require('../services/audit.cjs');

const SECRET_KEYS = new Set(['ai.api_key']);

function getAll() {
  const db = get();
  const rows = db.prepare('SELECT key, value, updated_at FROM settings').all();
  // Mask secrets
  return rows.map((r) =>
    SECRET_KEYS.has(r.key)
      ? { ...r, value: r.value ? '••••••••' + r.value.slice(-4) : '', _masked: true }
      : r
  );
}

function getOne(key) {
  const db = get();
  return db.prepare('SELECT key, value, updated_at FROM settings WHERE key = ?').get(key);
}

function setOne(key, value, actor) {
  const db = get();
  const now = Date.now();
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value ?? ''), now);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'setting.update',
    entityType: 'setting',
    entityId: key,
    payload: SECRET_KEYS.has(key) ? { masked: true } : { value },
  });
  return getOne(key);
}

function setMany(patch, actor) {
  for (const [k, v] of Object.entries(patch)) setOne(k, v, actor);
  return getAll();
}

function listUsers() {
  const db = get();
  return db.prepare('SELECT id, name, email, role, rank, is_current, created_at FROM users ORDER BY name ASC').all();
}

function currentUser() {
  const db = get();
  return db.prepare('SELECT id, name, email, role, rank FROM users WHERE is_current = 1 LIMIT 1').get();
}

module.exports = {
  'settings:all': () => getAll(),
  'settings:get': (args) => getOne(args.key),
  'settings:set': (args) => setOne(args.key, args.value, args.actor),
  'settings:setMany': (args) => setMany(args.patch, args.actor),
  'users:list': () => listUsers(),
  'users:current': () => currentUser(),
};
