'use strict';
// Bridge for the desktop chat-bubble window (PROP-007). Only these calls exist.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bubble', {
  onState: (cb) => ipcRenderer.on('bubble:state', (_e, s) => cb(s)),
  open: (id) => ipcRenderer.send('bubble:open', String(id)),
  close: (id) => ipcRenderer.send('bubble:close', id ? String(id) : null),
  dragStart: () => ipcRenderer.send('bubble:drag-start'),
  dragMove: () => ipcRenderer.send('bubble:drag-move'),
  dragEnd: () => ipcRenderer.send('bubble:drag-end'),
});
