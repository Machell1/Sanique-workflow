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
};

async function dispatch(channel, args) {
  const handler = handlers[channel];
  if (!handler) throw new Error(`Unknown IPC channel: ${channel}`);
  return await handler(args);
}

module.exports = { dispatch, channels: Object.keys(handlers) };
