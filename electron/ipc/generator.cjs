const { get } = require('../db/connection.cjs');
const { newId } = require('../services/hash.cjs');
const { appendAudit } = require('../services/audit.cjs');
const { snapshot } = require('./versions.cjs');

const TEMPLATES = {
  memo: {
    title: 'Internal Memorandum',
    body: ({ caseRef, subject, author, body }) => `INTERNAL MEMORANDUM\n\nFROM:    ${author || '[Your name]'}\nTO:      [Recipient]\nDATE:    ${new Date().toLocaleDateString()}\nRE:      ${caseRef ? caseRef + ' — ' : ''}${subject || '[Subject]'}\n\n=======================================================================\n\n1. INTRODUCTION\n\n${body || '[State the question, the directions sought, and the urgency.]'}\n\n2. BACKGROUND\n\n[Summarise the procedural history and the parties’ positions.]\n\n3. ANALYSIS\n\n[Set out the relevant authorities and the reasoning. Where authorities are\ncited, ensure each is verified through the Verification module before\nthe memorandum is signed.]\n\n4. RECOMMENDATION\n\n[State your recommended course of action.]\n\n— ENDS —`,
  },
  advice: {
    title: 'Counsel’s Written Advice',
    body: ({ caseRef, instructingAttorneys, body }) => `WRITTEN ADVICE\n\nIN THE MATTER OF ${caseRef || '[CASE REFERENCE]'}\n\nINSTRUCTING ATTORNEYS:\n${instructingAttorneys || '[Firm name and address]'}\n\nADVISING COUNSEL:\nS. Richards, KC\n\n=======================================================================\n\n1. INSTRUCTIONS\n\n${body || '[Summarise the questions on which advice is sought.]'}\n\n2. EXECUTIVE SUMMARY\n\n[Three or four bullet points stating the conclusion.]\n\n3. FACTUAL BACKGROUND\n\n[Set out the material facts as understood from instructions.]\n\n4. APPLICABLE LAW\n\n[Identify the governing principles and authorities.]\n\n5. ANALYSIS\n\n[Apply the law to the facts. Distinguish or rely upon authorities as\nappropriate.]\n\n6. ADVICE\n\n[State the advice clearly, in numbered paragraphs.]\n\nDated this ${new Date().toLocaleDateString()}.\n\n— S. Richards, KC —`,
  },
  judgment: {
    title: 'Draft Reasons for Judgment',
    body: ({ caseRef, parties, presiding, body }) => `IN THE COURT OF APPEAL OF JAMAICA\n\n${caseRef || '[NEUTRAL CITATION]'}\n\nBEFORE: ${presiding || '[The Honourable ...]'}\n\nBETWEEN:\n${parties || '[APPELLANT]\n\n                    AND\n\n[RESPONDENT]'}\n\n=======================================================================\n\nREASONS FOR JUDGMENT\n\nIntroduction\n\n1. ${body || 'This appeal raises the question whether ...'}\n\nThe Background\n\n2. [Summarise the procedural history.]\n\nThe Submissions\n\n3. [Summarise the appellant’s submissions.]\n\n4. [Summarise the respondent’s submissions.]\n\nDiscussion\n\n5. [Identify the issues. Cite the authorities. Apply them to the facts.]\n\nDisposition\n\n6. [State the disposition. E.g. “The appeal is allowed. The conviction is\n   quashed. We remit the matter to the trial court for ...”]\n\n— ENDS —`,
  },
  order: {
    title: 'Draft Order',
    body: ({ caseRef, parties, body }) => `IN THE COURT OF APPEAL OF JAMAICA\n\n${caseRef || '[CASE REFERENCE]'}\n\nBETWEEN:\n${parties || '[APPELLANT]\n\n                    AND\n\n[RESPONDENT]'}\n\nORDER\n\nUPON the application of [party]\nAND UPON HEARING [counsel]\nAND UPON READING [documents]\n\nIT IS ORDERED THAT:\n\n1. ${body || '[State the order.]'}\n\n2. Costs to follow the event.\n\nDated this ${new Date().toLocaleDateString()}.\n\n— Registrar —`,
  },
};

function generate(input, actor) {
  const tmpl = TEMPLATES[input.doc_type];
  if (!tmpl) throw new Error('Unknown document type: ' + input.doc_type);
  const content = tmpl.body(input);
  const db = get();
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO generated_documents (id, case_id, doc_type, title, content, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.case_id || null,
    input.doc_type,
    input.title || tmpl.title,
    content,
    'draft',
    actor?.id || null,
    now,
    now
  );
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'generator.create',
    entityType: 'generated_document',
    entityId: id,
    payload: { doc_type: input.doc_type, title: input.title || tmpl.title },
  });
  const created = db.prepare('SELECT * FROM generated_documents WHERE id = ?').get(id);
  snapshot(created, actor);
  return created;
}

function listGenerated({ caseId } = {}) {
  const db = get();
  if (caseId) {
    return db.prepare('SELECT * FROM generated_documents WHERE case_id = ? ORDER BY updated_at DESC').all(caseId);
  }
  return db.prepare('SELECT * FROM generated_documents ORDER BY updated_at DESC LIMIT 200').all();
}

function updateGenerated(id, patch, actor) {
  const db = get();
  const existing = db.prepare('SELECT * FROM generated_documents WHERE id = ?').get(id);
  if (!existing) throw new Error('Document not found');
  const merged = { ...existing, ...patch, updated_at: Date.now() };
  db.prepare(
    `UPDATE generated_documents SET title=@title, content=@content, status=@status, updated_at=@updated_at WHERE id=@id`
  ).run(merged);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'generator.update',
    entityType: 'generated_document',
    entityId: id,
    payload: { fields: Object.keys(patch) },
  });
  const updated = db.prepare('SELECT * FROM generated_documents WHERE id = ?').get(id);
  // Only snapshot if the body actually changed; renaming alone or status-only
  // changes don't warrant a new version entry.
  if (patch.content !== undefined && patch.content !== existing.content) {
    snapshot(updated, actor);
  }
  return updated;
}

function deleteGenerated(id, actor) {
  const db = get();
  db.prepare('DELETE FROM generated_documents WHERE id = ?').run(id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'generator.delete',
    entityType: 'generated_document',
    entityId: id,
  });
  return { ok: true };
}

function listTemplates() {
  return Object.entries(TEMPLATES).map(([key, t]) => ({ key, title: t.title }));
}

module.exports = {
  'generator:templates': () => listTemplates(),
  'generator:create': (args) => generate(args.input, args.actor),
  'generator:list': (args) => listGenerated(args || {}),
  'generator:update': (args) => updateGenerated(args.id, args.patch, args.actor),
  'generator:delete': (args) => deleteGenerated(args.id, args.actor),
};
