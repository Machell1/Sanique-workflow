const { get } = require('../db/connection.cjs');
const { newId } = require('../services/hash.cjs');
const { appendAudit } = require('../services/audit.cjs');

function getSetting(key) {
  const db = get();
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || '';
}

function listThreads() {
  const db = get();
  return db
    .prepare(
      `SELECT t.*, c.case_number, c.title AS case_title,
              (SELECT COUNT(*) FROM agent_messages m WHERE m.thread_id = t.id) AS message_count
       FROM agent_threads t
       LEFT JOIN cases c ON c.id = t.case_id
       ORDER BY updated_at DESC`
    )
    .all();
}

function getThread(id) {
  const db = get();
  const thread = db.prepare('SELECT * FROM agent_threads WHERE id = ?').get(id);
  if (!thread) return null;
  const messages = db
    .prepare('SELECT * FROM agent_messages WHERE thread_id = ? ORDER BY created_at ASC')
    .all(id);
  return { ...thread, messages };
}

function createThread({ title, caseId } = {}, actor) {
  const db = get();
  const id = newId();
  const now = Date.now();
  db.prepare(
    'INSERT INTO agent_threads (id, case_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, caseId || null, title || 'New conversation', now, now);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'agent.thread_create',
    entityType: 'agent_thread',
    entityId: id,
    payload: { title, caseId },
  });
  return getThread(id);
}

function updateThread(id, patch, actor) {
  const db = get();
  const existing = db.prepare('SELECT * FROM agent_threads WHERE id = ?').get(id);
  if (!existing) throw new Error('Thread not found');
  const merged = {
    id,
    title: patch.title !== undefined ? patch.title : existing.title,
    case_id: patch.case_id !== undefined ? patch.case_id : existing.case_id,
    updated_at: Date.now(),
  };
  db.prepare('UPDATE agent_threads SET title=@title, case_id=@case_id, updated_at=@updated_at WHERE id=@id').run(merged);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'agent.thread_update',
    entityType: 'agent_thread',
    entityId: id,
    payload: patch,
  });
  return getThread(id);
}

function deleteThread(id, actor) {
  const db = get();
  db.prepare('DELETE FROM agent_threads WHERE id = ?').run(id);
  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'agent.thread_delete',
    entityType: 'agent_thread',
    entityId: id,
  });
  return { ok: true };
}

async function callProvider(messages) {
  const provider = getSetting('ai.provider');
  const apiKey = getSetting('ai.api_key');
  const model = getSetting('ai.model') || 'claude-sonnet-4-6';

  if (!provider || provider === 'none' || !apiKey) {
    return {
      content:
        'AI provider is not configured. Open Settings → Integrations and add an API key for Anthropic or OpenAI to enable KIMI CLAW.\n\nWithout a provider configured, KIMI CLAW will only echo your prompt and run heuristic citation checks.',
      confidence: null,
      citations: [],
      mocked: true,
    };
  }

  if (provider === 'anthropic') {
    return callAnthropic(apiKey, model, messages);
  }
  if (provider === 'openai') {
    return callOpenAI(apiKey, model, messages);
  }
  return { content: `Unknown provider: ${provider}`, confidence: null, citations: [], mocked: true };
}

async function callAnthropic(apiKey, model, messages) {
  const sys = messages.find((m) => m.role === 'system')?.content || '';
  const filtered = messages.filter((m) => m.role !== 'system');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: sys,
      messages: filtered.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const text = data.content?.map((c) => c.text).filter(Boolean).join('\n') || '';
  return { content: text, confidence: 0.99, citations: [], mocked: false };
}

async function callOpenAI(apiKey, model, messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 2048,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { content: text, confidence: 0.99, citations: [], mocked: false };
}

