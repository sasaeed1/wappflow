'use client';

// UploadTray — the visible half of lib/uploads.js.
//
// Docked bottom-right above the floating assistants, mounted app-wide so it
// keeps reporting while you navigate. Shows each transfer's percentage, size,
// speed and ETA — the questions you actually have while a 2GB shoot uploads,
// none of which a spinner could answer. Collapses to a one-line summary.

import { useEffect, useState } from 'react';
import { UploadCloud, X, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useUploads, cancel, remove, isActive, fmtBytes, fmtEta } from '@/lib/uploads';

export default function UploadTray() {
  const jobs = useUploads();
  const [open, setOpen] = useState(true);
  const active = jobs.filter(isActive);

  // Losing an upload to an accidental reload is worse than a browser prompt. An
  // in-flight XHR cannot outlive its document, so warning is the honest option.
  useEffect(() => {
    if (active.length === 0) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active.length]);

  if (jobs.length === 0) return null;

  const totalPct = active.length
    ? Math.round(active.reduce((s, j) => s + j.percent, 0) / active.length)
    : 100;

  return (
    <div className="wf-uptray" role="status" aria-live="polite">
      <button className="wf-uptray-head" onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? 'Collapse uploads' : 'Expand uploads'}>
        <UploadCloud size={15} />
        <span className="wf-uptray-title">
          {active.length
            ? `Uploading ${active.length} item${active.length === 1 ? '' : 's'} · ${totalPct}%`
            : 'Uploads'}
        </span>
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>

      {open && (
        <div className="wf-uptray-body">
          {jobs.map((j) => (
            <div key={j.id} className="wf-uprow">
              <div className="wf-uprow-top">
                <span className="wf-uprow-label" title={j.label}>{j.label}</span>
                {j.status === 'done' && <CheckCircle2 size={14} className="wf-up-ok" />}
                {j.status === 'error' && <AlertCircle size={14} className="wf-up-err" />}
                <button className="wf-uprow-x"
                        onClick={() => (isActive(j) ? cancel(j.id) : remove(j.id))}
                        aria-label={isActive(j) ? `Cancel upload of ${j.label}` : `Dismiss ${j.label}`}
                        title={isActive(j) ? 'Cancel' : 'Dismiss'}>
                  <X size={13} />
                </button>
              </div>

              <div className="wf-upbar" aria-hidden="true">
                <div className={`wf-upbar-fill ${j.status}`} style={{ width: `${j.percent}%` }} />
              </div>

              <div className="wf-uprow-meta">
                {j.status === 'error' ? (
                  <span className="wf-up-err">{j.error}</span>
                ) : j.status === 'done' ? (
                  <span>Uploaded · {fmtBytes(j.bytes)}</span>
                ) : (
                  <>
                    <span>{j.percent}% · {fmtBytes(j.loaded)} of {fmtBytes(j.bytes)}</span>
                    <span className="wf-uprow-right">
                      {j.bytesPerSec > 0 ? `${fmtBytes(j.bytesPerSec)}/s` : ''}
                      {j.etaSec != null ? ` · ${fmtEta(j.etaSec)}` : ''}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
          {active.length > 0 && (
            <p className="wf-uptray-note">Keep this tab open — uploads continue while you work elsewhere in the app.</p>
          )}
        </div>
      )}

      <style>{`
        /* Sits above the floating assistants (z 998/9000) but below modals. */
        .wf-uptray {
          position: fixed; right: 16px; bottom: 16px; z-index: 9100;
          width: 320px; max-width: calc(100vw - 32px);
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 12px; box-shadow: var(--elev-3, 0 18px 44px rgba(0,0,0,0.4));
          overflow: hidden; font-size: 13px; color: var(--text);
        }
        .wf-uptray-head {
          display: flex; align-items: center; gap: 8px; width: 100%;
          padding: 10px 12px; background: var(--surface2); border: none;
          border-bottom: 1px solid var(--border); color: var(--text);
          font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
        }
        .wf-uptray-title { flex: 1; text-align: left; }
        .wf-uptray-body { max-height: 46vh; overflow-y: auto; padding: 4px; }
        .wf-uprow { padding: 9px 10px; border-radius: 9px; }
        .wf-uprow + .wf-uprow { border-top: 1px solid var(--border); }
        .wf-uprow-top { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; }
        .wf-uprow-label { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .wf-uprow-x { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 6px;
                      background: transparent; border: none; color: var(--text-muted); cursor: pointer; }
        .wf-uprow-x:hover { background: var(--border); color: var(--text); }
        .wf-upbar { height: 5px; border-radius: 999px; background: var(--surface2); overflow: hidden; }
        .wf-upbar-fill { height: 100%; background: var(--accent); border-radius: 999px; transition: width .25s ease; }
        .wf-upbar-fill.done { background: var(--success-fg, #10b981); }
        .wf-upbar-fill.error { background: var(--danger-fg, #ef4444); }
        .wf-uprow-meta { display: flex; gap: 8px; margin-top: 6px; font-size: 11.5px; color: var(--text-muted); }
        .wf-uprow-right { margin-left: auto; white-space: nowrap; }
        .wf-up-ok { color: var(--success-fg, #10b981); }
        .wf-up-err { color: var(--danger-fg, #ef4444); }
        .wf-uptray-note { margin: 4px 10px 8px; font-size: 11px; color: var(--text-muted); line-height: 1.45; }
        @media (max-width: 640px) { .wf-uptray { left: 8px; right: 8px; width: auto; } }
      `}</style>
    </div>
  );
}
