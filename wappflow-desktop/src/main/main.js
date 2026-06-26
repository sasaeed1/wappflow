'use strict';

// ── WappFlow Desktop — main process ─────────────────────────────────────────
// Owns the window, the app menu, auto-update + deep-link seams, and the secure
// IPC bridge that lets the renderer drive auth and the Local AI Engine.

const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const config = require('./config');
const auth = require('./auth');
const engine = require('./ai/engine');
// Native-shell + offline-first services (Phase 2/6/7/10).
const reporter = require('./reporter');
const sync = require('./offline/sync');
const notifications = require('./notifications');
const tray = require('./tray');
const watcher = require('./watcher');
const uploader = require('./uploader');

let win = null;
let quitting = false;       // true once the user really wants to exit (tray Quit / app.quit)
let serviceTimers = [];

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

  // Close → hide to tray (keep background sync + watch-folder alive) rather than quit,
  // when a tray exists and the user didn't explicitly choose Quit. macOS keeps its own
  // app-lifecycle convention, so only intercept on Windows/Linux.
  win.on('close', (e) => {
    if (!quitting && tray.exists() && process.platform !== 'darwin') { e.preventDefault(); win.hide(); }
  });
}

// ── Native-shell + offline-first services ────────────────────────────────────
function showWindow() { try { if (!win) { createWindow(); } else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } } catch {} }

function pushSyncState() { try { const st = sync.state(); win && win.webContents.send('sync:state', st); tray.refresh(); } catch {} }

function initServices() {
  const version = app.getVersion();

  // Pre-spawn the inference utilityProcess + warm the ONNX sessions OFF the main
  // thread, so the first Local-AI analyze starts instantly without freezing the window.
  try { require('./ai/inference-client').warmup(); } catch {}

  // System tray (background presence + quick actions).
  try {
    tray.build({ onOpen: showWindow, onSync: () => sync.syncNow().then(pushSyncState), getState: () => sync.state() });
  } catch {}

  // Native notification clicks focus the app.
  notifications.setClickHandler(() => showWindow());

  // Offline sync: surface state changes (banner + tray + queued count).
  try { sync.onState((st) => { try { win && win.webContents.send('sync:state', st); tray.refresh(); } catch {} }); } catch {}

  // First pass once signed in: fleet report + policy + initial sync.
  const kick = async () => {
    if (!auth.getSession()) return;
    try { await reporter.report({ version, lastSync: sync.getStore().getCursor() }); } catch {}
    try { const pol = await reporter.checkPolicy(version); if (pol && pol.action && pol.action !== 'ok') win && win.webContents.send('update:policy', pol); } catch {}
    try { await sync.syncNow(); pushSyncState(); } catch {}
  };
  kick();

  // Periodic: sync every 2 min, re-report + policy every 30 min.
  serviceTimers.push(setInterval(() => { if (auth.getSession()) sync.syncNow().then(pushSyncState).catch(() => {}); }, 2 * 60 * 1000));
  serviceTimers.push(setInterval(() => {
    if (!auth.getSession()) return;
    reporter.report({ version, lastSync: sync.getStore().getCursor() }).catch(() => {});
    reporter.checkPolicy(version).then((pol) => { if (pol && pol.action && pol.action !== 'ok') win && win.webContents.send('update:policy', pol); }).catch(() => {});
  }, 30 * 60 * 1000));
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
    initServices();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else showWindow(); });
  });

  app.on('open-url', (e, url) => { e.preventDefault(); handleDeepLink(url); }); // macOS deep link
  app.on('before-quit', () => { quitting = true; try { watcher.stop(); } catch {} try { serviceTimers.forEach(clearInterval); } catch {} });
  // With a tray we keep running in the background (close hides to tray); without one,
  // preserve the original quit-on-last-window behaviour.
  app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray.exists()) app.quit(); });
}

// ── IPC: the only surface the renderer can call (via preload contextBridge) ──
function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    web: auth.getServer().web,
    api: auth.getServer().api,
    env: config.DEV ? 'development' : 'production',
    platform: process.platform,
    founderEmail: config.FOUNDER_EMAIL, // gates the Command Center nav entry (renderer-side)
  }));
  ipcMain.handle('app:setServer', (_e, servers) => auth.setServer(servers));

  ipcMain.handle('auth:status', () => auth.getSession());
  ipcMain.handle('auth:login', (_e, { email, password, api }) => auth.login({ email, password, api }));
  ipcMain.handle('auth:logout', () => auth.logout());

  ipcMain.handle('ai:status', () => engine.status());
  ipcMain.handle('ai:projects', () => engine.listProjects());
  ipcMain.handle('ai:analyze', (_e, opts) => engine.analyzeProject(opts));
  ipcMain.handle('ai:cancel', () => engine.cancel());

  // ── Fleet reporting (Phase 7) ──
  ipcMain.handle('fleet:report', () => reporter.report({ version: app.getVersion(), lastSync: sync.getStore().getCursor() }));
  ipcMain.handle('fleet:policy', () => reporter.checkPolicy(app.getVersion()));

  // ── Offline sync (Phase 6) ──
  ipcMain.handle('sync:now', async () => { const r = await sync.syncNow(); pushSyncState(); return r; });
  ipcMain.handle('sync:state', () => sync.state());
  ipcMain.handle('sync:enqueue', (_e, mutation) => sync.enqueue(mutation));
  // Renderer reports the webview's online/offline transitions (navigator.onLine).
  ipcMain.handle('net:online', (_e, isOnline) => { sync.setOnline(!!isOnline); if (isOnline) sync.syncNow().then(pushSyncState).catch(() => {}); return { ok: true }; });

  // ── Native notifications (Phase 2) ──
  ipcMain.handle('notify:show', (_e, opts) => notifications.notify(opts || {}));

  // ── Watch-folder ingestion (Phase 10) ──
  ipcMain.handle('watch:start', (_e, cfg) => watcher.start(cfg, (ev) => { try { win && win.webContents.send('watch:event', ev); } catch {} }));
  ipcMain.handle('watch:stop', () => watcher.stop());
  ipcMain.handle('watch:status', () => watcher.status());

  // ── Native uploads / drag-drop (Phase 10) ──
  ipcMain.handle('upload:files', async (_e, { projectId, paths }) => uploader.uploadFiles(projectId, paths || [], (p) => { try { win && win.webContents.send('upload:progress', p); } catch {} }));
  ipcMain.handle('dialog:pickFolder', async () => { try { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] }); return r.canceled ? null : r.filePaths[0]; } catch { return null; } });
  ipcMain.handle('dialog:pickFiles', async () => { try { const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] }); return r.canceled ? [] : r.filePaths; } catch { return []; } });
}
