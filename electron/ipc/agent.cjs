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

  const sysPrompt = getSetting('ai.system_prompt') || 'You are KIMI CLAW, a legal research assistant.';
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
  'agent:deleteThread': (args) => deleteThread(args.id, args.actor),
  'agent:send': (args) => sendMessage(args, args.actor),
};
