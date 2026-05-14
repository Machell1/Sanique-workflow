const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Keep a global reference of the window object to prevent garbage collection ───
let mainWindow;

// ─── Determine if running in development ───
const isDev = !app.isPackaged;

// ─── Create the main application window ───
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    show: false, // Show after ready-to-render to prevent flash
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: undefined, // No preload script needed for static app
    },
    title: 'CLAW - Commonwealth Legal Automation Workflow',
    backgroundColor: '#0A0A0F', // Match obsidian background
    icon: getIconPath(),
    // Frameless on Windows for custom title bar look
    titleBarStyle: 'default',
    center: true,
  });

  // ─── Load the app ───
  if (isDev) {
    // In dev, load from Vite dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built dist/index.html
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  // ─── Show window when ready ───
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // ─── Handle external links ───
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external URLs in system browser, not in Electron
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ─── Handle OneNote protocol links ───
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('onenote:')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // ─── Clean up on close ───
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Get icon path ───
function getIconPath() {
  const iconDir = path.join(__dirname, '..', 'dist');
  // Try different icon formats
  const iconPng = path.join(iconDir, 'icon.png');
  const iconIco = path.join(iconDir, 'icon.ico');
  
  if (fs.existsSync(iconIco)) return iconIco;
  if (fs.existsSync(iconPng)) return iconPng;
  return undefined;
}

// ─── App event handlers ───

// App ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ─── Security: Prevent new window creation ───
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});
