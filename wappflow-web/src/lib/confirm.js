'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle, X } from 'lucide-react';

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
 */

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmLabel, cancelLabel, tone, alertOnly, resolve }

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setState({
        title: opts.title || 'Confirm',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        tone: opts.tone || 'default', // default | danger | success | warning | info
        alertOnly: !!opts.alertOnly,
        resolve,
      });
    });
  }, []);

  const handleClose = (value) => {
    state?.resolve(value);
    setState(null);
  };

  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose(false);
      if (e.key === 'Enter') handleClose(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

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

function ConfirmDialog({ title, message, confirmLabel, cancelLabel, tone, alertOnly, onConfirm, onCancel }) {
  const icon = {
    danger:  <AlertTriangle size={20} />,
    success: <CheckCircle size={20} />,
    warning: <AlertTriangle size={20} />,
    info:    <Info size={20} />,
    default: <Info size={20} />,
  }[tone];

  return (
    <div className="cm-overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className={`cm-card cm-tone-${tone}`} onClick={(e) => e.stopPropagation()}>
        <button className="cm-close" onClick={onCancel} aria-label="Close">
          <X size={16} />
        </button>

        <div className="cm-head">
          <div className="cm-icon">{icon}</div>
          <div className="cm-title">{title}</div>
        </div>

        {message && <div className="cm-body">{message}</div>}

        <div className="cm-actions">
          {!alertOnly && (
            <button className="cm-btn cm-btn-ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            className={`cm-btn cm-btn-primary cm-btn-${tone}`}
            onClick={onConfirm}
            autoFocus
          >
            {alertOnly ? 'OK' : confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        .cm-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          animation: cm-fade 0.15s ease-out;
        }
        @keyframes cm-fade { from { opacity: 0; } to { opacity: 1; } }

        .cm-card {
          position: relative;
          width: 100%; max-width: 420px;
          background: #14161f;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 16px;
          padding: 28px;
          color: #f3f4f6;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          box-shadow: 0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
          animation: cm-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes cm-pop {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .cm-close {
          position: absolute; top: 14px; right: 14px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          color: #9ca3af;
          width: 28px; height: 28px;
          border-radius: 8px;
          display: grid; place-items: center;
          cursor: pointer;
          transition: all 0.15s;
        }
        .cm-close:hover { background: rgba(255,255,255,0.1); color: #f3f4f6; }

        .cm-head {
          display: flex; align-items: center; gap: 14px;
          margin-bottom: 12px;
        }
        .cm-icon {
          width: 40px; height: 40px;
          border-radius: 10px;
          display: grid; place-items: center;
          background: rgba(99,102,241,0.12);
          color: #818cf8;
          border: 1px solid rgba(99,102,241,0.25);
          flex-shrink: 0;
        }
        .cm-tone-danger .cm-icon { background: rgba(239,68,68,0.12); color: #f87171; border-color: rgba(239,68,68,0.3); }
        .cm-tone-warning .cm-icon { background: rgba(245,158,11,0.12); color: #fbbf24; border-color: rgba(245,158,11,0.3); }
        .cm-tone-success .cm-icon { background: rgba(16,185,129,0.12); color: #34d399; border-color: rgba(16,185,129,0.3); }
        .cm-tone-info .cm-icon { background: rgba(6,182,212,0.12); color: #22d3ee; border-color: rgba(6,182,212,0.3); }

        .cm-title {
          font-size: 17px; font-weight: 700;
          letter-spacing: -0.01em;
          color: #fff;
          flex: 1;
          padding-right: 32px;
        }

        .cm-body {
          font-size: 14px;
          line-height: 1.55;
          color: #b5bac9;
          margin-bottom: 24px;
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
        .cm-btn-ghost {
          background: rgba(255,255,255,0.05);
          color: #d1d5db;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .cm-btn-ghost:hover { background: rgba(255,255,255,0.08); color: #fff; }

        .cm-btn-primary {
          background: linear-gradient(135deg, #6366f1, #a855f7);
          color: #fff;
          box-shadow: 0 6px 16px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.18);
        }
        .cm-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(99,102,241,0.55); }

        .cm-btn-danger {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          box-shadow: 0 6px 16px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.18);
        }
        .cm-btn-danger:hover { box-shadow: 0 10px 24px rgba(239,68,68,0.55); }

        .cm-btn-success {
          background: linear-gradient(135deg, #10b981, #059669);
          box-shadow: 0 6px 16px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.18);
        }

        .cm-btn-warning {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          box-shadow: 0 6px 16px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.18);
        }
      `}</style>
    </div>
  );
}
