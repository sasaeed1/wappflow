'use strict';

// ── WappFlow Desktop — main process ─────────────────────────────────────────
// Owns the window, the app menu, auto-update + deep-link seams, and the secure
// IPC bridge that lets the renderer drive auth and the Local AI Engine.

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const config = require('./config');
const auth = require('./auth');
const engine = require('./ai/engine');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0b0c10',
    title: 'WappFlow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs Node to bridge to the main-process engine
      webviewTag: true, // cloud modules (CRM/Contracts/Booking/Portal) load in a <webview>
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  if (config.DEV) win.webContents.openDevTools({ mode: 'detach' });

  // External links open in the user's browser, not inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });

  // Forward engine progress to the renderer's Local AI view.
  engine.on('progress', (p) => { try { win && win.webContents.send('ai:progress', p); } catch {} });
  engine.on('log', (m) => { try { win && win.webContents.send('ai:log', m); } catch {} });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(config.DEV ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'WappFlow Home', click: () => shell.openExternal(config.DEFAULT_WEB_URL) },
        { label: 'About', click: () => win && win.webContents.send('nav', { view: 'about' }) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Auto-update seam (Command Center will govern version/force-update/rollouts) ──
function initAutoUpdate() {
  if (config.DEV) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false; // Command Center decides; default to prompt
    autoUpdater.on('update-available', (i) => win && win.webContents.send('update:available', i));
    autoUpdater.on('update-downloaded', (i) => win && win.webContents.send('update:downloaded', i));
    autoUpdater.checkForUpdates().catch(() => {});
  } catch { /* updater optional in dev / unsigned builds */ }
}

// ── Deep-link auth callback seam (wappflow://auth?token=...) ─────────────────
function handleDeepLink(url) {
  if (!url || !url.startsWith('wappflow://')) return;
  try {
    const u = new URL(url);
    if (u.host === 'auth') {
      const token = u.searchParams.get('token');
      if (token) auth.adoptToken(token).then(() => win && win.webContents.send('auth:changed'));
    }
  } catch {}
}

// ── Single-instance + lifecycle ─────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const link = argv.find(a => a.startsWith('wappflow://'));
    if (link) handleDeepLink(link);
  });

  app.whenReady().then(() => {
    try { app.setAsDefaultProtocolClient('wappflow'); } catch {}
    registerIpc();
    buildMenu();
    createWindow();
    initAutoUpdate();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('open-url', (e, url) => { e.preventDefault(); handleDeepLink(url); }); // macOS deep link
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

// ── IPC: the only surface the renderer can call (via preload contextBridge) ──
function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    web: auth.getServer().web,
    api: auth.getServer().api,
    env: config.DEV ? 'development' : 'production',
    platform: process.platform,
  }));
  ipcMain.handle('app:setServer', (_e, servers) => auth.setServer(servers));

  ipcMain.handle('auth:status', () => auth.getSession());
  ipcMain.handle('auth:login', (_e, { email, password, api }) => auth.login({ email, password, api }));
  ipcMain.handle('auth:logout', () => auth.logout());

  ipcMain.handle('ai:status', () => engine.status());
  ipcMain.handle('ai:projects', () => engine.listProjects());
  ipcMain.handle('ai:analyze', (_e, opts) => engine.analyzeProject(opts));
  ipcMain.handle('ai:cancel', () => engine.cancel());
}
