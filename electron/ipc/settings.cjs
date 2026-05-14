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

function createUser(input, actor) {
  const db = get();
  const crypto = require('node:crypto');
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO users (id, name, email, role, rank, is_current, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
  ).run(id, input.name, input.email || null, input.role, input.rank || null, Date.now());
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'user.create',
    entityType: 'user',
    entityId: id,
    payload: { name: input.name, role: input.role },
  });
  return db.prepare('SELECT id, name, email, role, rank, is_current FROM users WHERE id = ?').get(id);
}

function updateUser(id, patch, actor) {
  const db = get();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) throw new Error('User not found');
  const merged = {
    id,
    name: patch.name !== undefined ? patch.name : existing.name,
    email: patch.email !== undefined ? patch.email : existing.email,
    role: patch.role !== undefined ? patch.role : existing.role,
    rank: patch.rank !== undefined ? patch.rank : existing.rank,
  };
  db.prepare('UPDATE users SET name=@name, email=@email, role=@role, rank=@rank WHERE id=@id').run(merged);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'user.update',
    entityType: 'user',
    entityId: id,
    payload: patch,
  });
  return db.prepare('SELECT id, name, email, role, rank, is_current FROM users WHERE id = ?').get(id);
}

function deleteUser(id, actor) {
  const db = get();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return { ok: false };
  if (existing.is_current === 1) throw new Error('Cannot delete the currently active user. Switch first.');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'user.delete',
    entityType: 'user',
    entityId: id,
    payload: { name: existing.name },
  });
  return { ok: true };
}

function setCurrentUser(id, actor) {
  const db = get();
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) throw new Error('User not found');
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET is_current = 0').run();
    db.prepare('UPDATE users SET is_current = 1 WHERE id = ?').run(id);
  });
  tx();
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'user.switch',
    entityType: 'user',
    entityId: id,
    payload: { name: target.name },
  });
  return db.prepare('SELECT id, name, email, role, rank FROM users WHERE id = ?').get(id);
}

module.exports = {
  'settings:all': () => getAll(),
  'settings:get': (args) => getOne(args.key),
  'settings:set': (args) => setOne(args.key, args.value, args.actor),
  'settings:setMany': (args) => setMany(args.patch, args.actor),
  'users:list': () => listUsers(),
  'users:current': () => currentUser(),
  'users:create': (args) => createUser(args.input, args.actor),
  'users:update': (args) => updateUser(args.id, args.patch, args.actor),
  'users:delete': (args) => deleteUser(args.id, args.actor),
  'users:setCurrent': (args) => setCurrentUser(args.id, args.actor),
};
