const crypto = require('node:crypto');

function id() {
  return crypto.randomUUID();
}

function runSeed(db) {
  const now = Date.now();

  // Default user — Senior Counsel Richards (per README)
  const userId = id();
  db.prepare(
    'INSERT INTO users (id, name, email, role, rank, is_current, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, 'S. Richards, KC', 'sc.richards@coa.gov.jm', 'counsel', 'Senior Counsel', 1, now);

  // A handful of additional users to make the UI feel populated
  const others = [
    ['Hon. Mr Justice A. Walker', 'a.walker@coa.gov.jm', 'judge', 'Justice of Appeal'],
    ['Hon. Mrs Justice P. McDonald', 'p.mcdonald@coa.gov.jm', 'judge', 'Justice of Appeal'],
    ['Hon. Mr Justice T. Sinclair', 't.sinclair@coa.gov.jm', 'judge', 'President of the Court of Appeal'],
    ['M. Brown', 'm.brown@coa.gov.jm', 'registrar', 'Registrar'],
    ['J. Lewis', 'j.lewis@coa.gov.jm', 'clerk', 'Senior Clerk'],
  ];
  const insertUser = db.prepare(
    'INSERT INTO users (id, name, email, role, rank, is_current, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
  );
  const userIds = { current: userId };
  for (const [name, email, role, rank] of others) {
    const uid = id();
    insertUser.run(uid, name, email, role, rank, now);
    userIds[name] = uid;
  }

  // Sample cases
  const cases = [
    {
      number: 'SCCA 12/2025',
      title: 'R v. Brown',
      type: 'criminal',
      status: 'judgment_pending',
      term: 'Hilary',
      roster: 'Roster A',
      judge: 'Hon. Mr Justice A. Walker',
      appellant: 'Anthony Brown',
      respondent: 'The Queen',
      description: 'Appeal against conviction for unlawful possession of firearm.',
    },
    {
      number: 'SCCA 47/2025',
      title: 'Allied Insurance v. Mitchell',
      type: 'civil',
      status: 'open',
      term: 'Hilary',
      roster: 'Roster B',
      judge: 'Hon. Mrs Justice P. McDonald',
      appellant: 'Allied Insurance Co. Ltd.',
      respondent: 'Howard Mitchell',
      description: 'Appeal from decision quantifying damages in motor vehicle claim.',
    },
    {
      number: 'SCCA 89/2024',
      title: 'In re: Estate of Henriques',
      type: 'civil',
      status: 'reserved',
      term: 'Easter',
      roster: 'Roster A',
      judge: 'Hon. Mr Justice T. Sinclair',
      appellant: 'Estate Trustees',
      respondent: 'Beneficiary Class',
      description: 'Appeal concerning construction of testamentary trust.',
    },
    {
      number: 'COA App 3/2025',
      title: 'Carter v. Director of Public Prosecutions',
      type: 'application',
      status: 'open',
      term: 'Hilary',
      roster: 'Roster C',
      judge: 'Hon. Mr Justice A. Walker',
      appellant: 'Marcus Carter',
      respondent: 'Director of Public Prosecutions',
      description: 'Application for leave to appeal sentence.',
    },
  ];

  const insertCase = db.prepare(
    `INSERT INTO cases (id, case_number, title, case_type, status, filed_date, court_term, roster, presiding_judge, parties_appellant, parties_respondent, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const caseIds = {};
  for (const c of cases) {
    const cid = id();
    caseIds[c.number] = cid;
    insertCase.run(
      cid,
      c.number,
      c.title,
      c.type,
      c.status,
      now - Math.floor(Math.random() * 90) * 86400000,
      c.term,
      c.roster,
      c.judge,
      c.appellant,
      c.respondent,
      c.description,
      now,
      now
    );
  }

  // Sample workflow items across stages
  const wfStages = ['intake', 'review', 'drafting', 'verification', 'delivery'];
  const wfTitles = {
    'SCCA 12/2025': ['Index transcripts', 'Cross-reference exhibits', 'Draft reasons', 'Verify R v. Smith citation', 'Deliver to registry'],
    'SCCA 47/2025': ['Receive Notice of Appeal', 'Review submissions', 'Draft outline', null, null],
    'SCCA 89/2024': [null, null, 'Draft reserved judgment', 'Cross-check authorities', null],
    'COA App 3/2025': ['Confirm leave bundle', null, null, null, null],
  };
  const insertWf = db.prepare(
    `INSERT INTO workflow_items (id, case_id, title, stage, assigned_to, priority, due_date, blocked_reason, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const [num, titles] of Object.entries(wfTitles)) {
    titles.forEach((title, i) => {
      if (!title) return;
      insertWf.run(
        id(),
        caseIds[num],
        title,
        wfStages[i],
        userId,
        i === 3 ? 'high' : 'normal',
        now + (7 - i) * 86400000,
        null,
        null,
        now,
        now
      );
    });
  }

  // Sample calendar events (upcoming hearings)
  const insertEvent = db.prepare(
    `INSERT INTO calendar_events (id, case_id, title, description, start_at, end_at, event_type, location, court_term, roster, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const day = 86400000;
  const events = [
    { case: 'SCCA 12/2025', title: 'Judgment delivery — R v. Brown', t: 'judgment_delivery', start: now + 2 * day, end: now + 2 * day + 2 * 3600000 },
    { case: 'SCCA 47/2025', title: 'Hearing — Allied Insurance v. Mitchell', t: 'hearing', start: now + 5 * day, end: now + 5 * day + 4 * 3600000 },
    { case: 'COA App 3/2025', title: 'Case management — Carter v. DPP', t: 'case_management', start: now + 8 * day, end: now + 8 * day + 60 * 60 * 1000 },
    { case: null, title: 'Quarterly judges meeting', t: 'admin', start: now + 14 * day, end: now + 14 * day + 90 * 60 * 1000 },
  ];
  for (const e of events) {
    insertEvent.run(
      id(),
      e.case ? caseIds[e.case] : null,
      e.title,
      null,
      e.start,
      e.end,
      e.t,
      'Court of Appeal, Kingston',
      'Hilary',
      'Roster A',
      now
    );
  }

  // Default settings
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
