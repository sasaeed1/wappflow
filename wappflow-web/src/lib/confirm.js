'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle, X } from 'lucide-react';
import { Portal, useOverlayStack, useEscape, useScrollLock, useFocusTrap } from '@/components/ui/overlay';

/**
 * Global confirm/alert provider.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: 'Delete?', message: 'This cannot be undone.', tone: 'danger' });
 *   if (ok) { ... }
 *
 *   // Alert-style (single button):
 *   await confirm({ title: 'Saved', message: 'Your changes were saved.', tone: 'success', alertOnly: true });
 *
 *   // Typed confirmation (irreversible/bulk destruction — PROP-002 Batch C tier):
 *   const ok = await confirm({
 *     title: 'Empty trash?', message: 'Permanently deletes all 12 leads.',
 *     tone: 'danger', requireTyped: 'DELETE',
 *   });
 *
 * Batch C: the dialog now runs on the shared overlay foundation (components/ui/overlay)
 * — portal, overlay stack (Escape peels the top overlay only), reference-counted scroll
 * lock, and a real focus trap with focus restore. The confirm() API is unchanged.
 */

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmLabel, cancelLabel, tone, alertOnly, requireTyped, resolve }

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setState({
        title: opts.title || 'Confirm',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        tone: opts.tone || 'default', // default | danger | success | warning | info
        alertOnly: !!opts.alertOnly,
        requireTyped: opts.requireTyped || null, // exact phrase the user must type to enable Confirm
        resolve,
      });
    });
  }, []);

  const handleClose = (value) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialog
          {...state}
          onCancel={() => handleClose(false)}
          onConfirm={() => handleClose(true)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Safe fallback for components rendered outside provider (e.g. landing page)
    return (opts) => {
      if (opts?.alertOnly) {
        if (typeof window !== 'undefined') window.alert(opts.message || opts.title || '');
        return Promise.resolve(true);
      }
      if (typeof window === 'undefined') return Promise.resolve(false);
      return Promise.resolve(window.confirm(opts?.message || opts?.title || 'Confirm?'));
    };
  }
  return ctx;
}

