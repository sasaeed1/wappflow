'use strict';

// Stable per-install device identity + machine facts, for Command Center fleet
// visibility (Phase 7). The id is generated once and persisted in userData so the
// same machine reports consistently across launches/updates.

const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const config = require('./config');

function idFile() { return config.userDataPath('device.json'); }

function deviceId() {
  try {
    const raw = fs.readFileSync(idFile(), 'utf8');
    const j = JSON.parse(raw);
    if (j && j.id) return j.id;
  } catch {}
  const id = 'dev_' + crypto.randomBytes(12).toString('hex');
  try {
    fs.mkdirSync(require('path').dirname(idFile()), { recursive: true });
    fs.writeFileSync(idFile(), JSON.stringify({ id, created_at: new Date().toISOString() }), 'utf8');
  } catch {}
  return id;
}

// Non-identifying machine facts (no serials / MAC) — enough for fleet grouping.
function machineInfo() {
  let hostname = ''; try { hostname = os.hostname(); } catch {}
  return {
    hostname,
    platform: process.platform,
    arch: process.arch,
    os_release: (() => { try { return os.release(); } catch { return ''; } })(),
    cpu_count: (() => { try { return os.cpus().length; } catch { return 0; } })(),
    total_mem_gb: (() => { try { return Math.round(os.totalmem() / (1024 ** 3)); } catch { return 0; } })(),
  };
}

module.exports = { deviceId, machineInfo, idFile };
