'use strict';

// Native OS notifications (Phase 2): mentions, calls, sync/ingest events surface as
// real desktop toasts. Lazy-loads Electron so the module can be required in tests.

let Notification = null;
try { ({ Notification } = require('electron')); } catch { /* not under Electron */ }

let onClick = () => {};
function setClickHandler(fn) { onClick = fn || (() => {}); }

function supported() { try { return !!(Notification && Notification.isSupported && Notification.isSupported()); } catch { return false; } }

function notify({ title, body, silent, data } = {}) {
  try {
    if (!supported()) return false;
    const n = new Notification({ title: title || 'WappFlow', body: body || '', silent: !!silent });
    n.on('click', () => { try { onClick(data || {}); } catch {} });
    n.show();
    return true;
  } catch { return false; }
}

module.exports = { notify, supported, setClickHandler };