function ConfirmDialog({ title, message, confirmLabel, cancelLabel, tone, alertOnly, requireTyped, onConfirm, onCancel }) {
  const [cardEl, setCardEl] = useState(null);
  const [typed, setTyped] = useState('');
  const canConfirm = !requireTyped || typed === requireTyped;

  const isTop = useOverlayStack(true);
  useScrollLock(true);
  useEscape(true, isTop, onCancel);
  useFocusTrap(cardEl, true);

  // Enter confirms — but never a typed confirmation whose phrase doesn't match.
  useEffect(() => {
    if (!isTop) return;
    const onKey = (e) => {
      if (e.key !== 'Enter') return;
      if (!canConfirm) return;
      e.preventDefault();
      onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTop, canConfirm, onConfirm]);

  const icon = {
    danger:  <AlertTriangle size={20} />,
    success: <CheckCircle size={20} />,
    warning: <AlertTriangle size={20} />,
    info:    <Info size={20} />,
    default: <Info size={20} />,
  }[tone];

  return (
    <Portal>
      <div
        className="cm-overlay"
        onMouseDown={(e) => { if (isTop && e.target === e.currentTarget) onCancel(); }}
      >
        <div
          ref={setCardEl}
          className={`cm-card cm-tone-${tone}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cm-title"
          aria-describedby={message ? 'cm-body' : undefined}
        >
          <button className="cm-close" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>

          <div className="cm-head">
            <div className="cm-icon">{icon}</div>
            <div className="cm-title" id="cm-title">{title}</div>
          </div>

          {message && <div className="cm-body" id="cm-body">{message}</div>}

          {requireTyped && (
            <div className="cm-typed">
              <label className="cm-typed-label" htmlFor="cm-typed-input">
                Type <b>{requireTyped}</b> to confirm
              </label>
              <input
                id="cm-typed-input"
                className="cm-typed-input"
                data-autofocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={requireTyped}
              />
            </div>
          )}

          <div className="cm-actions">
            {!alertOnly && (
              <button className="cm-btn cm-btn-ghost" onClick={onCancel}>
                {cancelLabel}
              </button>
            )}
            <button
              className={`cm-btn cm-btn-primary cm-btn-${tone}`}
              onClick={onConfirm}
              disabled={!canConfirm}
              data-autofocus={requireTyped ? undefined : true}
            >
              {alertOnly ? 'OK' : confirmLabel}
            </button>
          </div>
        </div>

        <style>{`
        .cm-overlay {
          position: fixed; inset: 0; z-index: var(--z-modal);
          background: var(--overlay-bg);
          backdrop-filter: blur(var(--overlay-blur));
          -webkit-backdrop-filter: blur(var(--overlay-blur));
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          animation: cm-fade 0.15s ease-out;
        }
        @keyframes cm-fade { from { opacity: 0; } to { opacity: 1; } }

        .cm-card {
          position: relative;
          width: 100%; max-width: 420px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 28px;
          color: var(--text);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          box-shadow: var(--elev-3);
          animation: cm-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes cm-pop {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .cm-close {
          position: absolute; top: 14px; right: 14px;
          background: var(--surface2);
          border: 1px solid var(--border);
          color: var(--text-dim);
          width: 28px; height: 28px;
          border-radius: 8px;
          display: grid; place-items: center;
          cursor: pointer;
          transition: all 0.15s;
        }
        .cm-close:hover { background: var(--border); color: var(--text); }

        .cm-head {
          display: flex; align-items: center; gap: 14px;
          margin-bottom: 12px;
        }
        .cm-icon {
          width: 40px; height: 40px;
          border-radius: 10px;
          display: grid; place-items: center;
          background: var(--accent-bg);
          color: var(--accent-fg);
          border: 1px solid var(--border);
          flex-shrink: 0;
        }
        .cm-tone-danger .cm-icon { background: var(--danger-bg); color: var(--danger-fg); }
        .cm-tone-warning .cm-icon { background: var(--warning-bg); color: var(--warning-fg); }
        .cm-tone-success .cm-icon { background: var(--success-bg); color: var(--success-fg); }
        .cm-tone-info .cm-icon { background: var(--info-bg); color: var(--info-fg); }

        .cm-title {
          font-size: 17px; font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--text);
          flex: 1;
          padding-right: 32px;
        }

        .cm-body {
          font-size: 14px;
          line-height: 1.55;
          color: var(--text-dim);
          margin-bottom: 24px;
        }

        .cm-typed { margin: -8px 0 20px; }
        .cm-typed-label {
          display: block;
          font-size: 12.5px; color: var(--text-dim);
          margin-bottom: 6px;
        }
        .cm-typed-label b { color: var(--danger-fg); font-weight: 700; letter-spacing: 0.02em; }
        .cm-typed-input {
          width: 100%;
          padding: 9px 12px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 9px;
          color: var(--text);
          font-family: inherit; font-size: 13.5px;
        }

        .cm-actions {
          display: flex; justify-content: flex-end;
          gap: 10px;
        }

        .cm-btn {
          padding: 10px 18px;
          border-radius: 9px;
          font-size: 13.5px; font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          border: none;
          transition: all 0.15s;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .cm-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .cm-btn-ghost {
          background: var(--surface2);
          color: var(--text);
          border: 1px solid var(--border);
        }
        .cm-btn-ghost:hover { background: var(--border); color: var(--text); }

        .cm-btn-primary {
          background: linear-gradient(135deg, var(--accent), var(--accent-hover));
          color: var(--on-accent);
          box-shadow: var(--elev-1);
        }
        .cm-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: var(--elev-2); }

        .cm-btn-danger {
          background: var(--danger);
          color: var(--on-accent);
          box-shadow: var(--elev-1);
        }
        .cm-btn-danger:hover:not(:disabled) { box-shadow: var(--elev-2); }

        .cm-btn-success {
          background: var(--success);
          color: var(--on-accent);
          box-shadow: var(--elev-1);
        }

        .cm-btn-warning {
          background: var(--warning);
          color: var(--on-accent);
          box-shadow: var(--elev-1);
        }
        `}</style>
      </div>
    </Portal>
  );
}
