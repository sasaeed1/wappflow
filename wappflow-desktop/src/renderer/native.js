'use strict';

// Renderer-side wiring for the native shell: offline banner + network reporting,
// drag-drop ingestion, and upload/sync/watch toasts. Talks only to the preload
// bridge (window.wappflow). No-ops gracefully if loaded outside Electron.

(function () {
  const wf = window.wappflow;
  if (!wf) return;

  const $ = (id) => document.getElementById(id);
  const banner = $('net-banner');
  const overlay = $('drop-overlay');
  const dropSub = $('drop-sub');
  const toastStack = $('toast-stack');

  // ── toasts ──────────────────────────────────────────────────────────────────
  function toast(msg, kind) {
    if (!toastStack) return;
    const el = document.createElement('div');
    el.style.cssText = 'background:#1b1e2a;border:1px solid #262a38;border-left:3px solid ' +
      (kind === 'error' ? '#f87171' : kind === 'ok' ? '#34d399' : '#6366f1') +
      ';color:#f3f4f6;border-radius:10px;padding:10px 14px;font-size:12.5px;max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,.4);';
    el.textContent = msg;
    toastStack.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 4200);
  }

  // ── network state ───────────────────────────────────────────────────────────
  function reportNet() { try { wf.sync && wf.sync.setOnline(navigator.onLine); } catch {} }
  window.addEventListener('online', () => { reportNet(); toast('Back online — syncing…', 'ok'); });
  window.addEventListener('offline', () => { reportNet(); });
  reportNet();

  function renderBanner(st) {
    if (!banner) return;
    if (st && st.online === false) {
      banner.style.display = 'block';
      banner.textContent = `⚠ Offline — working locally${st.queued ? ` · ${st.queued} change${st.queued === 1 ? '' : 's'} queued` : ''}. They'll sync when you reconnect.`;
    } else if (st && st.queued > 0) {
      banner.style.display = 'block';
      banner.style.background = '#1e3a5f'; banner.style.color = '#bfdbfe'; banner.style.borderTop = '1px solid #1d4ed8';
      banner.textContent = `Syncing ${st.queued} queued change${st.queued === 1 ? '' : 's'}…`;
    } else {
      banner.style.display = 'none';
      banner.style.background = '#7c2d12'; banner.style.color = '#fed7aa'; banner.style.borderTop = '1px solid #9a3412';
    }
  }
  try { wf.sync && wf.sync.onState(renderBanner); } catch {}
  try { wf.sync && wf.sync.state().then(renderBanner); } catch {}

  // ── forced-update / blocked-version notice ───────────────────────────────────
  try {
    wf.updates && wf.updates.onPolicy && wf.updates.onPolicy((pol) => {
      if (!pol || !pol.action || pol.action === 'ok') return;
      const blocked = pol.action === 'block';
      const note = document.createElement('div');
      note.style.cssText = 'position:fixed;inset:0;z-index:120;background:rgba(11,12,16,.92);display:flex;align-items:center;justify-content:center;';
      note.innerHTML = `<div style="max-width:420px;background:#14161f;border:1px solid #262a38;border-radius:16px;padding:28px;text-align:center;">
        <div style="font-size:40px;">${blocked ? '⛔' : '⬆️'}</div>
        <h2 style="font-size:18px;margin:10px 0 6px;color:#f3f4f6;">${blocked ? 'This version is no longer supported' : 'Update required'}</h2>
        <p style="font-size:13px;color:#9aa1b2;">${blocked ? 'Please update WappFlow Desktop to keep using it.' : 'A newer version is required to continue.'}${pol.min_version ? ' Minimum: ' + pol.min_version : ''}</p>
      </div>`;
      document.body.appendChild(note);
    });
  } catch {}

  // ── upload + watch toasts ─────────────────────────────────────────────────────
  try { wf.upload && wf.upload.onProgress && wf.upload.onProgress((p) => { if (p.ok) toast(`Uploaded ${p.file} (${p.done}/${p.total})`, 'ok'); else toast(`Failed ${p.file}: ${p.error || ''}`, 'error'); }); } catch {}
  try {
    wf.watch && wf.watch.onEvent && wf.watch.onEvent((ev) => {
      if (ev.type === 'watching') toast(`Watching folder for new media`, 'ok');
      else if (ev.type === 'ingesting') toast(`Importing ${ev.file}…`);
      else if (ev.type === 'ingested') toast(`Imported ${ev.file}`, 'ok');
      else if (ev.type === 'error') toast(`Watch error: ${ev.file} — ${ev.error || ''}`, 'error');
    });
  } catch {}

  // ── drag-drop ingestion ───────────────────────────────────────────────────────
  // Electron renderer File objects expose an absolute .path; we hand those to the
  // main process for a direct (R2-signed) upload into a chosen project.
  let lastProjectId = null;
  function showOverlay(show) { if (overlay) overlay.style.display = show ? 'flex' : 'none'; }
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; showOverlay(true); });
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (dragDepth === 0) showOverlay(false); });
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); dragDepth = 0; showOverlay(false);
    const paths = Array.from(e.dataTransfer.files || []).map((f) => f.path).filter(Boolean);
    if (!paths.length) return;
    let projectId = lastProjectId;
    if (!projectId) {
      try {
        const projs = (await wf.ai.listProjects()) || [];
        const list = Array.isArray(projs) ? projs : (projs.projects || []);
        if (!list.length) { toast('Create a project first, then drop files into it.', 'error'); return; }
        const choice = window.prompt('Upload to which project?\n' + list.map((p, i) => `${i + 1}. ${p.title || p.name || p.id}`).join('\n'), '1');
        const idx = parseInt(choice, 10) - 1;
        if (isNaN(idx) || !list[idx]) return;
        projectId = list[idx].id; lastProjectId = projectId;
      } catch { toast('Could not load projects to upload into.', 'error'); return; }
    }
    toast(`Uploading ${paths.length} file${paths.length === 1 ? '' : 's'}…`);
    try { await wf.upload.files(projectId, paths); } catch (err) { toast('Upload failed: ' + (err && err.message || ''), 'error'); }
  });
})();
