'use strict';

// Fleet reporting (Phase 7): self-register with Command Center on launch + on a timer,
// and obey the version policy (force-update / block). Matches the server contract in
// backend/cc-desktop.js: POST /api/desktop/report { device_id, version, platform,
// last_sync } and GET /api/desktop/update-policy?version → { action, latest/min_version }.

const axios = require('axios');
const auth = require('./auth');
const device = require('./device');

const apiBase = () => auth.getServer().api.replace(/\/$/, '');

function cmpVer(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}

function buildReport({ version, lastSync }) {
  const m = device.machineInfo();
  return { device_id: device.deviceId(), version: version || null, platform: m.platform, last_sync: lastSync || null, machine: m };
}

// Local fallback interpretation (the server already returns {action}, but this keeps
// the policy logic testable and gives a sane default if the server omits it).
function interpretPolicy(policy, version) {
  if (!policy) return { action: 'ok' };
  if (policy.action) return policy;
  const blocked = Array.isArray(policy.blocked_versions) ? policy.blocked_versions : [];
  if (version && blocked.includes(version)) return { action: 'block' };
  if (policy.min_version && version && cmpVer(version, policy.min_version) < 0) return { action: 'update', min_version: policy.min_version };
  return { action: 'ok', latest_version: policy.latest_version || null };
}

async function report({ version, lastSync } = {}) {
  if (!auth.getSession()) return { skipped: 'no-auth' };
  try { await axios.post(`${apiBase()}/desktop/report`, buildReport({ version, lastSync }), { headers: auth.authHeader(), timeout: 20000 }); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function checkPolicy(version) {
  if (!auth.getSession()) return { action: 'ok', skipped: 'no-auth' };
  try {
    const res = await axios.get(`${apiBase()}/desktop/update-policy`, { params: { version }, headers: auth.authHeader(), timeout: 20000 });
    return interpretPolicy(res.data, version);
  } catch (e) { return { action: 'ok', error: e.message }; }
}

module.exports = { report, checkPolicy, buildReport, interpretPolicy, cmpVer };
