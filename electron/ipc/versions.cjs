// Draft version history. The generator IPC writes a snapshot to this
// table on every save (create + update); we expose list / get / restore.
const { get } = require('../db/connection.cjs');
const { newId } = require('../services/hash.cjs');
const { appendAudit } = require('../services/audit.cjs');

function snapshot(draft, actor) {
  const db = get();
  const last = db
    .prepare('SELECT version_no FROM draft_versions WHERE draft_id = ? ORDER BY version_no DESC LIMIT 1')
    .get(draft.id);
  const nextNo = (last?.version_no || 0) + 1;
  const id = newId();
  db.prepare(
    `INSERT INTO draft_versions (id, draft_id, version_no, title, content, status, saved_by, saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, draft.id, nextNo, draft.title, draft.content, draft.status, actor?.id || null, draft.updated_at || Date.now());
  return { id, version_no: nextNo };
}

function listVersions({ draftId } = {}) {
  if (!draftId) throw new Error('draftId required');
  const db = get();
  return db
    .prepare(
      `SELECT v.id, v.version_no, v.title, v.status, v.saved_by, v.saved_at,
              u.name AS author_name, length(v.content) AS body_chars
         FROM draft_versions v
         LEFT JOIN users u ON u.id = v.saved_by
        WHERE v.draft_id = ?
        ORDER BY v.version_no DESC`
    )
    .all(draftId);
}

function getVersion(id) {
  const db = get();
  return db
    .prepare(
      `SELECT v.*, u.name AS author_name FROM draft_versions v
         LEFT JOIN users u ON u.id = v.saved_by
        WHERE v.id = ?`
    )
    .get(id);
}

function restoreVersion(id, actor) {
  const db = get();
  const v = getVersion(id);
  if (!v) throw new Error('Version not found');
  const draft = db.prepare('SELECT * FROM generated_documents WHERE id = ?').get(v.draft_id);
  if (!draft) throw new Error('Parent draft missing');
  const now = Date.now();
  db.prepare(
    'UPDATE generated_documents SET title=?, content=?, status=?, updated_at=? WHERE id=?'
  ).run(v.title, v.content, v.status, now, v.draft_id);
  // Snapshot the restore itself so the history reflects the action
  const fresh = db.prepare('SELECT * FROM generated_documents WHERE id = ?').get(v.draft_id);
  snapshot(fresh, actor);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'generator.restore',
    entityType: 'generated_document',
    entityId: v.draft_id,
    payload: { from_version_id: id, from_version_no: v.version_no },
  });
  return fresh;
}

module.exports = {
  'versions:list': (args) => listVersions(args || {}),
  'versions:get': (args) => getVersion(args.id),
  'versions:restore': (args) => restoreVersion(args.id, args.actor),
  // Internal — exported so generator.cjs can call it after a save
  snapshot,
};
