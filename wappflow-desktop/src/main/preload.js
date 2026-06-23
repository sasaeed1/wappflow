'use strict';

// Secure bridge — the ONLY API the renderer can touch. No Node, no ipcRenderer
// leak; just these typed calls + a couple of main→renderer event subscriptions.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wappflow', {
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    setServer: (servers) => ipcRenderer.invoke('app:setServer', servers),
  },
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    login: (creds) => ipcRenderer.invoke('auth:login', creds),
    logout: () => ipcRenderer.invoke('auth:logout'),
    onChanged: (cb) => ipcRenderer.on('auth:changed', () => cb()),
  },
  ai: {
    status: () => ipcRenderer.invoke('ai:status'),
    listProjects: () => ipcRenderer.invoke('ai:projects'),
    analyze: (opts) => ipcRenderer.invoke('ai:analyze', opts),
    cancel: () => ipcRenderer.invoke('ai:cancel'),
    onProgress: (cb) => ipcRenderer.on('ai:progress', (_e, p) => cb(p)),
    onLog: (cb) => ipcRenderer.on('ai:log', (_e, m) => cb(m)),
  },
  updates: {
    onAvailable: (cb) => ipcRenderer.on('update:available', (_e, i) => cb(i)),
    onDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_e, i) => cb(i)),
    onPolicy: (cb) => ipcRenderer.on('update:policy', (_e, p) => cb(p)),
  },
  // Fleet reporting (Phase 7)
  fleet: {
    report: () => ipcRenderer.invoke('fleet:report'),
    policy: () => ipcRenderer.invoke('fleet:policy'),
  },
  // Offline-first sync (Phase 6)
  sync: {
    now: () => ipcRenderer.invoke('sync:now'),
    state: () => ipcRenderer.invoke('sync:state'),
    enqueue: (mutation) => ipcRenderer.invoke('sync:enqueue', mutation),
    setOnline: (v) => ipcRenderer.invoke('net:online', v),
    onState: (cb) => ipcRenderer.on('sync:state', (_e, s) => cb(s)),
  },
  // Native OS notifications (Phase 2)
  notifications: {
    show: (opts) => ipcRenderer.invoke('notify:show', opts),
  },
  // Watch-folder ingestion (Phase 10)
  watch: {
    start: (cfg) => ipcRenderer.invoke('watch:start', cfg),
    stop: () => ipcRenderer.invoke('watch:stop'),
    status: () => ipcRenderer.invoke('watch:status'),
    onEvent: (cb) => ipcRenderer.on('watch:event', (_e, ev) => cb(ev)),
  },
  // Native uploads / drag-drop (Phase 10)
  upload: {
    files: (projectId, paths) => ipcRenderer.invoke('upload:files', { projectId, paths }),
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
    pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
    onProgress: (cb) => ipcRenderer.on('upload:progress', (_e, p) => cb(p)),
  },
  on: (channel, cb) => {
    const allow = ['nav'];
    if (allow.includes(channel)) ipcRenderer.on(channel, (_e, d) => cb(d));
  },
});
