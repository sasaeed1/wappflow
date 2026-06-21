'use strict';

// Central app config. The desktop is workspace-scoped and points at a WappFlow
// server (cloud). CRM/Contracts/Booking/Portal are loaded from the WEB app URL;
// the Local AI Engine talks to the API URL. Both are overridable per install.

const path = require('path');
// Lazy so the pure engine/analyzer modules can load (and be tested) outside the
// Electron runtime; falls back to a cwd-local dir when app isn't available.
let _app = null;
try { _app = require('electron').app; } catch { /* not running under Electron */ }

const DEV = process.env.WAPPFLOW_ENV === 'development';

// Defaults point at the deployed product; override via env or the in-app server picker.
const DEFAULT_WEB_URL = process.env.WAPPFLOW_WEB_URL || (DEV ? 'http://localhost:3000' : 'https://wappflow.remoteops.co');
const DEFAULT_API_URL = process.env.WAPPFLOW_API_URL || (DEV ? 'http://localhost:3001/api' : 'https://wappflow.remoteops.co/api');

// Command Center is platform-admin-only. The desktop reveals its nav entry only to
// the founder (matched by login email); Command Center still enforces its own
// cc_admins login + IP allowlist server-side. Unset = hidden (safe for customer builds).
const FOUNDER_EMAIL = (process.env.WAPPFLOW_FOUNDER_EMAIL || '').toLowerCase();

function userDataPath(...p) {
  // _app may be null when required outside the Electron runtime — guard it.
  try { return path.join(_app.getPath('userData'), ...p); } catch { return path.join(process.cwd(), '.wappflow', ...p); }
}

module.exports = {
  DEV,
  DEFAULT_WEB_URL,
  DEFAULT_API_URL,
  FOUNDER_EMAIL,
  // where the local AI engine caches downloaded assets + the analyze-once ledger mirror
  cacheDir: () => userDataPath('ai-cache'),
  modelsDir: () => path.join(__dirname, 'ai', 'models'),
  sessionFile: () => userDataPath('session.json'),
  configFile: () => userDataPath('config.json'),
  userDataPath,
};
