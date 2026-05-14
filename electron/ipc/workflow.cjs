const { get } = require('../db/connection.cjs');
const { newId } = require('../services/hash.cjs');
const { appendAudit } = require('../services/audit.cjs');

const STAGES = ['intake', 'review', 'drafting', 'verification', 'delivery'];

function listWorkflowItems({ caseId, stage } = {}) {
  const db = get();
  const where = [];
  const params = {};
  if (caseId) {
    where.push('case_id = @caseId');
    params.caseId = caseId;
  }
  if (stage) {
    where.push('stage = @stage');
    params.stage = stage;
  }
  const sql = `SELECT w.*, c.case_number, c.title AS case_title, u.name AS assignee_name
               FROM workflow_items w
               LEFT JOIN cases c ON c.id = w.case_id
               LEFT JOIN users u ON u.id = w.assigned_to
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY w.due_date ASC`;
  return db.prepare(sql).all(params);
}

function pipelineSummary() {
  const db = get();
  const counts = db
    .prepare('SELECT stage, COUNT(*) AS count FROM workflow_items GROUP BY stage')
    .all();
  const byStage = STAGES.map((s) => ({
    stage: s,
    count: counts.find((c) => c.stage === s)?.count || 0,
  }));

  const blocked = db
    .prepare('SELECT COUNT(*) AS c FROM workflow_items WHERE blocked_reason IS NOT NULL')
    .get().c;

  const overdue = db
    .prepare('SELECT COUNT(*) AS c FROM workflow_items WHERE due_date IS NOT NULL AND due_date < ?')
    .get(Date.now()).c;

  // Bottleneck: stage with the highest count
  const bottleneck = byStage.reduce((acc, s) => (s.count > acc.count ? s : acc), { stage: null, count: 0 });

  return { stages: STAGES, byStage, blocked, overdue, bottleneck };
}

function createItem(input, actor) {
  const db = get();
  const now = Date.now();
  const id = newId();
  db.prepare(
    `INSERT INTO workflow_items (id, case_id, title, stage, assigned_to, priority, due_date, blocked_reason, notes, created_at, updated_at)
     VALUES (@id, @case_id, @title, @stage, @assigned_to, @priority, @due_date, @blocked_reason, @notes, @now, @now)`
  ).run({
    id,
    case_id: input.case_id || null,
    title: input.title,
    stage: input.stage || 'intake',
    assigned_to: input.assigned_to || null,
    priority: input.priority || 'normal',
    due_date: input.due_date || null,
    blocked_reason: input.blocked_reason || null,
    notes: input.notes || null,
    now,
  });
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'workflow.create',
    entityType: 'workflow',
    entityId: id,
    payload: { title: input.title, stage: input.stage },
  });
  return db.prepare('SELECT * FROM workflow_items WHERE id = ?').get(id);
}

function updateItem(id, patch, actor) {
  const db = get();
  const existing = db.prepare('SELECT * FROM workflow_items WHERE id = ?').get(id);
  if (!existing) throw new Error('Workflow item not found');
  const merged = { ...existing, ...patch, updated_at: Date.now() };
  db.prepare(
    `UPDATE workflow_items SET case_id=@case_id, title=@title, stage=@stage, assigned_to=@assigned_to,
       priority=@priority, due_date=@due_date, blocked_reason=@blocked_reason, notes=@notes, updated_at=@updated_at
     WHERE id=@id`
  ).run(merged);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'workflow.update',
    entityType: 'workflow',
    entityId: id,
    payload: patch,
  });
  return db.prepare('SELECT * FROM workflow_items WHERE id = ?').get(id);
}

function advance(id, actor) {
  const db = get();
  const item = db.prepare('SELECT * FROM workflow_items WHERE id = ?').get(id);
  if (!item) throw new Error('Workflow item not found');
  const idx = STAGES.indexOf(item.stage);
  if (idx === -1 || idx === STAGES.length - 1) return item;
  return updateItem(id, { stage: STAGES[idx + 1] }, actor);
}

function retreat(id, actor) {
  const db = get();
  const item = db.prepare('SELECT * FROM workflow_items WHERE id = ?').get(id);
  if (!item) throw new Error('Workflow item not found');
  const idx = STAGES.indexOf(item.stage);
  if (idx <= 0) return item;
  return updateItem(id, { stage: STAGES[idx - 1] }, actor);
}

function block(id, reason, actor) {
  return updateItem(id, { blocked_reason: reason }, actor);
}

function unblock(id, actor) {
  return updateItem(id, { blocked_reason: null }, actor);
}

function deleteItem(id, actor) {
  const db = get();
  db.prepare('DELETE FROM workflow_items WHERE id = ?').run(id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'workflow.delete',
    entityType: 'workflow',
    entityId: id,
  });
  return { ok: true };
}

module.exports = {
  'workflow:list': (args) => listWorkflowItems(args || {}),
  'workflow:summary': () => pipelineSummary(),
  'workflow:create': (args) => createItem(args.input, args.actor),
  'workflow:update': (args) => updateItem(args.id, args.patch, args.actor),
  'workflow:advance': (args) => advance(args.id, args.actor),
  'workflow:retreat': (args) => retreat(args.id, args.actor),
  'workflow:block': (args) => block(args.id, args.reason, args.actor),
  'workflow:unblock': (args) => unblock(args.id, args.actor),
  'workflow:delete': (args) => deleteItem(args.id, args.actor),
};
