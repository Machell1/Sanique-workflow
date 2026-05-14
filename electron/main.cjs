const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = !!process.env.CLAW_DEV;

let mainWindow = null;
let dbConnection = null;
let ipcRouter = null;

function getIconPath() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(process.resourcesPath || __dirname, 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.png'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 720,
    show: false,
    backgroundColor: '#0A0A0F',
    title: 'CLAW — Commonwealth Legal Automation Workflow',
    icon: getIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    const isLocal = target.origin === 'http://localhost:5173' || target.protocol === 'file:';
    if (!isLocal) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open data folder',
          click: () => {
            if (dbConnection) shell.openPath(dbConnection.getDataDir());
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quit CLAW' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About CLAW',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About CLAW',
              message: 'CLAW — Commonwealth Legal Automation Workflow',
              detail: `Version ${app.getVersion()}\n\nCourt of Appeal, Jamaica\nCopyright (c) 2025`,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle('claw:invoke', async (_evt, { channel, args }) => {
    try {
      const result = await ipcRouter.dispatch(channel, args);
      return { ok: true, data: result };
    } catch (err) {
      console.error(`[IPC] ${channel} failed:`, err);
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('claw:pickFile', async (_evt, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', ...(options.multi ? ['multiSelections'] : [])],
      filters: options.filters || [
        { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'rtf'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled) return { canceled: true };
    return { canceled: false, paths: result.filePaths };
  });

  ipcMain.handle('claw:pickSave', async (_evt, options = {}) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: options.defaultPath,
      filters: options.filters || [{ name: 'All files', extensions: ['*'] }],
    });
    if (result.canceled) return { canceled: true };
    return { canceled: false, path: result.filePath };
  });

  ipcMain.handle('claw:showItem', async (_evt, p) => {
    if (!p) return false;
    shell.showItemInFolder(p);
    return true;
  });

  ipcMain.handle('claw:openItem', async (_evt, p) => {
    if (!p) return false;
    const err = await shell.openPath(p);
    return !err;
  });

  ipcMain.handle('claw:version', () => app.getVersion());
  ipcMain.handle('claw:dataDir', () => dbConnection.getDataDir());
}

app.whenReady().then(() => {
  // Lazy-require so DB initializes after app.getPath() is available
  dbConnection = require('./db/connection.cjs');
  dbConnection.init(app.getPath('userData'));
  ipcRouter = require('./ipc/index.cjs');

  registerIpc();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (dbConnection) dbConnection.close();
    app.quit();
  }
});

// Hardening — block creation of additional renderers
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});
