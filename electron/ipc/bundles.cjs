// Bundle assembly: the renderer does the actual PDF merge (with pdf-lib),
// then hands the bytes here for filing as a normal vault document linked
// to a `bundles` row that remembers the source list.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { get, getFilesDir } = require('../db/connection.cjs');
const { newId, sha256File } = require('../services/hash.cjs');
const { appendAudit } = require('../services/audit.cjs');

function listBundles({ caseId } = {}) {
  const db = get();
  const where = caseId ? 'WHERE b.case_id = @caseId' : '';
  return db
    .prepare(
      `SELECT b.*, d.original_name AS output_filename, d.sha256 AS output_sha256,
              c.case_number, c.title AS case_title
         FROM bundles b
         LEFT JOIN documents d ON d.id = b.output_document_id
         LEFT JOIN cases c ON c.id = b.case_id
         ${where}
         ORDER BY b.created_at DESC`
    )
    .all({ caseId });
}

function getBundle(id) {
  const db = get();
  const b = db
    .prepare(
      `SELECT b.*, d.original_name AS output_filename, d.sha256 AS output_sha256, d.size AS output_size,
              c.case_number, c.title AS case_title
         FROM bundles b
         LEFT JOIN documents d ON d.id = b.output_document_id
         LEFT JOIN cases c ON c.id = b.case_id
         WHERE b.id = ?`
    )
    .get(id);
  if (!b) return null;
  try { b.source_documents = JSON.parse(b.source_documents); } catch { b.source_documents = []; }
  return b;
}

// Renderer hands us the merged bytes (base64). We file them as a normal
// document with category 'record_of_appeal' so they participate in the
// vault, the audit ledger, and the FTS index.
async function createBundle({ caseId, title, sourceDocumentIds, sourcePages, mergedBase64, mergedPageCount, notes }, actor) {
  if (!title || !sourceDocumentIds?.length || !mergedBase64) {
    throw new Error('Missing title / source documents / merged content');
  }

  const db = get();
  const bundleId = newId();
  const now = Date.now();
  const docId = newId();
  const filesDir = getFilesDir();
  const destDir = caseId ? path.join(filesDir, caseId) : path.join(filesDir, '_bundles');
  fs.mkdirSync(destDir, { recursive: true });

  const filename = `${docId}.pdf`;
  const destPath = path.join(destDir, filename);
  const buffer = Buffer.from(mergedBase64, 'base64');
  fs.writeFileSync(destPath, buffer);
  const sha = await sha256File(destPath);
  const relPath = path.relative(filesDir, destPath).split(path.sep).join('/');

  // Insert the bundle output as a regular document so File Cabinet picks it up
  db.prepare(
    `INSERT INTO documents (id, case_id, filename, original_name, mime_type, size, sha256, category,
                            uploaded_by, uploaded_at, storage_path, notes)
     VALUES (@id, @case_id, @filename, @original_name, @mime, @size, @sha, 'record_of_appeal',
             @actor, @now, @path, @notes)`
  ).run({
    id: docId,
    case_id: caseId || null,
    filename,
    original_name: `${title.replace(/[^A-Za-z0-9_ -]+/g, '_').slice(0, 80)}.pdf`,
    mime: 'application/pdf',
    size: buffer.length,
    sha,
    actor: actor?.id || null,
    now,
    path: relPath,
    notes: notes || `Assembled bundle of ${sourceDocumentIds.length} documents.`,
  });

  // Insert the bundle metadata
  const sources = sourceDocumentIds.map((id, i) => ({
    document_id: id,
    page_count: sourcePages?.[i] || null,
    order: i + 1,
  }));
  db.prepare(
    `INSERT INTO bundles (id, output_document_id, case_id, title, source_documents, page_count, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(bundleId, docId, caseId || null, title, JSON.stringify(sources), mergedPageCount || null, notes || null, actor?.id || null, now);

  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'bundle.create',
    entityType: 'bundle',
    entityId: bundleId,
    payload: {
      title,
      output_document_id: docId,
      source_count: sourceDocumentIds.length,
      page_count: mergedPageCount,
      sha256: sha,
    },
  });

  return getBundle(bundleId);
}

function deleteBundle(id, actor) {
  const db = get();
  const b = getBundle(id);
  if (!b) return { ok: false };
  // Delete the output document too (cascades will clean signatures etc)
  if (b.output_document_id) {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(b.output_document_id);
    if (doc) {
      const full = path.join(getFilesDir(), doc.storage_path);
      try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch (e) { /* ignore */ }
      db.prepare('DELETE FROM documents WHERE id = ?').run(b.output_document_id);
    }
  }
  db.prepare('DELETE FROM bundles WHERE id = ?').run(id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'bundle.delete',
    entityType: 'bundle',
    entityId: id,
    payload: { title: b.title },
  });
  return { ok: true };
}

module.exports = {
  'bundles:list': (args) => listBundles(args || {}),
  'bundles:get': (args) => getBundle(args.id),
  'bundles:create': (args) => createBundle(args, args.actor),
  'bundles:delete': (args) => deleteBundle(args.id, args.actor),
};
