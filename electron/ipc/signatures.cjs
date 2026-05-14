// E-signature using Ed25519. One keypair per user, lazily generated.
// The signed payload is:
//   contentSha256 + '|' + signerName + '|' + signerRole + '|' + signedAt
// which is what the verifier reconstructs to check authenticity.
const crypto = require('node:crypto');
const { get } = require('../db/connection.cjs');
const { newId, sha256 } = require('../services/hash.cjs');
const { appendAudit } = require('../services/audit.cjs');

function ensureKeyPair(userId) {
  if (!userId) throw new Error('userId required');
  const db = get();
  const existing = db.prepare('SELECT * FROM user_keys WHERE user_id = ?').get(userId);
  if (existing) return existing;

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const row = {
    user_id: userId,
    public_key_pem: publicKeyPem,
    private_key_pem: privateKeyPem,
    created_at: Date.now(),
  };
  db.prepare(
    'INSERT INTO user_keys (user_id, public_key_pem, private_key_pem, created_at) VALUES (?, ?, ?, ?)'
  ).run(row.user_id, row.public_key_pem, row.private_key_pem, row.created_at);
  appendAudit({
    actorId: userId,
    actorName: null,
    action: 'signing.keypair_create',
    entityType: 'user_key',
    entityId: userId,
    payload: { fingerprint: sha256(publicKeyPem).slice(0, 32) },
  });
  return row;
}

function getPublicKey({ userId }) {
  const row = ensureKeyPair(userId);
  return { public_key_pem: row.public_key_pem, fingerprint: sha256(row.public_key_pem).slice(0, 32) };
}

function buildPayload({ contentSha256, signerName, signerRole, signedAt }) {
  return [contentSha256, signerName, signerRole || '', signedAt].join('|');
}

function signGeneratedDocument({ generatedDocumentId, signerRole }, actor) {
  if (!actor?.id) throw new Error('No active user — cannot sign');
  if (!generatedDocumentId) throw new Error('generatedDocumentId required');
  const db = get();
  const draft = db.prepare('SELECT * FROM generated_documents WHERE id = ?').get(generatedDocumentId);
  if (!draft) throw new Error('Draft not found');
  const keypair = ensureKeyPair(actor.id);

  const contentSha = sha256(draft.content);
  const signedAt = Date.now();
  const payload = buildPayload({ contentSha256: contentSha, signerName: actor.name, signerRole, signedAt });
  const signature = crypto.sign(null, Buffer.from(payload, 'utf8'), crypto.createPrivateKey(keypair.private_key_pem));

  const id = newId();
  db.prepare(
    `INSERT INTO document_signatures (id, generated_document_id, signed_by, signer_name, signer_role,
                                      content_sha256, signature_b64, public_key_pem, signed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, generatedDocumentId, actor.id, actor.name, signerRole || null, contentSha,
    signature.toString('base64'), keypair.public_key_pem, signedAt);
  // Mark draft as final on sign
  db.prepare('UPDATE generated_documents SET status = ?, updated_at = ? WHERE id = ?').run('final', signedAt, generatedDocumentId);
  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: 'signing.sign_generated',
    entityType: 'generated_document',
    entityId: generatedDocumentId,
    payload: { signature_id: id, content_sha256: contentSha, signer_role: signerRole },
  });
  return db.prepare('SELECT * FROM document_signatures WHERE id = ?').get(id);
}

function signUploadedDocument({ documentId, signerRole }, actor) {
  if (!actor?.id) throw new Error('No active user — cannot sign');
  if (!documentId) throw new Error('documentId required');
  const db = get();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(documentId);
  if (!doc) throw new Error('Document not found');
  const keypair = ensureKeyPair(actor.id);
  const signedAt = Date.now();
  const payload = buildPayload({ contentSha256: doc.sha256, signerName: actor.name, signerRole, signedAt });
  const signature = crypto.sign(null, Buffer.from(payload, 'utf8'), crypto.createPrivateKey(keypair.private_key_pem));
  const id = newId();
  db.prepare(
    `INSERT INTO document_signatures (id, document_id, signed_by, signer_name, signer_role,
                                      content_sha256, signature_b64, public_key_pem, signed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, documentId, actor.id, actor.name, signerRole || null, doc.sha256,
    signature.toString('base64'), keypair.public_key_pem, signedAt);
  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: 'signing.sign_uploaded',
    entityType: 'document',
    entityId: documentId,
    payload: { signature_id: id, content_sha256: doc.sha256, signer_role: signerRole },
  });
  return db.prepare('SELECT * FROM document_signatures WHERE id = ?').get(id);
}

