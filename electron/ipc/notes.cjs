const { get } = require('../db/connection.cjs');
const { newId } = require('../services/hash.cjs');
const { appendAudit } = require('../services/audit.cjs');

function listNotes({ documentId, caseId } = {}) {
  const db = get();
  const where = [];
  const params = {};
  if (documentId) { where.push('n.document_id = @documentId'); params.documentId = documentId; }
  if (caseId) { where.push('n.case_id = @caseId'); params.caseId = caseId; }
  const sql = `SELECT n.*, u.name AS author_name, d.original_name AS document_name
                 FROM document_notes n
                 LEFT JOIN users u ON u.id = n.created_by
                 LEFT JOIN documents d ON d.id = n.document_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY COALESCE(n.page, 0) ASC, n.created_at ASC`;
  return db.prepare(sql).all(params);
}

function createNote({ documentId, caseId, page, body, color }, actor) {
  if (!documentId || !body?.trim()) throw new Error('documentId and body required');
  const db = get();
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO document_notes (id, document_id, case_id, page, body, color, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, documentId, caseId || null, page ?? null, body.trim(), color || 'gilt', actor?.id || null, now, now);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'note.create',
    entityType: 'document_note',
    entityId: id,
    payload: { documentId, page, body_chars: body.length },
  });
  return db.prepare('SELECT * FROM document_notes WHERE id = ?').get(id);
}

function updateNote(id, patch, actor) {
  const db = get();
  const existing = db.prepare('SELECT * FROM document_notes WHERE id = ?').get(id);
  if (!existing) throw new Error('Note not found');
  const merged = {
    id,
    body: patch.body !== undefined ? patch.body : existing.body,
    color: patch.color !== undefined ? patch.color : existing.color,
    page: patch.page !== undefined ? patch.page : existing.page,
    now: Date.now(),
  };
  db.prepare('UPDATE document_notes SET body=@body, color=@color, page=@page, updated_at=@now WHERE id=@id').run(merged);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'note.update',
    entityType: 'document_note',
    entityId: id,
    payload: patch,
  });
  return db.prepare('SELECT * FROM document_notes WHERE id = ?').get(id);
}

function deleteNote(id, actor) {
  const db = get();
  db.prepare('DELETE FROM document_notes WHERE id = ?').run(id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'note.delete',
    entityType: 'document_note',
    entityId: id,
  });
  return { ok: true };
}

module.exports = {
  'notes:list': (args) => listNotes(args || {}),
  'notes:create': (args) => createNote(args, args.actor),
  'notes:update': (args) => updateNote(args.id, args.patch, args.actor),
  'notes:delete': (args) => deleteNote(args.id, args.actor),
};
