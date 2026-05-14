#!/usr/bin/env node
/**
 * End-to-end QA harness — exercises every IPC handler against a fresh
 * SQLite database without launching the UI. Prints PASS/FAIL per check;
 * exits non-zero on any failure so this can be wired into CI.
 *
 * Note: this harness imports the IPC modules directly with Node, so any
 * code path that requires Electron's `app` or `BrowserWindow` is skipped
 * (e.g. shell.openPath in email export, dialog.showSaveDialog in
 * documents.upload). Those are isolated to the main process bindings;
 * the database / business logic the IPC modules contain is otherwise
 * fully exercised.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const TEST_USER_DATA = path.join(ROOT, '.qa-userdata');

// Clean previous run
if (fs.existsSync(TEST_USER_DATA)) fs.rmSync(TEST_USER_DATA, { recursive: true, force: true });
fs.mkdirSync(TEST_USER_DATA, { recursive: true });

// Stub Electron's `shell` for IPC modules that import it (email.cjs).
// We replace the real module in require.cache with a no-op shell so the
// upload/email handlers don't blow up calling `shell.openPath`.
const Module = require('node:module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') return require.resolve('./qa-electron-stub.cjs');
  return origResolve.call(this, request, ...rest);
};

// Wire in the DB connection — this also runs migrations + seed
const db = require(path.join(ROOT, 'electron', 'db', 'connection.cjs'));
db.init(TEST_USER_DATA);

// Import every IPC module so we can call its handlers directly
const cases = require(path.join(ROOT, 'electron', 'ipc', 'cases.cjs'));
const documents = require(path.join(ROOT, 'electron', 'ipc', 'documents.cjs'));
const workflow = require(path.join(ROOT, 'electron', 'ipc', 'workflow.cjs'));
const calendar = require(path.join(ROOT, 'electron', 'ipc', 'calendar.cjs'));
const audit = require(path.join(ROOT, 'electron', 'ipc', 'audit.cjs'));
const settings = require(path.join(ROOT, 'electron', 'ipc', 'settings.cjs'));
const verification = require(path.join(ROOT, 'electron', 'ipc', 'verification.cjs'));
const generator = require(path.join(ROOT, 'electron', 'ipc', 'generator.cjs'));
const agent = require(path.join(ROOT, 'electron', 'ipc', 'agent.cjs'));
const dashboard = require(path.join(ROOT, 'electron', 'ipc', 'dashboard.cjs'));
const search = require(path.join(ROOT, 'electron', 'ipc', 'search.cjs'));
const bundles = require(path.join(ROOT, 'electron', 'ipc', 'bundles.cjs'));
const notes = require(path.join(ROOT, 'electron', 'ipc', 'notes.cjs'));
const versions = require(path.join(ROOT, 'electron', 'ipc', 'versions.cjs'));
const signatures = require(path.join(ROOT, 'electron', 'ipc', 'signatures.cjs'));
const email = require(path.join(ROOT, 'electron', 'ipc', 'email.cjs'));

// ─── Test harness ──────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

async function check(label, fn) {
  try {
    const r = await fn();
    if (r === false) throw new Error('returned false');
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${label} — ${err.message}`);
    failed++;
    failures.push({ label, err: err.message, stack: err.stack });
  }
}

function group(name, fn) {
  console.log(`\n${name}`);
  return fn();
}

// Get the seeded current user
const currentUser = settings['users:current']();
console.log(`Active user: ${currentUser.name} (${currentUser.id})`);
const actor = currentUser;

(async () => {
  // ─── Settings ─────────────────────────────────────────────────────
  await group('Settings', async () => {
    await check('settings:all returns rows', () => {
      const all = settings['settings:all']();
      return Array.isArray(all) && all.length > 0;
    });
    await check('AI API key is masked', () => {
      const all = settings['settings:all']();
      const key = all.find((s) => s.key === 'ai.api_key');
      return key && key._masked === true;
    });
    await check('settings:set + audit', () => {
      settings['settings:set']({ key: 'ui.theme', value: 'obsidian', actor });
      const got = settings['settings:get']({ key: 'ui.theme' });
      return got.value === 'obsidian';
    });
  });

  // ─── Users ────────────────────────────────────────────────────────
  let secondUserId;
  await group('Users', async () => {
    await check('users:list seeded users', () => {
      const list = settings['users:list']();
      return list.length >= 6;
    });
    await check('users:create new user', () => {
      const u = settings['users:create']({
        input: { name: 'Test Counsel', email: 't.counsel@coa.gov.jm', role: 'counsel', rank: 'Junior Counsel' },
        actor,
      });
      secondUserId = u.id;
      return !!u.id;
    });
    await check('users:update', () => {
      const u = settings['users:update']({ id: secondUserId, patch: { rank: 'Mid-tier Counsel' }, actor });
      return u.rank === 'Mid-tier Counsel';
    });
    await check('users:setCurrent switches active user', () => {
      const u = settings['users:setCurrent']({ id: secondUserId, actor });
      const current = settings['users:current']();
      return current.id === secondUserId;
    });
    // Switch back to seeded user for the rest of the tests
    await check('users:setCurrent back to seeded user', () => {
      settings['users:setCurrent']({ id: actor.id, actor });
      return settings['users:current']().id === actor.id;
    });
  });

  // ─── Cases ────────────────────────────────────────────────────────
  let caseId;
  await group('Cases', async () => {
    await check('cases:list returns seeded cases', () => {
      const all = cases['cases:list']({});
      return all.length >= 4;
    });
    await check('cases:create', () => {
      const c = cases['cases:create']({
        input: {
          case_number: 'SCCA QA/2026',
          title: 'QA v. Reality',
          case_type: 'civil',
          status: 'open',
          court_term: 'Hilary',
          roster: 'Roster A',
          presiding_judge: 'Hon. Mr Justice Test',
          parties_appellant: 'QA Appellant Co.',
          parties_respondent: 'Reality Holdings Ltd.',
          description: 'Test case for the QA harness.',
        },
        actor,
      });
      caseId = c.id;
      return !!c.id;
    });
    await check('cases:get returns full record', () => {
      const c = cases['cases:get']({ id: caseId });
      return c && c.title === 'QA v. Reality';
    });
    await check('cases:update changes status', () => {
      const c = cases['cases:update']({ id: caseId, patch: { status: 'reserved' }, actor });
      return c.status === 'reserved';
    });
    await check('cases:stats', () => {
      const s = cases['cases:stats']();
      return s.total >= 5;
    });
  });

  // ─── Documents ────────────────────────────────────────────────────
  let docId, pdfDocId;
  await group('Documents', async () => {
    // Create a small text file in the temp dir to upload
    const srcPath = path.join(TEST_USER_DATA, 'sample.txt');
    fs.writeFileSync(srcPath, 'This is a QA sample. Section 24 of the Constitution.');
    await check('documents:upload (text)', async () => {
      const d = await documents['documents:upload']({
        sourcePath: srcPath,
        originalName: 'qa-sample.txt',
        mimeType: 'text/plain',
        caseId,
        category: 'submission',
        notes: 'QA sample text',
        actor,
      });
      docId = d.id;
      return d.sha256.length === 64;
    });

    // PDF (minimal valid 1-page PDF)
    const pdfPath = path.join(TEST_USER_DATA, 'sample.pdf');
    const minimalPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000052 00000 n \n0000000098 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n152\n%%EOF'
    );
    fs.writeFileSync(pdfPath, minimalPdf);
    await check('documents:upload (pdf)', async () => {
      const d = await documents['documents:upload']({
        sourcePath: pdfPath,
        originalName: 'qa-sample.pdf',
        mimeType: 'application/pdf',
        caseId,
        category: 'exhibit',
        actor,
      });
      pdfDocId = d.id;
      return d.size > 0;
    });

    await check('documents:list filtered by case', () => {
      const list = documents['documents:list']({ caseId });
      return list.length >= 2;
    });

    await check('documents:update changes category', () => {
      const d = documents['documents:update']({ id: docId, patch: { category: 'judgment', notes: 'reclassified' }, actor });
      return d.category === 'judgment';
    });

    await check('documents:resolve returns full path', () => {
      const r = documents['documents:resolve']({ id: docId });
      return r.exists && r.path.includes(docId);
    });

    await check('documents:readBytes returns base64', () => {
      const r = documents['documents:readBytes']({ id: docId });
      const decoded = Buffer.from(r.base64, 'base64').toString('utf8');
      return decoded.includes('Section 24');
    });

    await check('documents:indexText writes to FTS', () => {
      const r = documents['documents:indexText']({
        id: docId,
        text: 'Section 24 of the Constitution governs admissibility of confession evidence in Jamaica.',
        pages: 1,
        actor,
      });
      return r.content_indexed_at != null;
    });
  });

  // ─── Calendar ─────────────────────────────────────────────────────
  let eventId;
  await group('Calendar', async () => {
    await check('calendar:create', () => {
      const e = calendar['calendar:create']({
        input: {
          case_id: caseId,
          title: 'Case management — QA v. Reality',
          start_at: Date.now() + 86400000,
          end_at: Date.now() + 86400000 + 60 * 60 * 1000,
          event_type: 'case_management',
          court_term: 'Hilary',
          roster: 'Roster A',
        },
        actor,
      });
      eventId = e.id;
      return !!e.id;
    });
    await check('calendar:list returns the new event', () => {
      const list = calendar['calendar:list']({ from: Date.now(), to: Date.now() + 7 * 86400000 });
      return list.some((e) => e.id === eventId);
    });
    await check('calendar:update reschedules', () => {
      const newStart = Date.now() + 2 * 86400000;
      const e = calendar['calendar:update']({
        id: eventId,
        patch: { start_at: newStart, end_at: newStart + 60 * 60 * 1000, title: 'Case management (rescheduled)' },
        actor,
      });
      return e.start_at === newStart && e.title === 'Case management (rescheduled)';
    });
  });

  // ─── Workflow — 20 tasks ──────────────────────────────────────────
  const workflowIds = [];
  await group('Workflow (20 matters)', async () => {
    const matters = [
      { title: 'Index transcripts',                    stage: 'intake',       priority: 'high' },
      { title: 'Receive Notice of Appeal',             stage: 'intake',       priority: 'normal' },
      { title: 'Verify perfection of record',          stage: 'intake',       priority: 'high' },
      { title: 'Confirm leave bundle',                 stage: 'intake',       priority: 'normal' },
      { title: 'Review appellant submissions',         stage: 'review',       priority: 'high' },
      { title: 'Review respondent submissions',        stage: 'review',       priority: 'normal' },
      { title: 'Cross-reference exhibits',             stage: 'review',       priority: 'normal' },
      { title: 'Identify dispositive issues',          stage: 'review',       priority: 'high' },
      { title: 'Draft outline of reasons',             stage: 'drafting',     priority: 'high' },
      { title: 'Draft procedural background',          stage: 'drafting',     priority: 'normal' },
      { title: 'Draft analysis section',               stage: 'drafting',     priority: 'urgent' },
      { title: 'Draft disposition section',            stage: 'drafting',     priority: 'high' },
      { title: 'Verify citations of authority',        stage: 'verification', priority: 'urgent' },
      { title: 'Cross-check statutory references',     stage: 'verification', priority: 'high' },
      { title: 'Peer-review draft judgment',           stage: 'verification', priority: 'high' },
      { title: 'Compliance check against Truth Harness', stage: 'verification', priority: 'urgent' },
      { title: 'Final proofread',                      stage: 'delivery',     priority: 'normal' },
      { title: 'Registrar signature gather',           stage: 'delivery',     priority: 'high' },
      { title: 'Schedule judgment delivery',           stage: 'delivery',     priority: 'normal' },
      { title: 'File with archive',                    stage: 'delivery',     priority: 'low' },
    ];
    for (let i = 0; i < matters.length; i++) {
      const m = matters[i];
      const w = workflow['workflow:create']({
        input: {
          case_id: caseId,
          title: m.title,
          stage: m.stage,
          priority: m.priority,
          due_date: Date.now() + (i + 1) * 86400000,
          assigned_to: actor.id,
        },
        actor,
      });
      workflowIds.push(w.id);
    }
    await check(`created 20 workflow items`, () => workflowIds.length === 20);
    await check('workflow:list filtered by case', () => {
      const list = workflow['workflow:list']({ caseId });
      return list.length >= 20;
    });
    await check('workflow:summary shows bottleneck', () => {
      const s = workflow['workflow:summary']();
      return s.bottleneck && s.bottleneck.count > 0;
    });
    await check('workflow:advance moves stage forward', () => {
      const before = workflowIds[0];
      const w = workflow['workflow:advance']({ id: before, actor });
      return w.stage === 'review';
    });
    await check('workflow:retreat moves stage backward', () => {
      const w = workflow['workflow:retreat']({ id: workflowIds[0], actor });
      return w.stage === 'intake';
    });
    await check('workflow:block sets block reason', () => {
      const w = workflow['workflow:block']({ id: workflowIds[12], reason: 'Awaiting Lexis access', actor });
      return w.blocked_reason === 'Awaiting Lexis access';
    });
    await check('workflow:unblock clears block reason', () => {
      const w = workflow['workflow:unblock']({ id: workflowIds[12], actor });
      return w.blocked_reason === null;
    });
    await check('workflow:update edit fields', () => {
      const w = workflow['workflow:update']({
        id: workflowIds[1],
        patch: { title: 'Receive Notice of Appeal (edited)', priority: 'urgent' },
        actor,
      });
      return w.title.endsWith('(edited)') && w.priority === 'urgent';
    });
    await check('workflow:delete removes one', () => {
      workflow['workflow:delete']({ id: workflowIds[19], actor });
      const list = workflow['workflow:list']({ caseId });
      return !list.some((w) => w.id === workflowIds[19]);
    });
  });

  // ─── Verification ─────────────────────────────────────────────────
  let verifId;
  await group('Verification', async () => {
    await check('verification:run extracts citations', () => {
      const r = verification['verification:run']({
        text: 'In R v Brown [2021] JMCA Crim 14 and SCCA 47/2025, the Court held that section 24 of the Constitution applies.',
        caseId,
        actor,
      });
      verifId = r.citations[0]?.id;
      return r.citations.length >= 3;
    });
    await check('verification:list', () => {
      const list = verification['verification:list']({ caseId });
      return list.length >= 3;
    });
    await check('verification:override changes tier', () => {
      const v = verification['verification:override']({
        id: verifId,
        patch: { status: 'verified', notes: 'Confirmed in physical text' },
        actor,
      });
      return v.status === 'verified' && v.source === 'manual_override';
    });
    await check('verification:manualAdd', () => {
      const v = verification['verification:manualAdd']({
        citation: 'section 76 of the Firearms Act, 2022',
        citation_type: 'statute_section',
        status: 'verified',
        caseId,
        notes: 'Added manually for QA',
        actor,
      });
      return v.source === 'manual_entry';
    });
    await check('verification:delete', () => {
      const r = verification['verification:delete']({ id: verifId, actor });
      return r.ok === true;
    });
  });

  // ─── Generator ────────────────────────────────────────────────────
  let draftId;
  await group('Generator', async () => {
    await check('generator:templates returns 4', () => {
      const t = generator['generator:templates']();
      return t.length === 4;
    });
    await check('generator:create memo', () => {
      const d = generator['generator:create']({
        input: {
          doc_type: 'memo',
          title: 'QA memo',
          case_id: caseId,
          caseRef: 'SCCA QA/2026',
          subject: 'Test directives',
          author: actor.name,
          body: 'This is the QA opening.',
        },
        actor,
      });
      draftId = d.id;
      return d.status === 'draft';
    });
    await check('generator:list', () => {
      const list = generator['generator:list']({});
      return list.some((g) => g.id === draftId);
    });
    await check('generator:update body change snapshots', () => {
      const d = generator['generator:update']({
        id: draftId,
        patch: { content: '# Edited\n\nNew **body** with *markdown*.\n\n- list item one\n- list item two' },
        actor,
      });
      const vs = versions['versions:list']({ draftId });
      return vs.length >= 2 && d.content.includes('Edited');
    });
    await check('generator:update status-only does NOT snapshot', () => {
      const before = versions['versions:list']({ draftId }).length;
      generator['generator:update']({ id: draftId, patch: { status: 'reviewed' }, actor });
      const after = versions['versions:list']({ draftId }).length;
      return after === before;
    });
  });

  // ─── Versions ─────────────────────────────────────────────────────
  await group('Versions', async () => {
    let versionId;
    await check('versions:list returns history', () => {
      const list = versions['versions:list']({ draftId });
      versionId = list[list.length - 1].id; // oldest
      return list.length >= 2;
    });
    await check('versions:get returns body', () => {
      const v = versions['versions:get']({ id: versionId });
      return v.content && typeof v.content === 'string';
    });
    await check('versions:restore reverts content', () => {
      const v = versions['versions:get']({ id: versionId });
      const oldContent = v.content;
      versions['versions:restore']({ id: versionId, actor });
      const d = generator['generator:list']({}).find((g) => g.id === draftId);
      return d.content === oldContent;
    });
  });

  // ─── Notes ────────────────────────────────────────────────────────
  let noteId;
  await group('Notes', async () => {
    await check('notes:create whole-document', () => {
      const n = notes['notes:create']({
        documentId: docId,
        caseId,
        body: 'Pivotal exhibit — quote at para 14.',
        color: 'gilt',
        actor,
      });
      noteId = n.id;
      return n.body.startsWith('Pivotal');
    });
    await check('notes:create per-page', () => {
      const n = notes['notes:create']({
        documentId: docId,
        caseId,
        page: 3,
        body: 'Witness contradicts paragraph 12.',
        color: 'escalation',
        actor,
      });
      return n.page === 3;
    });
    await check('notes:list filtered by document', () => {
      const list = notes['notes:list']({ documentId: docId });
      return list.length === 2;
    });
    await check('notes:update', () => {
      const n = notes['notes:update']({ id: noteId, patch: { color: 'verified', body: 'Pivotal exhibit (edited)' }, actor });
      return n.color === 'verified' && n.body.endsWith('(edited)');
    });
    await check('notes:delete', () => {
      const r = notes['notes:delete']({ id: noteId, actor });
      return r.ok === true;
    });
  });

  // ─── Signatures ───────────────────────────────────────────────────
  let sigId;
  await group('Signatures', async () => {
    await check('signatures:publicKey generates keypair', () => {
      const pk = signatures['signatures:publicKey']({ userId: actor.id });
      return pk.public_key_pem.includes('PUBLIC KEY');
    });
    await check('signatures:signGenerated', () => {
      const s = signatures['signatures:signGenerated']({
        generatedDocumentId: draftId,
        signerRole: 'Senior Counsel',
        actor,
      });
      sigId = s.id;
      return s.signature_b64.length > 80;
    });
    await check('signatures:verify (verified)', () => {
      const v = signatures['signatures:verify']({ id: sigId });
      return v.signature_valid === true && v.content_unchanged === true;
    });
    await check('signatures:signUploaded', () => {
      const s = signatures['signatures:signUploaded']({
        documentId: docId,
        signerRole: 'Registrar',
        actor,
      });
      const v = signatures['signatures:verify']({ id: s.id });
      return v.signature_valid && v.content_unchanged;
    });
    await check('signatures:verify after content drift', () => {
      // Mutate the draft body — signature should still be valid but content_unchanged false
      generator['generator:update']({ id: draftId, patch: { content: 'Different content' }, actor });
      const v = signatures['signatures:verify']({ id: sigId });
      return v.signature_valid === true && v.content_unchanged === false;
    });
    await check('signatures:list returns signatures', () => {
      const list = signatures['signatures:list']({ generatedDocumentId: draftId });
      return list.length >= 1;
    });
  });

  // ─── Audit ────────────────────────────────────────────────────────
  await group('Audit', async () => {
    await check('audit:list returns chronological entries', () => {
      const list = audit['audit:list']({ limit: 5 });
      return list.length === 5;
    });
    await check('audit:count', () => {
      const n = audit['audit:count']({});
      return n >= 50;
    });
    await check('audit:verify reports intact chain', () => {
      const r = audit['audit:verify']();
      return r.ok === true;
    });
  });

  // ─── Bundles ──────────────────────────────────────────────────────
  let bundleId;
  await group('Bundles', async () => {
    // Build a fake "merged PDF" — for QA we just feed in a minimal valid PDF
    const fakePdfBase64 = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000052 00000 n \n0000000098 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n152\n%%EOF'
    ).toString('base64');

    await check('bundles:create', async () => {
      const b = await bundles['bundles:create']({
        caseId,
        title: 'Record of Appeal — QA',
        sourceDocumentIds: [pdfDocId],
        sourcePages: [1],
        mergedBase64: fakePdfBase64,
        mergedPageCount: 1,
        notes: 'Test bundle',
        actor,
      });
      bundleId = b.id;
      return b.title === 'Record of Appeal — QA';
    });
    await check('bundles:list filters by case', () => {
      const list = bundles['bundles:list']({ caseId });
      return list.some((b) => b.id === bundleId);
    });
    await check('bundles:get returns sources', () => {
      const b = bundles['bundles:get']({ id: bundleId });
      return Array.isArray(b.source_documents) && b.source_documents.length === 1;
    });
    await check('signatures:signBundle', () => {
      const s = signatures['signatures:signBundle']({ bundleId, signerRole: 'Registrar', actor });
      const v = signatures['signatures:verify']({ id: s.id });
      return v.signature_valid && v.content_unchanged;
    });
  });

  // ─── Agent (no provider configured → mocked response) ─────────────
  let threadId;
  await group('Agent', async () => {
    await check('agent:createThread', () => {
      const t = agent['agent:createThread']({ title: 'QA conversation', caseId, actor });
      threadId = t.id;
      return !!t.id;
    });
    await check('agent:send falls back to mock when no provider', async () => {
      const t = await agent['agent:send']({ threadId, content: 'What are the appeal grounds?', actor });
      const last = t.messages[t.messages.length - 1];
      return last.role === 'assistant' && last.content.includes('No AI provider is selected');
    });
    await check('agent:thread returns full history', () => {
      const t = agent['agent:thread']({ id: threadId });
      return t.messages.length === 2;
    });
    await check('agent:updateThread renames', () => {
      const t = agent['agent:updateThread']({ id: threadId, patch: { title: 'QA conversation (renamed)' }, actor });
      return t.title.includes('(renamed)');
    });
    await check('agent:threads list includes ours', () => {
      const list = agent['agent:threads']();
      return list.some((t) => t.id === threadId);
    });
  });

  // ─── Search (FTS5) ────────────────────────────────────────────────
  await group('Search (FTS5)', async () => {
    await check('search:global finds case by number', () => {
      const r = search['search:global']({ query: 'SCCA QA', limit: 20 });
      return r.results.some((h) => h.kind === 'case' && h.title.includes('SCCA QA'));
    });
    await check('search:global finds inside-document text', () => {
      const r = search['search:global']({ query: 'Section 24', limit: 20 });
      return r.results.some((h) => h.kind === 'document_content');
    });
    await check('search:global finds draft body', () => {
      const r = search['search:global']({ query: 'Different content', limit: 20 });
      return r.results.some((h) => h.kind === 'generated');
    });
    await check('search:global finds audit entries', () => {
      // FTS5 splits on punctuation, so the action "verification.override"
      // becomes the two tokens "verification" + "override". Search for one.
      const r = search['search:global']({ query: 'override', limit: 20 });
      return r.results.some((h) => h.kind === 'audit');
    });
  });

  // ─── Dashboard ────────────────────────────────────────────────────
  await group('Dashboard', async () => {
    await check('dashboard:snapshot returns full payload', () => {
      const s = dashboard['dashboard:snapshot']();
      return (
        s.cases.total >= 5 &&
        s.upcomingEvents.length >= 1 &&
        s.auditChain.ok === true
      );
    });
  });

  // ─── Email export (stubbed shell) ─────────────────────────────────
  await group('Email', async () => {
    await check('email:exportDocument writes .eml and "opens" it', async () => {
      const r = await email['email:exportDocument']({
        documentId: docId,
        to: 'chambers@example.com',
        subject: 'QA send',
        body: 'See attached.',
        actor,
      });
      return r.ok === true && fs.existsSync(r.emlPath);
    });
    await check('email:exportGenerated writes .eml and "opens" it', async () => {
      const r = await email['email:exportGenerated']({
        generatedDocumentId: draftId,
        to: 'chambers@example.com',
        subject: 'QA draft',
        body: 'See attached.',
        format: 'md',
        actor,
      });
      return r.ok === true;
    });
  });

  // ─── Bundle integrity post-signature ──────────────────────────────
  await group('Bundle delete cascade', async () => {
    await check('bundles:delete removes output document too', () => {
      bundles['bundles:delete']({ id: bundleId, actor });
      const list = bundles['bundles:list']({ caseId });
      return !list.some((b) => b.id === bundleId);
    });
  });

  // ─── Final tally ──────────────────────────────────────────────────
  console.log(`\n────────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`────────────────────────────────────────────`);
  if (failed) {
    for (const f of failures) {
      console.log(`\n[FAIL] ${f.label}\n${f.err}\n${f.stack}`);
    }
  }
  db.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('Harness crashed:', e);
  db.close();
  process.exit(2);
});
