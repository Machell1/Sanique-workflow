const fs = require('node:fs');
const path = require('node:path');
const { get, getFilesDir } = require('../db/connection.cjs');
const { newId, sha256File } = require('../services/hash.cjs');
const { appendAudit } = require('../services/audit.cjs');

function listDocuments({ caseId, category } = {}) {
  const db = get();
  const where = [];
  const params = {};
  if (caseId) {
    where.push('case_id = @caseId');
    params.caseId = caseId;
  }
  if (category) {
    where.push('category = @category');
    params.category = category;
  }
  const sql = `SELECT * FROM documents ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY uploaded_at DESC`;
  return db.prepare(sql).all(params);
}

function getDocument(id) {
  const db = get();
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
}

async function uploadDocument({ caseId, sourcePath, originalName, mimeType, category, notes }, actor) {
  if (!fs.existsSync(sourcePath)) throw new Error('Source file does not exist');
  const stat = fs.statSync(sourcePath);
  const docId = newId();
  const ext = path.extname(originalName) || path.extname(sourcePath);
  const storedName = `${docId}${ext}`;
  const filesDir = getFilesDir();
  const destDir = caseId ? path.join(filesDir, caseId) : path.join(filesDir, '_unfiled');
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, storedName);
  fs.copyFileSync(sourcePath, destPath);

  const hash = await sha256File(destPath);
  const relPath = path.relative(filesDir, destPath).split(path.sep).join('/');

  const db = get();
  db.prepare(
    `INSERT INTO documents (id, case_id, filename, original_name, mime_type, size, sha256, category, uploaded_by, uploaded_at, storage_path, notes)
     VALUES (@id, @case_id, @filename, @original_name, @mime_type, @size, @sha256, @category, @uploaded_by, @uploaded_at, @storage_path, @notes)`
  ).run({
    id: docId,
    case_id: caseId || null,
    filename: storedName,
    original_name: originalName,
    mime_type: mimeType || null,
    size: stat.size,
    sha256: hash,
    category: category || 'other',
    uploaded_by: actor?.id || null,
    uploaded_at: Date.now(),
    storage_path: relPath,
    notes: notes || null,
  });

  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'document.upload',
    entityType: 'document',
    entityId: docId,
    payload: { original_name: originalName, sha256: hash, size: stat.size },
  });

  return getDocument(docId);
}

function updateDocument(id, patch, actor) {
  const db = get();
  const doc = getDocument(id);
  if (!doc) throw new Error('Document not found');
  // Allow editing only metadata, not the file content itself.
  const merged = {
    id,
    case_id: patch.case_id !== undefined ? patch.case_id : doc.case_id,
    category: patch.category !== undefined ? patch.category : doc.category,
    notes: patch.notes !== undefined ? patch.notes : doc.notes,
  };
  db.prepare('UPDATE documents SET case_id=@case_id, category=@category, notes=@notes WHERE id=@id').run(merged);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'document.update',
    entityType: 'document',
    entityId: id,
    payload: patch,
  });
  return getDocument(id);
}

function deleteDocument(id, actor) {
  const db = get();
  const doc = getDocument(id);
  if (!doc) return { ok: false };
  const fullPath = path.join(getFilesDir(), doc.storage_path);
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (e) {
    // Non-fatal: continue with DB delete
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'document.delete',
    entityType: 'document',
    entityId: id,
    payload: { original_name: doc.original_name, sha256: doc.sha256 },
  });
  return { ok: true };
}

function openDocument(id) {
  const doc = getDocument(id);
  if (!doc) throw new Error('Document not found');
  const fullPath = path.join(getFilesDir(), doc.storage_path);
  return { path: fullPath, exists: fs.existsSync(fullPath) };
}

function indexText({ id, text, pages }, actor) {
  const db = get();
  const doc = getDocument(id);
  if (!doc) throw new Error('Document not found');
  const now = Date.now();
  // Replace any existing FTS row for this document
  db.prepare('INSERT INTO documents_content_fts(documents_content_fts, rowid, body) SELECT \'delete\', rowid, body FROM documents_content_fts WHERE rowid = (SELECT oid FROM documents WHERE id = ?)').run(id);
  const oidRow = db.prepare('SELECT oid AS oid FROM documents WHERE id = ?').get(id);
  if (!oidRow) throw new Error('Document oid missing');
  if (text && text.trim().length > 0) {
    db.prepare('INSERT INTO documents_content_fts(rowid, body) VALUES (?, ?)').run(oidRow.oid, text);
  }
  db.prepare('UPDATE documents SET content_indexed_at = ?, content_pages = ? WHERE id = ?').run(now, pages || null, id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'document.index',
    entityType: 'document',
    entityId: id,
    payload: { chars: text ? text.length : 0, pages: pages || null },
  });
  return getDocument(id);
}

function readBytes(id) {
  const doc = getDocument(id);
  if (!doc) throw new Error('Document not found');
  const fullPath = path.join(getFilesDir(), doc.storage_path);
  if (!fs.existsSync(fullPath)) throw new Error('File missing from vault');
  // Return base64 so it survives the IPC serialization; renderer decodes.
  const buf = fs.readFileSync(fullPath);
  return {
    base64: buf.toString('base64'),
    mime: doc.mime_type || 'application/octet-stream',
    size: buf.length,
    sha256: doc.sha256,
    filename: doc.original_name,
  };
}

module.exports = {
  'documents:list': (args) => listDocuments(args || {}),
  'documents:get': (args) => getDocument(args.id),
  'documents:upload': (args) => uploadDocument(args, args.actor),
  'documents:update': (args) => updateDocument(args.id, args.patch, args.actor),
  'documents:delete': (args) => deleteDocument(args.id, args.actor),
  'documents:resolve': (args) => openDocument(args.id),
  'documents:readBytes': (args) => readBytes(args.id),
  'documents:indexText': (args) => indexText(args, args.actor),
};
