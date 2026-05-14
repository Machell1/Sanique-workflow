const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claw', {
  api: {
    invoke: (channel, args) => ipcRenderer.invoke('claw:invoke', { channel, args }),
  },
  files: {
    pick: (options) => ipcRenderer.invoke('claw:pickFile', options),
    pickSave: (options) => ipcRenderer.invoke('claw:pickSave', options),
    showItem: (path) => ipcRenderer.invoke('claw:showItem', path),
    openItem: (path) => ipcRenderer.invoke('claw:openItem', path),
  },
  app: {
    version: () => ipcRenderer.invoke('claw:version'),
    dataDir: () => ipcRenderer.invoke('claw:dataDir'),
  },
});
