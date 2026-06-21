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
  },
  on: (channel, cb) => {
    const allow = ['nav'];
    if (allow.includes(channel)) ipcRenderer.on(channel, (_e, d) => cb(d));
  },
});
