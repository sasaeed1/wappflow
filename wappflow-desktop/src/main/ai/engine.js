'use strict';

// ── Local AI Engine ─────────────────────────────────────────────────────────
// The desktop-first worker. For a chosen project it reads the server's work
// queue (GET .../intelligence → `pending`), pulls each pending asset's bytes,
// runs the local client-tier analyzers, and batch-uploads scores to Track-0.
// Honors analyze-once (skips assets not in `pending` unless force). Advisory-only.

const { EventEmitter } = require('events');
const auth = require('../auth');
const client = require('./scores-client');
const analyzers = require('./analyzers');

const CLIENT_TIER = ['vision', 'video']; // client-tier analyzers the desktop fulfils
const UPLOAD_CHUNK = 50;

class Engine extends EventEmitter {
  constructor() { super(); this.running = false; this._cancel = false; }

  status() {
    return { authed: !!auth.getSession(), running: this.running, runtime: analyzers.runtimeStatus() };
  }

  async listProjects() {
    if (!auth.getSession()) throw new Error('Not signed in');
    return client.listProjects();
  }

  cancel() { this._cancel = true; this.emit('log', 'Cancel requested…'); return { ok: true }; }

  async analyzeProject({ projectId, force = false } = {}) {
    if (!auth.getSession()) return { ok: false, error: 'Not signed in' };
    if (!projectId) return { ok: false, error: 'projectId required' };
    if (this.running) return { ok: false, error: 'A run is already in progress' };
    if (!analyzers.runtimeStatus().cpu) return { ok: false, error: 'Image analysis unavailable — install the jimp dependency.' };

    this.running = true; this._cancel = false;
    const summary = { total: 0, analyzed: 0, uploaded: 0, skipped: 0, errors: 0 };
    try {
      this.emit('log', `Reading work queue for project ${projectId}…`);
      let pending = {};
      try { const intel = await client.getIntelligence(projectId); pending = intel.pending || {}; }
      catch (e) { this.emit('log', `intelligence unavailable (${e.message}); will analyze all photos`); }

      // gather all photo assets (paged)
      const assets = [];
      let offset = 0;
      for (;;) {
        const page = await client.listAssets(projectId, { type: 'photo', limit: 500, offset });
        const batch = page.assets || [];
        assets.push(...batch);
        offset += batch.length;
        if (batch.length === 0 || offset >= (page.total || 0)) break;
      }

      // work list = assets where a client analyzer is pending (or all, if force)
      const work = assets.filter(a => force || (pending[a.id] || []).some(x => CLIENT_TIER.includes(x)));
      summary.total = work.length;
      summary.skipped = assets.length - work.length;
      this.emit('log', `${assets.length} photos · ${work.length} need analysis · ${summary.skipped} already scored`);
      this.emit('progress', { phase: 'analyze', done: 0, total: work.length, uploaded: 0, skipped: summary.skipped });

      let items = [];
      for (let i = 0; i < work.length; i++) {
        if (this._cancel) { this.emit('log', 'Cancelled.'); break; }
        const a = work[i];
        try {
          const buf = await client.downloadAsset(a);
          const res = await analyzers.runAnalyzer('vision', buf, a);
          if (res && res.scores && res.scores.length) {
            items.push({ asset_id: a.id, analyzer_id: res.analyzer_id, model_version: res.model_version, scores: res.scores, source: 'desktop' });
          }
          summary.analyzed++;
        } catch (e) {
          summary.errors++; this.emit('log', `! ${a.filename || a.id}: ${e.message}`);
        }
        this.emit('progress', { phase: 'analyze', done: i + 1, total: work.length, uploaded: summary.uploaded, skipped: summary.skipped, errors: summary.errors, assetId: a.id });

        if (items.length >= UPLOAD_CHUNK) { summary.uploaded += await this._flush(projectId, items); items = []; this.emit('progress', { phase: 'upload', done: i + 1, total: work.length, uploaded: summary.uploaded }); }
      }
      if (items.length && !this._cancel) { summary.uploaded += await this._flush(projectId, items); }

      // ── Video pass (Phase 8) — local video analysis (ffmpeg frame sampling). Fully
      //    guarded: the analyzer returns [] without ffmpeg, so this never blocks/errors.
      if (!this._cancel) {
        try {
          const vids = [];
          let voff = 0;
          for (;;) {
            const page = await client.listAssets(projectId, { type: 'video', limit: 200, offset: voff });
            const batch = page.assets || [];
            vids.push(...batch); voff += batch.length;
            if (batch.length === 0 || voff >= (page.total || 0)) break;
          }
          const vwork = vids.filter(a => force || (pending[a.id] || []).includes('video'));
          if (vwork.length) this.emit('log', `${vwork.length} video clip(s) to analyze…`);
          for (let i = 0; i < vwork.length; i++) {
            if (this._cancel) break;
            const a = vwork[i];
            try {
              const buf = await client.downloadAsset(a);
              const res = await analyzers.runAnalyzer('video', buf, a);
              if (res && res.scores && res.scores.length) {
                summary.uploaded += await this._flush(projectId, [{ asset_id: a.id, analyzer_id: res.analyzer_id, model_version: res.model_version, scores: res.scores, source: 'desktop' }]);
              }
              summary.analyzed++;
            } catch (e) { summary.errors++; this.emit('log', `! ${a.filename || a.id}: ${e.message}`); }
            this.emit('progress', { phase: 'analyze', label: 'video', done: i + 1, total: vwork.length, uploaded: summary.uploaded });
          }
        } catch (e) { this.emit('log', `video pass skipped: ${e.message}`); }
      }

      this.emit('progress', { phase: 'done', done: summary.analyzed, total: work.length, uploaded: summary.uploaded });
      this.emit('log', `Done — analyzed ${summary.analyzed}, uploaded ${summary.uploaded} score-sets${summary.errors ? `, ${summary.errors} errors` : ''}.`);
      return { ok: true, ...summary, cancelled: this._cancel };
    } catch (e) {
      this.emit('log', `Engine error: ${e.message}`);
      return { ok: false, error: e.message, ...summary };
    } finally {
      this.running = false;
    }
  }

  async _flush(projectId, items) {
    try { const r = await client.uploadProjectScores(projectId, items); return (r && r.stored) || 0; }
    catch (e) { this.emit('log', `upload failed (${e.message}) — retrying per-asset`); }
    // retry path: per-asset
    let stored = 0;
    for (const it of items) {
      try { const r = await client.uploadAssetScores(it.asset_id, it); stored += (r && r.stored) || 0; } catch {}
    }
    return stored;
  }
}

module.exports = new Engine();
