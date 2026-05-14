// Minimal Electron API stub for the QA harness. The IPC handlers only
// touch `shell` (and only in email.cjs) when invoked outside the main
// process, so this is the surface we need to fake.
module.exports = {
  shell: {
    openPath: async () => '',
    openExternal: async () => {},
    showItemInFolder: () => {},
  },
  app: {
    getPath: () => '',
    getVersion: () => '2.6.0-qa',
  },
};
