const { get } = require('../db/connection.cjs');
const { newId } = require('../services/hash.cjs');
const { appendAudit } = require('../services/audit.cjs');

function listEvents({ from, to, term, roster } = {}) {
  const db = get();
  const where = [];
  const params = {};
  if (from) {
    where.push('end_at >= @from');
    params.from = from;
  }
  if (to) {
    where.push('start_at <= @to');
    params.to = to;
  }
  if (term) {
    where.push('court_term = @term');
    params.term = term;
  }
  if (roster) {
    where.push('roster = @roster');
    params.roster = roster;
  }
  const sql = `SELECT e.*, c.case_number, c.title AS case_title
               FROM calendar_events e
               LEFT JOIN cases c ON c.id = e.case_id
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY start_at ASC`;
  return db.prepare(sql).all(params);
}

function createEvent(input, actor) {
  const db = get();
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO calendar_events (id, case_id, title, description, start_at, end_at, event_type, location, court_term, roster, created_at)
     VALUES (@id, @case_id, @title, @description, @start_at, @end_at, @event_type, @location, @court_term, @roster, @now)`
  ).run({
    id,
    case_id: input.case_id || null,
    title: input.title,
    description: input.description || null,
    start_at: input.start_at,
    end_at: input.end_at,
    event_type: input.event_type || 'hearing',
    location: input.location || 'Court of Appeal, Kingston',
    court_term: input.court_term || null,
    roster: input.roster || null,
    now,
  });
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'calendar.create',
    entityType: 'calendar_event',
    entityId: id,
    payload: { title: input.title, start_at: input.start_at },
  });
  return db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
}

function updateEvent(id, patch, actor) {
  const db = get();
  const existing = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
  if (!existing) throw new Error('Calendar event not found');
  const merged = { ...existing, ...patch };
  db.prepare(
    `UPDATE calendar_events SET case_id=@case_id, title=@title, description=@description,
       start_at=@start_at, end_at=@end_at, event_type=@event_type, location=@location,
       court_term=@court_term, roster=@roster
     WHERE id=@id`
  ).run(merged);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'calendar.update',
    entityType: 'calendar_event',
    entityId: id,
    payload: patch,
  });
  return db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
}

function deleteEvent(id, actor) {
  const db = get();
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'calendar.delete',
    entityType: 'calendar_event',
    entityId: id,
  });
  return { ok: true };
}

module.exports = {
  'calendar:list': (args) => listEvents(args || {}),
  'calendar:create': (args) => createEvent(args.input, args.actor),
  'calendar:update': (args) => updateEvent(args.id, args.patch, args.actor),
  'calendar:delete': (args) => deleteEvent(args.id, args.actor),
};
