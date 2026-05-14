// Email export: write an RFC 822 .eml with the document attached as
// base64, save to a temp path, and open it. Windows associates .eml
// with the default mail client (Outlook by default), which opens a
// pre-filled draft. CLAW never sees the recipient or the sent message.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { shell } = require('electron');
const { get, getFilesDir } = require('../db/connection.cjs');
const { appendAudit } = require('../services/audit.cjs');

function buildEml({ to, cc, subject, body, attachmentName, attachmentMime, attachmentBase64 }) {
  const boundary = '=_CLAW_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  const date = new Date().toUTCString();
  const headers = [
    `Date: ${date}`,
    `From: <unspecified@coa.gov.jm>`,
    to ? `To: ${to}` : '',
    cc ? `Cc: ${cc}` : '',
    `Subject: ${subject.replace(/[\r\n]/g, ' ')}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter(Boolean).join('\r\n');

  const lines = [];
  lines.push(headers);
  lines.push('');
  lines.push(`This is a multi-part message in MIME format.`);
  lines.push(`--${boundary}`);
  lines.push(`Content-Type: text/plain; charset=UTF-8`);
  lines.push(`Content-Transfer-Encoding: 8bit`);
  lines.push('');
  lines.push(body || '');
  lines.push('');
  if (attachmentBase64) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${attachmentMime || 'application/octet-stream'}; name="${attachmentName}"`);
    lines.push(`Content-Transfer-Encoding: base64`);
    lines.push(`Content-Disposition: attachment; filename="${attachmentName}"`);
    lines.push('');
    // Wrap to 76 chars per line per RFC
    for (let i = 0; i < attachmentBase64.length; i += 76) {
      lines.push(attachmentBase64.slice(i, i + 76));
    }
    lines.push('');
  }
  lines.push(`--${boundary}--`);
  return lines.join('\r\n');
}

async function exportDocumentEml({ documentId, to, cc, subject, body }, actor) {
  const db = get();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
  if (!doc) throw new Error('Document not found');
  const fullPath = path.join(getFilesDir(), doc.storage_path);
  if (!fs.existsSync(fullPath)) throw new Error('File missing from vault');

  const bytes = fs.readFileSync(fullPath);
  const eml = buildEml({
    to, cc,
    subject: subject || doc.original_name,
    body: body || `Attached: ${doc.original_name}\nFiled: ${new Date(doc.uploaded_at).toLocaleString()}\nSHA-256: ${doc.sha256}\n\nSent from CLAW.`,
    attachmentName: doc.original_name,
    attachmentMime: doc.mime_type || 'application/octet-stream',
    attachmentBase64: bytes.toString('base64'),
  });

  const tmpDir = path.join(os.tmpdir(), 'claw-eml');
  fs.mkdirSync(tmpDir, { recursive: true });
  const emlPath = path.join(tmpDir, `claw-${Date.now()}.eml`);
  fs.writeFileSync(emlPath, eml);
  const openErr = await shell.openPath(emlPath);
  if (openErr) {
    appendAudit({ actorId: actor?.id, actorName: actor?.name, action: 'email.export_failed', entityType: 'document', entityId: documentId, payload: { error: openErr } });
    return { ok: false, error: openErr, emlPath };
  }
  appendAudit({
    actorId: actor?.id, actorName: actor?.name, action: 'email.export', entityType: 'document', entityId: documentId,
    payload: { to: !!to, subject: subject || doc.original_name, eml_size: eml.length },
  });
  return { ok: true, emlPath };
}

async function exportGeneratedEml({ generatedDocumentId, to, cc, subject, body, format }, actor) {
  // For generated drafts we ship the raw markdown (or supplied attachment bytes from renderer).
  const db = get();
  const draft = db.prepare('SELECT * FROM generated_documents WHERE id = ?').get(generatedDocumentId);
  if (!draft) throw new Error('Draft not found');

  const ext = (format || 'md').toLowerCase();
  const attachmentName = `${draft.title.replace(/[^A-Za-z0-9_ -]+/g, '_').slice(0, 80)}.${ext}`;
  const attachmentMime = ext === 'md' ? 'text/markdown' : 'application/octet-stream';
  const attachmentBase64 = Buffer.from(draft.content, 'utf8').toString('base64');

  const eml = buildEml({
    to, cc,
    subject: subject || draft.title,
    body: body || `Attached: ${draft.title}\nType: ${draft.doc_type}\nStatus: ${draft.status}\n\nSent from CLAW.`,
    attachmentName,
    attachmentMime,
    attachmentBase64,
  });

  const tmpDir = path.join(os.tmpdir(), 'claw-eml');
  fs.mkdirSync(tmpDir, { recursive: true });
  const emlPath = path.join(tmpDir, `claw-${Date.now()}.eml`);
  fs.writeFileSync(emlPath, eml);
  const openErr = await shell.openPath(emlPath);
  if (openErr) {
    appendAudit({ actorId: actor?.id, actorName: actor?.name, action: 'email.export_failed', entityType: 'generated_document', entityId: generatedDocumentId, payload: { error: openErr } });
    return { ok: false, error: openErr, emlPath };
  }
  appendAudit({
    actorId: actor?.id, actorName: actor?.name, action: 'email.export', entityType: 'generated_document', entityId: generatedDocumentId,
    payload: { to: !!to, subject: subject || draft.title, eml_size: eml.length },
  });
  return { ok: true, emlPath };
}

module.exports = {
  'email:exportDocument': (args) => exportDocumentEml(args, args.actor),
  'email:exportGenerated': (args) => exportGeneratedEml(args, args.actor),
};
