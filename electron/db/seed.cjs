// First-run seed.
//
// Intentionally minimal: one owner user and the default settings.
// No sample cases, no workflow tasks, no calendar events — the user
// starts from a blank workspace.
const crypto = require('node:crypto');

function id() {
  return crypto.randomUUID();
}

function runSeed(db) {
  const now = Date.now();

  // The owner — every audit entry needs an actor; this is the one row
  // we plant on first run so the workspace has a "current user". The
  // user can rename / edit themselves from Settings → Users.
  const userId = id();
  db.prepare(
    'INSERT INTO users (id, name, email, role, rank, is_current, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    userId,
    'Sanique Richards',
    'williamsmachell@gmail.com',
    'admin',
    null,
    1,
    now
  );

  // Default settings. These are config defaults, not sample data, so
  // they ship with every install. The user can override every key from
  // Settings.
  const insertSetting = db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
  );
  const defaults = {
    'ai.provider': 'none',
    'ai.api_key': '',
    'ai.model': 'claude-sonnet-4-6',
    'ai.base_url': '',
    'ai.system_prompt':
      'You are a research and drafting assistant. Be precise, cite authorities where appropriate, and flag uncertainty rather than guessing.',
    'compliance.confidence_floor': '0.98',
    'compliance.require_citation': 'true',
    'compliance.print_provenance': 'true',
    'integrations.onenote_path': '',
    'integrations.outlook_email': '',
    'ui.theme': 'obsidian',
    'app.first_run_complete': '0',
  };
  for (const [k, v] of Object.entries(defaults)) {
    insertSetting.run(k, v, now);
  }
}

module.exports = { runSeed };
