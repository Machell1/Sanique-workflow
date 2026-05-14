const { get } = require('../db/connection.cjs');
const { newId } = require('../services/hash.cjs');
const { appendAudit } = require('../services/audit.cjs');

function listCases({ status, term, search } = {}) {
  const db = get();
  const where = [];
  const params = {};
  if (status) {
    where.push('status = @status');
    params.status = status;
  }
  if (term) {
    where.push('court_term = @term');
    params.term = term;
  }
  if (search) {
    where.push('(case_number LIKE @search OR title LIKE @search OR parties_appellant LIKE @search OR parties_respondent LIKE @search)');
    params.search = `%${search}%`;
  }
  const sql = `SELECT * FROM cases ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`;
  return db.prepare(sql).all(params);
}

function getCase(id) {
  const db = get();
  return db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
}

function createCase(input, actor) {
  const db = get();
  const now = Date.now();
  const id = newId();
  db.prepare(
    `INSERT INTO cases (id, case_number, title, case_type, status, filed_date, court_term, roster, presiding_judge, parties_appellant, parties_respondent, description, created_at, updated_at)
     VALUES (@id, @case_number, @title, @case_type, @status, @filed_date, @court_term, @roster, @presiding_judge, @parties_appellant, @parties_respondent, @description, @now, @now)`
  ).run({
    id,
    case_number: input.case_number,
    title: input.title,
    case_type: input.case_type,
    status: input.status || 'open',
    filed_date: input.filed_date || now,
    court_term: input.court_term || null,
    roster: input.roster || null,
    presiding_judge: input.presiding_judge || null,
    parties_appellant: input.parties_appellant || null,
    parties_respondent: input.parties_respondent || null,
    description: input.description || null,
    now,
  });
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'case.create',
    entityType: 'case',
    entityId: id,
    payload: { case_number: input.case_number, title: input.title },
  });
  return getCase(id);
}

function updateCase(id, patch, actor) {
  const db = get();
  const existing = getCase(id);
  if (!existing) throw new Error('Case not found');
  const merged = { ...existing, ...patch, updated_at: Date.now() };
  db.prepare(
    `UPDATE cases SET case_number=@case_number, title=@title, case_type=@case_type, status=@status, filed_date=@filed_date,
       court_term=@court_term, roster=@roster, presiding_judge=@presiding_judge, parties_appellant=@parties_appellant,
       parties_respondent=@parties_respondent, description=@description, updated_at=@updated_at
     WHERE id=@id`
  ).run(merged);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'case.update',
    entityType: 'case',
    entityId: id,
    payload: patch,
  });
  return getCase(id);
}

function deleteCase(id, actor) {
  const db = get();
  const existing = getCase(id);
  if (!existing) return { ok: false };
  db.prepare('DELETE FROM cases WHERE id = ?').run(id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'case.delete',
    entityType: 'case',
    entityId: id,
    payload: { case_number: existing.case_number },
  });
  return { ok: true };
}

function caseStats() {
  const db = get();
  const byStatus = db.prepare('SELECT status, COUNT(*) AS count FROM cases GROUP BY status').all();
  const byTerm = db.prepare('SELECT court_term AS term, COUNT(*) AS count FROM cases GROUP BY court_term').all();
  const byType = db.prepare('SELECT case_type AS type, COUNT(*) AS count FROM cases GROUP BY case_type').all();
  const total = db.prepare('SELECT COUNT(*) AS c FROM cases').get().c;
  return { total, byStatus, byTerm, byType };
}

module.exports = {
  'cases:list': (args) => listCases(args || {}),
  'cases:get': (args) => getCase(args.id),
  'cases:create': (args) => createCase(args.input, args.actor),
  'cases:update': (args) => updateCase(args.id, args.patch, args.actor),
  'cases:delete': (args) => deleteCase(args.id, args.actor),
  'cases:stats': () => caseStats(),
};
