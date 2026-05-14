const { get } = require('../db/connection.cjs');

// Sanitise the user's query for FTS5. We accept simple keywords, quote
// the whole thing to neutralise FTS5 operator characters, and append `*`
// to the trailing token for prefix matching.
function buildFtsQuery(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  // Strip characters FTS5 treats as operators
  const cleaned = trimmed.replace(/["()*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(' ');
  // Quote each token to escape anything FTS5-special, plus add * for prefix
  // matching on the last token to feel responsive while typing.
  return tokens
    .map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`))
    .join(' ');
}

function snippet(text, query, length = 240) {
  if (!text) return '';
  const lower = text.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let bestIdx = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (bestIdx === -1 || i < bestIdx)) bestIdx = i;
  }
  if (bestIdx === -1) bestIdx = 0;
  const start = Math.max(0, bestIdx - 60);
  const end = Math.min(text.length, start + length);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < text.length ? ' …' : '';
  return prefix + text.slice(start, end).replace(/\s+/g, ' ').trim() + suffix;
}

function globalSearch({ query, limit = 12 } = {}) {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return { query, results: [] };
  const db = get();
  const out = [];

  // Cases
  const cases = db
    .prepare(
      `SELECT c.id, c.case_number, c.title, c.parties_appellant, c.parties_respondent, c.description
         FROM cases_fts JOIN cases c ON c.oid = cases_fts.rowid
        WHERE cases_fts MATCH @q ORDER BY rank LIMIT @limit`
    )
    .all({ q: ftsQuery, limit });
  for (const c of cases) {
    out.push({
      kind: 'case',
      id: c.id,
      title: `${c.case_number} — ${c.title}`,
      subtitle: `${c.parties_appellant || ''} v ${c.parties_respondent || ''}`,
      snippet: snippet(c.description || c.title, query),
      route: '/cabinet',
    });
  }

  // Documents
  const docs = db
    .prepare(
      `SELECT d.id, d.original_name, d.notes, c.case_number
         FROM documents_fts JOIN documents d ON d.oid = documents_fts.rowid
         LEFT JOIN cases c ON c.id = d.case_id
        WHERE documents_fts MATCH @q ORDER BY rank LIMIT @limit`
    )
    .all({ q: ftsQuery, limit });
  for (const d of docs) {
    out.push({
      kind: 'document',
      id: d.id,
      title: d.original_name,
      subtitle: d.case_number || 'unfiled',
      snippet: snippet(d.notes || '', query),
      route: '/cabinet',
    });
  }

  // Generated documents
  const gens = db
    .prepare(
      `SELECT g.id, g.title, g.doc_type, g.body, g.status, c.case_number FROM (
         SELECT gd.id AS id, gd.title AS title, gd.doc_type AS doc_type, gd.content AS body,
                gd.status AS status, gd.case_id AS case_id
         FROM generated_documents_fts
         JOIN generated_documents gd ON gd.oid = generated_documents_fts.rowid
         WHERE generated_documents_fts MATCH @q
         ORDER BY rank LIMIT @limit) g
       LEFT JOIN cases c ON c.id = g.case_id`
    )
    .all({ q: ftsQuery, limit });
  for (const g of gens) {
    out.push({
      kind: 'generated',
      id: g.id,
      title: `${g.title} (${g.doc_type})`,
      subtitle: `${g.status} · ${g.case_number || '—'}`,
      snippet: snippet(g.body, query),
      route: '/generator',
    });
  }

  // Agent messages
  const msgs = db
    .prepare(
      `SELECT m.id, m.thread_id, m.content, m.role, t.title AS thread_title
         FROM agent_messages_fts
         JOIN agent_messages m ON m.oid = agent_messages_fts.rowid
         JOIN agent_threads t ON t.id = m.thread_id
        WHERE agent_messages_fts MATCH @q ORDER BY rank LIMIT @limit`
    )
    .all({ q: ftsQuery, limit });
  for (const m of msgs) {
    out.push({
      kind: 'agent_message',
      id: m.id,
      title: m.thread_title,
      subtitle: m.role,
      snippet: snippet(m.content, query),
      route: '/agent',
    });
  }

  // Audit
  const audit = db
    .prepare(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.actor_name, a.payload, a.timestamp
         FROM audit_log_fts
         JOIN audit_log a ON a.id = audit_log_fts.rowid
        WHERE audit_log_fts MATCH @q ORDER BY rank LIMIT @limit`
    )
    .all({ q: ftsQuery, limit });
  for (const a of audit) {
    out.push({
      kind: 'audit',
      id: String(a.id),
      title: `${a.action} · ${a.entity_type}`,
      subtitle: a.actor_name || 'system',
      snippet: snippet(a.payload || '', query),
      route: '/audit',
    });
  }

  return { query, results: out };
}

module.exports = {
  'search:global': (args) => globalSearch(args || {}),
};