function buildCaseContext(caseId, userQuery) {
  if (!caseId) return '';
  const db = get();
  const c = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!c) return '';

  const docs = db
    .prepare(
      `SELECT id, original_name, category, uploaded_at, content_indexed_at, content_pages
       FROM documents WHERE case_id = ? ORDER BY uploaded_at DESC LIMIT 12`
    )
    .all(caseId);

  const events = db
    .prepare(
      `SELECT title, start_at, event_type FROM calendar_events
       WHERE case_id = ? AND start_at >= ? ORDER BY start_at ASC LIMIT 6`
    )
    .all(caseId, Date.now() - 86400000);

  // Try to find content snippets from this case's documents matching the
  // latest user message. Strip FTS operators, prefix-match the last word.
  let snippetBlocks = [];
  if (userQuery) {
    const cleaned = String(userQuery).replace(/["()*]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length >= 3) {
      const tokens = cleaned.split(' ').filter((t) => t.length >= 2).slice(0, 6);
      if (tokens.length > 0) {
        const ftsQuery = tokens
          .map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`))
          .join(' ');
        try {
          const hits = db
            .prepare(
              `SELECT d.original_name,
                      snippet(documents_content_fts, 0, '<<', '>>', '…', 24) AS snip
                 FROM documents_content_fts
                 JOIN documents d ON d.oid = documents_content_fts.rowid
                WHERE d.case_id = ?
                  AND documents_content_fts MATCH ?
                ORDER BY rank LIMIT 4`
            )
            .all(caseId, ftsQuery);
          snippetBlocks = hits.map((h) => `[${h.original_name}]\n${h.snip}`);
        } catch {
          /* FTS may fail on adversarial inputs; ignore */
        }
      }
    }
  }

  const docList = docs.length
    ? docs
        .map(
          (d) =>
            `- ${d.original_name} (${d.category}${d.content_indexed_at ? `, searchable, ${d.content_pages || '?'} pages` : ', not yet indexed'})`
        )
        .join('\n')
    : '(no documents filed yet)';

  const eventList = events.length
    ? events
        .map((e) => `- ${e.event_type.replace('_', ' ')}: ${e.title} (${new Date(e.start_at).toISOString().slice(0, 10)})`)
        .join('\n')
    : '(no upcoming events)';

  const snippetSection = snippetBlocks.length
    ? `\n\nRelevant excerpts from the case file matching the user's question:\n${snippetBlocks.join('\n\n')}`
    : '';

  return `
=== CASE CONTEXT ===
Case ${c.case_number} — ${c.title}
Type: ${c.case_type} · Status: ${c.status} · Term: ${c.court_term || '—'} · Roster: ${c.roster || '—'}
Presiding: ${c.presiding_judge || '—'}
Appellant: ${c.parties_appellant || '—'}
Respondent: ${c.parties_respondent || '—'}
${c.description ? `\nDescription: ${c.description}` : ''}

Filed documents (${docs.length}):
${docList}

Upcoming events (${events.length}):
${eventList}${snippetSection}

You may reference these facts in your reply. If the user asks about something not in this context, say so plainly rather than guessing.
=== END CASE CONTEXT ===
`;
}

async function sendMessage({ threadId, content }, actor) {
  if (!threadId) throw new Error('threadId required');
  const db = get();
  const thread = db.prepare('SELECT * FROM agent_threads WHERE id = ?').get(threadId);
  if (!thread) throw new Error('Thread not found');

  const now = Date.now();
  const userMsgId = newId();
  db.prepare(
    'INSERT INTO agent_messages (id, thread_id, role, content, confidence, citations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userMsgId, threadId, 'user', content, null, null, now);

  // Build message history
  const history = db
    .prepare('SELECT role, content FROM agent_messages WHERE thread_id = ? ORDER BY created_at ASC')
    .all(threadId);

  const basePrompt = getSetting('ai.system_prompt') || 'You are KIMI CLAW, a legal research assistant.';
  const caseContext = buildCaseContext(thread.case_id, content);
  const sysPrompt = caseContext ? `${basePrompt}\n${caseContext}` : basePrompt;
  const messages = [{ role: 'system', content: sysPrompt }, ...history];

  let assistantResponse;
  try {
    assistantResponse = await callProvider(messages);
  } catch (err) {
    assistantResponse = { content: `[Provider error] ${err.message}`, confidence: null, citations: [], mocked: false };
  }

  const assistantMsgId = newId();
  db.prepare(
    'INSERT INTO agent_messages (id, thread_id, role, content, confidence, citations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    assistantMsgId,
    threadId,
    'assistant',
    assistantResponse.content,
    assistantResponse.confidence,
    assistantResponse.citations ? JSON.stringify(assistantResponse.citations) : null,
    Date.now()
  );

  db.prepare('UPDATE agent_threads SET updated_at = ? WHERE id = ?').run(Date.now(), threadId);

  appendAudit({
    actorId: actor?.id,
    actorName: actor?.name,
    action: 'agent.message',
    entityType: 'agent_thread',
    entityId: threadId,
    payload: { user_msg: userMsgId, assistant_msg: assistantMsgId, mocked: assistantResponse.mocked || false },
  });

  return getThread(threadId);
}

module.exports = {
  'agent:threads': () => listThreads(),
  'agent:thread': (args) => getThread(args.id),
  'agent:createThread': (args) => createThread(args || {}, args?.actor),
  'agent:updateThread': (args) => updateThread(args.id, args.patch, args.actor),
  'agent:deleteThread': (args) => deleteThread(args.id, args.actor),
  'agent:send': (args) => sendMessage(args, args.actor),
};
