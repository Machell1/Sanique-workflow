const { get } = require('../db/connection.cjs');
const { sha256 } = require('./hash.cjs');

/**
 * Append an event to the immutable hash-chained audit log.
 * Each entry's hash incorporates the previous entry's hash, so any tampering
 * with a historic row breaks every subsequent hash.
 */
function appendAudit({ actorId = null, actorName = null, action, entityType, entityId, payload = null }) {
  const db = get();
  const ts = Date.now();

  const tail = db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
  const prevHash = tail ? tail.hash : 'GENESIS';

  const payloadJson = payload ? JSON.stringify(payload) : null;
  const material = `${ts}|${actorId || ''}|${action}|${entityType}|${entityId}|${payloadJson || ''}|${prevHash}`;
  const hash = sha256(material);

  db.prepare(
    `INSERT INTO audit_log (timestamp, actor_id, actor_name, action, entity_type, entity_id, payload, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(ts, actorId, actorName, action, entityType, entityId, payloadJson, prevHash, hash);

  return { hash, prevHash, timestamp: ts };
}

/**
 * Verify the integrity of the audit chain.
 * Returns { ok: boolean, brokenAt?: number, total: number }.
 */
function verifyAuditChain() {
  const db = get();
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();

  let prevHash = 'GENESIS';
  for (const r of rows) {
    if (r.prev_hash !== prevHash) {
      return { ok: false, brokenAt: r.id, total: rows.length };
    }
    const material = `${r.timestamp}|${r.actor_id || ''}|${r.action}|${r.entity_type}|${r.entity_id}|${r.payload || ''}|${r.prev_hash}`;
    if (sha256(material) !== r.hash) {
      return { ok: false, brokenAt: r.id, total: rows.length };
    }
    prevHash = r.hash;
  }
  return { ok: true, total: rows.length };
}

module.exports = { appendAudit, verifyAuditChain };
