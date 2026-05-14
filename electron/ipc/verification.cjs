const { get } = require('../db/connection.cjs');
const { newId } = require('../services/hash.cjs');
const { appendAudit } = require('../services/audit.cjs');

// Heuristic citation parser. Detects:
// - Jamaican/CoA citations: SCCA / COA App / [YYYY] JMCA / JMSC
// - Statutory references: "section 12 of the Firearms Act"
// - Generic case citations: Smith v. Jones [2020]
const PATTERNS = [
  { type: 'court_of_appeal_jm', re: /\bSCCA\s+\d+\/\d{4}\b/g },
  { type: 'court_of_appeal_jm', re: /\bCOA\s+App\s+\d+\/\d{4}\b/g },
  { type: 'jamaican_neutral', re: /\[\d{4}\]\s*JM(CA|SC|FC)\s+(Civ|Crim|App|Const)?\s*\d+/g },
  { type: 'uk_neutral', re: /\[\d{4}\]\s*(UKSC|UKHL|EWCA|EWHC)\s*(Civ|Crim|Admin|Comm)?\s*\d+/g },
  { type: 'caribbean_court', re: /\[\d{4}\]\s*CCJ\s+\d+\s*\(AJ\)/g },
  // Statute sections. We accept "Act", "Constitution", "Charter", "Code",
  // "Order", "Rules", or "Regulations" as the trailing instrument name —
  // covering both ordinary statutes and the principal constitutional /
  // delegated-legislation references the Court reads in practice.
  { type: 'statute_section', re: /section\s+\d+[A-Za-z]?(?:\(\d+\))?\s+of\s+the\s+[A-Z][A-Za-z' ]+(?:Act|Constitution|Charter|Code|Order|Rules|Regulations)(?:,?\s*\d{4})?/g },
  // Generic "X v Y" — the appellant party name can be a single letter
  // (so "R v Brown" matches, which is by far the most common form for
  // criminal authorities).
  { type: 'generic_case', re: /\b[A-Z][A-Za-z'\-]*\s+v\.?\s+[A-Z][A-Za-z'\-]+(?:\s+\[\d{4}\])?/g },
];

function parseCitations(text) {
  const found = [];
  const seen = new Set();
  for (const { type, re } of PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const value = m[0].trim();
      const key = `${type}::${value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ type, value });
    }
  }
  return found;
}

// Evaluate confidence based on:
// - Citation type (neutral citations more reliable than generic "X v Y")
// - Whether the cited authority appears more than once in the database
function classify(type, value) {
  const db = get();
  let baseConfidence;
  switch (type) {
    case 'jamaican_neutral':
    case 'uk_neutral':
    case 'caribbean_court':
      baseConfidence = 1.0;
      break;
    case 'court_of_appeal_jm':
      baseConfidence = 0.99;
      break;
    case 'statute_section':
      baseConfidence = 0.99;
      break;
    case 'generic_case':
      baseConfidence = 0.96;
      break;
    default:
      baseConfidence = 0.9;
  }

  // Boost if we've seen this citation before in our own audit / verifications
  const prior = db
    .prepare('SELECT COUNT(*) AS c FROM verifications WHERE citation = ? AND status IN (?, ?)')
    .get(value, 'verified', 'high_confidence').c;
  if (prior > 0) baseConfidence = Math.min(1.0, baseConfidence + 0.005 * prior);

  let status;
  if (baseConfidence >= 1.0) status = 'verified';
  else if (baseConfidence >= 0.99) status = 'high_confidence';
  else if (baseConfidence >= 0.98) status = 'escalation';
  else status = 'blocked';

  return { confidence: baseConfidence, status };
}

function verifyText({ text, caseId, documentId }, actor) {
  const citations = parseCitations(text);
  const db = get();
  const results = citations.map((c) => {
    const { confidence, status } = classify(c.type, c.value);
    const id = newId();
    db.prepare(
      `INSERT INTO verifications (id, document_id, case_id, citation, citation_type, status, confidence, source, notes, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, documentId || null, caseId || null, c.value, c.type, status, confidence, 'heuristic', null, Date.now());
    return { id, citation: c.value, type: c.type, status, confidence };
  });

  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'verification.run',
    entityType: 'verification',
    entityId: documentId || caseId || 'adhoc',
    payload: { count: results.length },
  });

  return {
    citations: results,
    summary: {
      total: results.length,
      verified: results.filter((r) => r.status === 'verified').length,
      high_confidence: results.filter((r) => r.status === 'high_confidence').length,
      escalation: results.filter((r) => r.status === 'escalation').length,
      blocked: results.filter((r) => r.status === 'blocked').length,
    },
  };
}

function overrideVerification(id, { status, notes }, actor) {
  const db = get();
  const existing = db.prepare('SELECT * FROM verifications WHERE id = ?').get(id);
  if (!existing) throw new Error('Verification not found');
  // Manual override: human says the parser's tier is wrong. Update status and
  // pin confidence to the floor of the new tier so the override is honest.
  const floor =
    status === 'verified' ? 1.0 :
    status === 'high_confidence' ? 0.99 :
    status === 'escalation' ? 0.98 : 0.0;
  db.prepare(
    'UPDATE verifications SET status = ?, confidence = ?, source = ?, notes = ? WHERE id = ?'
  ).run(status, floor, 'manual_override', notes || null, id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'verification.override',
    entityType: 'verification',
    entityId: id,
    payload: { previous: existing.status, new: status, notes },
  });
  return db.prepare('SELECT * FROM verifications WHERE id = ?').get(id);
}

function deleteVerification(id, actor) {
  const db = get();
  const existing = db.prepare('SELECT * FROM verifications WHERE id = ?').get(id);
  if (!existing) return { ok: false };
  db.prepare('DELETE FROM verifications WHERE id = ?').run(id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'verification.delete',
    entityType: 'verification',
    entityId: id,
    payload: { citation: existing.citation },
  });
  return { ok: true };
}

function addManualCitation({ citation, citation_type, status, caseId, documentId, notes }, actor) {
  const db = get();
  const floor =
    status === 'verified' ? 1.0 :
    status === 'high_confidence' ? 0.99 :
    status === 'escalation' ? 0.98 : 0.0;
  const id = newId();
  db.prepare(
    `INSERT INTO verifications (id, document_id, case_id, citation, citation_type, status, confidence, source, notes, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, documentId || null, caseId || null, citation, citation_type || 'manual', status, floor, 'manual_entry', notes || null, Date.now());
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'verification.manual_add',
    entityType: 'verification',
    entityId: id,
    payload: { citation, status },
  });
  return db.prepare('SELECT * FROM verifications WHERE id = ?').get(id);
}

function listVerifications({ caseId, documentId } = {}) {
  const db = get();
  const where = [];
  const params = {};
  if (caseId) { where.push('case_id = @caseId'); params.caseId = caseId; }
  if (documentId) { where.push('document_id = @documentId'); params.documentId = documentId; }
  const sql = `SELECT * FROM verifications ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY checked_at DESC LIMIT 500`;
  return db.prepare(sql).all(params);
}

module.exports = {
  'verification:run': (args) => verifyText(args, args.actor),
  'verification:list': (args) => listVerifications(args || {}),
  'verification:override': (args) => overrideVerification(args.id, args.patch, args.actor),
  'verification:delete': (args) => deleteVerification(args.id, args.actor),
  'verification:manualAdd': (args) => addManualCitation(args, args.actor),
};
