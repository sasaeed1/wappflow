'use strict';

// Native Local-AI panel. Talks to the main-process engine ONLY through the
// preload bridge (window.wappflow.ai). No Node, no inference here.

(function () {
  const W = window.wappflow;
  const $ = (id) => document.getElementById(id);
  let loaded = false, running = false;

  function setProgress(p) {
    if (!p) return;
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    $('bar').style.width = pct + '%';
    $('st-total').textContent = p.total ?? 0;
    $('st-done').textContent = p.done ?? 0;
    if (p.uploaded != null) $('st-uploaded').textContent = p.uploaded;
    if (p.skipped != null) $('st-skipped').textContent = p.skipped;
    $('phase').textContent = p.phase === 'done' ? '✓ Complete'
      : p.phase === 'upload' ? 'Uploading scores…'
      : p.phase === 'analyze' ? `Analyzing ${p.done}/${p.total}…` : '';
  }

  function log(m) {
    const el = $('log');
    el.textContent += (el.textContent ? '\n' : '') + m;
    el.scrollTop = el.scrollHeight;
  }

  async function refreshRuntime() {
    try {
      const s = await W.ai.status();
      const cpu = s.runtime && s.runtime.cpu;
      const onnx = s.runtime && s.runtime.onnx && s.runtime.onnx.available;
      const pill = $('ai-runtime');
      pill.textContent = cpu ? (onnx ? 'CPU + ONNX ready' : 'CPU ready · ONNX models not installed') : 'image analysis unavailable';
      pill.className = 'pill ' + (cpu ? 'ok' : 'warn');
    } catch {}
  }

  async function loadProjects() {
    const sel = $('project');
    try {
      const projects = await W.ai.listProjects();
      if (!projects || !projects.length) { sel.innerHTML = '<option value="">No projects found</option>'; return; }
      sel.innerHTML = projects.map(p =>
        `<option value="${p.id}">${(p.title || p.name || 'Untitled')}${p.asset_count != null ? ` · ${p.asset_count} assets` : ''}</option>`
      ).join('');
      $('analyze').disabled = false;
    } catch (e) {
      sel.innerHTML = `<option value="">${e.message || 'Failed to load projects'}</option>`;
    }
  }

  function wire() {
    $('analyze').onclick = async () => {
      const projectId = $('project').value;
      if (!projectId) return;
      running = true;
      $('analyze').disabled = true; $('cancel').style.display = '';
      $('log').textContent = ''; setProgress({ done: 0, total: 0, uploaded: 0, skipped: 0 });
      try {
        const res = await W.ai.analyze({ projectId });
        if (res && res.ok) log(`Finished: ${res.analyzed} analyzed · ${res.uploaded} uploaded · ${res.skipped} skipped${res.errors ? ` · ${res.errors} errors` : ''}${res.cancelled ? ' (cancelled)' : ''}.`);
        else log('Error: ' + ((res && res.error) || 'unknown'));
      } catch (e) { log('Error: ' + (e.message || e)); }
      finally { running = false; $('analyze').disabled = false; $('cancel').style.display = 'none'; }
    };
    $('cancel').onclick = () => W.ai.cancel();
    W.ai.onProgress(setProgress);
    W.ai.onLog(log);
  }

  // Called by shell.js when the Local AI view is opened.
  window.LocalAI = {
    activate() {
      if (loaded) { refreshRuntime(); return; }
      loaded = true;
      wire(); refreshRuntime(); loadProjects();
    },
  };
})();
