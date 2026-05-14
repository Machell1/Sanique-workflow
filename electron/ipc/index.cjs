const cases = require('./cases.cjs');
const documents = require('./documents.cjs');
const workflow = require('./workflow.cjs');
const calendar = require('./calendar.cjs');
const audit = require('./audit.cjs');
const settings = require('./settings.cjs');
const verification = require('./verification.cjs');
const generator = require('./generator.cjs');
const agent = require('./agent.cjs');
const dashboard = require('./dashboard.cjs');
const search = require('./search.cjs');
const bundles = require('./bundles.cjs');
const notes = require('./notes.cjs');
const versions = require('./versions.cjs');
const signatures = require('./signatures.cjs');
const email = require('./email.cjs');

// versions module exports `snapshot` as an internal helper; strip it so it
// is not exposed as an IPC channel.
const { snapshot: _snapshot, ...versionsHandlers } = versions;

const handlers = {
  ...cases,
  ...documents,
  ...workflow,
  ...calendar,
  ...audit,
  ...settings,
  ...verification,
  ...generator,
  ...agent,
  ...dashboard,
  ...search,
  ...bundles,
  ...notes,
  ...versionsHandlers,
  ...signatures,
  ...email,
};

async function dispatch(channel, args) {
  const handler = handlers[channel];
  if (!handler) throw new Error(`Unknown IPC channel: ${channel}`);
  return await handler(args);
}

module.exports = { dispatch, channels: Object.keys(handlers) };
