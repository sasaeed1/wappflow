'use strict';

// Thin HTTP client for the Media Intelligence (Track-0) endpoints. All JSON calls
// carry the workspace Bearer token; asset bytes are pulled from the public
// /uploads path (no auth, CORS-enabled).
//
// Endpoints (see backend/media-studio.js):
//   GET  /api/media/projects                       → { projects:[...] }
//   GET  /api/media/projects/:id/assets?...        → { total, assets:[shapeAsset] }
//   GET  /api/media/projects/:id/intelligence      → { scores, pending, analyzers }
//   POST /api/media/projects/:id/scores  {items}   → { ok, stored }   (batch)
//   POST /api/media/assets/:id/scores    {...}      → { ok, stored }   (single, retries)

const axios = require('axios');
const auth = require('../auth');

function apiBase() { return auth.getServer().api.replace(/\/$/, ''); }
function fileBase() {
  const s = auth.getServer();
  // host root for /uploads/* (api without the trailing /api)
  return (s.web || s.api.replace(/\/?api\/?$/, '')).replace(/\/$/, '');
}

async function get(path) {
  const res = await axios.get(`${apiBase()}${path}`, { headers: auth.authHeader(), timeout: 30000 });
  return res.data;
}
async function post(path, body) {
  const res = await axios.post(`${apiBase()}${path}`, body, { headers: { ...auth.authHeader(), 'Content-Type': 'application/json' }, timeout: 60000 });
  return res.data;
}

async function listProjects() {
  const d = await get('/media/projects');
  return d.projects || d || [];
}

async function getIntelligence(projectId) {
  return get(`/media/projects/${projectId}/intelligence`); // { scores, pending, analyzers }
}

async function listAssets(projectId, { limit = 500, offset = 0, type = 'photo' } = {}) {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset), type });
  return get(`/media/projects/${projectId}/assets?${q.toString()}`); // { total, assets }
}

// Download an asset's bytes for local analysis. asset.url is a host-relative
// /uploads/... path; prefix it with the file host. No auth header needed.
async function downloadAsset(asset) {
  let url = asset.url || (asset.variants && (asset.variants.web || asset.variants.original)) || (asset.storage_key ? `/uploads/${asset.storage_key}` : null);
  if (!url) throw new Error('asset has no downloadable url');
  if (!/^https?:\/\//.test(url)) url = `${fileBase()}${url}`;
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000 });
  return Buffer.from(res.data);
}

// Batch-upload scores for a whole shoot. items: [{ asset_id, analyzer_id, model_version, scores, source }]
async function uploadProjectScores(projectId, items) {
  return post(`/media/projects/${projectId}/scores`, { items });
}
// Single-asset upload (retry path).
async function uploadAssetScores(assetId, { analyzer_id, model_version, scores, source = 'desktop' }) {
  return post(`/media/assets/${assetId}/scores`, { analyzer_id, model_version, scores, source });
}

module.exports = { listProjects, getIntelligence, listAssets, downloadAsset, uploadProjectScores, uploadAssetScores, apiBase, fileBase };
