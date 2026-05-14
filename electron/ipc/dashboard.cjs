const { get } = require('../db/connection.cjs');
const { verifyAuditChain } = require('../services/audit.cjs');

function dashboardSnapshot() {
  const db = get();
  const now = Date.now();
  const day = 86400000;

  const totalCases = db.prepare('SELECT COUNT(*) AS c FROM cases').get().c;
  const openCases = db.prepare('SELECT COUNT(*) AS c FROM cases WHERE status = ?').get('open').c;
  const reservedCases = db.prepare('SELECT COUNT(*) AS c FROM cases WHERE status = ?').get('reserved').c;
  const judgmentPending = db.prepare('SELECT COUNT(*) AS c FROM cases WHERE status = ?').get('judgment_pending').c;

  const upcomingEvents = db
    .prepare('SELECT e.*, c.case_number FROM calendar_events e LEFT JOIN cases c ON c.id = e.case_id WHERE start_at BETWEEN ? AND ? ORDER BY start_at ASC LIMIT 8')
    .all(now, now + 30 * day);

  const overdueWork = db
    .prepare(
      `SELECT w.*, c.case_number, c.title AS case_title FROM workflow_items w
         LEFT JOIN cases c ON c.id = w.case_id
       WHERE w.due_date IS NOT NULL AND w.due_date < ?
       ORDER BY w.due_date ASC LIMIT 8`
    )
    .all(now);

  const recentDocs = db
    .prepare('SELECT id, original_name, sha256, uploaded_at FROM documents ORDER BY uploaded_at DESC LIMIT 5')
    .all();

  const verificationCounts = db
    .prepare('SELECT status, COUNT(*) AS count FROM verifications GROUP BY status')
    .all();

  const auditSnapshot = db
    .prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 6')
    .all();

  const chain = verifyAuditChain();

  return {
    cases: { total: totalCases, open: openCases, reserved: reservedCases, judgment_pending: judgmentPending },
    upcomingEvents,
    overdueWork,
    recentDocs,
    verificationCounts,
    auditSnapshot,
    auditChain: chain,
  };
}

module.exports = {
  'dashboard:snapshot': () => dashboardSnapshot(),
};
