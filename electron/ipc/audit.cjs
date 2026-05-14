const { get } = require('../db/connection.cjs');
const { verifyAuditChain } = require('../services/audit.cjs');

function listAudit({ entityType, entityId, search, limit = 200, offset = 0 } = {}) {
  const db = get();
  const where = [];
  const params = { limit, offset };
  if (entityType) {
    where.push('entity_type = @entityType');
    params.entityType = entityType;
  }
  if (entityId) {
    where.push('entity_id = @entityId');
    params.entityId = entityId;
  }
  if (search) {
    where.push('(action LIKE @s OR entity_id LIKE @s OR actor_name LIKE @s)');
    params.s = `%${search}%`;
  }
  const sql = `SELECT * FROM audit_log
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY id DESC LIMIT @limit OFFSET @offset`;
  return db.prepare(sql).all(params);
}

function auditCount({ entityType, entityId, search } = {}) {
  const db = get();
  const where = [];
  const params = {};
  if (entityType) { where.push('entity_type = @entityType'); params.entityType = entityType; }
  if (entityId) { where.push('entity_id = @entityId'); params.entityId = entityId; }
  if (search) { where.push('(action LIKE @s OR entity_id LIKE @s OR actor_name LIKE @s)'); params.s = `%${search}%`; }
  const sql = `SELECT COUNT(*) AS c FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  return db.prepare(sql).get(params).c;
}

module.exports = {
  'audit:list': (args) => listAudit(args || {}),
  'audit:count': (args) => auditCount(args || {}),
  'audit:verify': () => verifyAuditChain(),
};