function signBundle({ bundleId, signerRole }, actor) {
  if (!actor?.id) throw new Error('No active user — cannot sign');
  if (!bundleId) throw new Error('bundleId required');
  const db = get();
  const b = db.prepare('SELECT b.*, d.sha256 AS output_sha256 FROM bundles b LEFT JOIN documents d ON d.id = b.output_document_id WHERE b.id = ?').get(bundleId);
  if (!b || !b.output_sha256) throw new Error('Bundle (or its output) not found');
  const keypair = ensureKeyPair(actor.id);
  const signedAt = Date.now();
  const payload = buildPayload({ contentSha256: b.output_sha256, signerName: actor.name, signerRole, signedAt });
  const signature = crypto.sign(null, Buffer.from(payload, 'utf8'), crypto.createPrivateKey(keypair.private_key_pem));
  const id = newId();
  db.prepare(
    `INSERT INTO document_signatures (id, bundle_id, signed_by, signer_name, signer_role,
                                      content_sha256, signature_b64, public_key_pem, signed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, bundleId, actor.id, actor.name, signerRole || null, b.output_sha256,
    signature.toString('base64'), keypair.public_key_pem, signedAt);
  appendAudit({
    actorId: actor.id,
    actorName: actor.name,
    action: 'signing.sign_bundle',
    entityType: 'bundle',
    entityId: bundleId,
    payload: { signature_id: id, content_sha256: b.output_sha256, signer_role: signerRole },
  });
  return db.prepare('SELECT * FROM document_signatures WHERE id = ?').get(id);
}

function listSignatures({ documentId, generatedDocumentId, bundleId } = {}) {
  const db = get();
  const where = [];
  const params = {};
  if (documentId) { where.push('document_id = @documentId'); params.documentId = documentId; }
  if (generatedDocumentId) { where.push('generated_document_id = @generatedDocumentId'); params.generatedDocumentId = generatedDocumentId; }
  if (bundleId) { where.push('bundle_id = @bundleId'); params.bundleId = bundleId; }
  if (!where.length) return [];
  return db
    .prepare(`SELECT * FROM document_signatures WHERE ${where.join(' AND ')} ORDER BY signed_at ASC`)
    .all(params);
}

function verifySignature({ id }) {
  const db = get();
  const sig = db.prepare('SELECT * FROM document_signatures WHERE id = ?').get(id);
  if (!sig) throw new Error('Signature not found');
  const payload = buildPayload({
    contentSha256: sig.content_sha256,
    signerName: sig.signer_name,
    signerRole: sig.signer_role,
    signedAt: sig.signed_at,
  });
  const pubKey = crypto.createPublicKey(sig.public_key_pem);
  const ok = crypto.verify(null, Buffer.from(payload, 'utf8'), pubKey, Buffer.from(sig.signature_b64, 'base64'));

  // Also check that the underlying content is still what was signed
  let contentOk = null;
  if (sig.document_id) {
    const doc = db.prepare('SELECT sha256 FROM documents WHERE id = ?').get(sig.document_id);
    contentOk = doc?.sha256 === sig.content_sha256;
  } else if (sig.generated_document_id) {
    const draft = db.prepare('SELECT content FROM generated_documents WHERE id = ?').get(sig.generated_document_id);
    contentOk = draft ? sha256(draft.content) === sig.content_sha256 : false;
  } else if (sig.bundle_id) {
    const b = db.prepare('SELECT d.sha256 FROM bundles b LEFT JOIN documents d ON d.id = b.output_document_id WHERE b.id = ?').get(sig.bundle_id);
    contentOk = b?.sha256 === sig.content_sha256;
  }

  return {
    signature_id: sig.id,
    signature_valid: ok,
    content_unchanged: contentOk,
    signer_name: sig.signer_name,
    signer_role: sig.signer_role,
    signed_at: sig.signed_at,
    public_key_fingerprint: sha256(sig.public_key_pem).slice(0, 32),
  };
}

module.exports = {
  'signatures:publicKey': (args) => getPublicKey(args || {}),
  'signatures:signGenerated': (args) => signGeneratedDocument(args, args.actor),
  'signatures:signUploaded': (args) => signUploadedDocument(args, args.actor),
  'signatures:signBundle': (args) => signBundle(args, args.actor),
  'signatures:list': (args) => listSignatures(args || {}),
  'signatures:verify': (args) => verifySignature(args),
};
