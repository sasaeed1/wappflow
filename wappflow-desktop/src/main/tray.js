'use strict';

// System tray (Phase 2): keeps WappFlow present for background sync + watch-folder
// ingestion, with a live Online/Offline + queued-writes status and quick actions.
// All Electron access is lazy/guarded so this never throws if a tray can't be created.

const path = require('path');
const fs = require('fs');

let tray = null;
let deps = null; // { onOpen, onSync, getState }

function build(options = {}) {
  deps = options;
  try {
    const { Tray, Menu, nativeImage } = require('electron');
    let icon;
    const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'tray.png');
    try { icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty(); }
    catch { icon = nativeImage.createEmpty(); }
    tray = new Tray(icon);
    tray.on('click', () => deps.onOpen && deps.onOpen());
    refresh();
    return tray;
  } catch { tray = null; return null; }
}

function refresh() {
  if (!tray) return;
  try {
    const { Menu } = require('electron');
    const st = (deps && deps.getState && deps.getState()) || {};
    const status = st.online === false ? `Offline · ${st.queued || 0} queued` : 'Online';
    const menu = Menu.buildFromTemplate([
      { label: `WappFlow — ${status}`, enabled: false },
      { type: 'separator' },
      { label: 'Open WappFlow', click: () => deps.onOpen && deps.onOpen() },
      { label: 'Sync now', click: () => deps.onSync && deps.onSync() },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ]);
    tray.setContextMenu(menu);
    tray.setToolTip(`WappFlow — ${status}`);
  } catch {}
}

function destroy() { try { tray && tray.destroy(); } catch {} tray = null; }
const exists = () => !!tray;

module.exports = { build, refresh, destroy, exists };
