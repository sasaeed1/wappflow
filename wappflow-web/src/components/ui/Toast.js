'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Portal } from './overlay';

// Toast — ONE notification engine (PROP-002 Batch C). Replaces the per-page toast
// implementations (top-right z9999, bottom-right z10000, bottom-center z600/700 pills).
// Module-level store + importable `toast` API, so any code — component, lib, event
// handler — can fire one without hooks or context:
//
//   import { toast } from '@/components/ui/Toast';
//   toast.success('Invoice sent');
//   toast.error('Could not delete invoice', { description: err.message });
//   toast.show({ title, description, tone, action: { label, onClick }, duration });
//
// <ToastViewport /> mounts ONCE in app/providers.js: bottom-right, --z-toast (above
// modals on the ladder, but bottom-right so it never covers a modal's header/actions),
// aria-live region, queued (max 4 visible), auto-dismiss with pause-on-hover.

const DEFAULT_DURATION = 4500;
const MAX_VISIBLE = 4;

let items = [];
let seq = 0;
const subs = new Set();
const emit = () => subs.forEach((fn) => fn(items));

function show({ title, description = '', tone = 'info', action = null, duration = DEFAULT_DURATION } = {}) {
  const id = ++seq;
  items = [...items, { id, title: title || '', description, tone, action, duration }];
  emit();
  return id;
}

function dismiss(id) {
  if (!items.some((t) => t.id === id)) return;
  items = items.filter((t) => t.id !== id);
  emit();
}

// Convenience wrappers — thin delegates to show(); NO duplicate logic.
export const toast = {
  show,
  dismiss,
  success: (title, opts = {}) => show({ ...opts, title, tone: 'success' }),
  error:   (title, opts = {}) => show({ ...opts, title, tone: 'danger' }),
  warning: (title, opts = {}) => show({ ...opts, title, tone: 'warning' }),
  info:    (title, opts = {}) => show({ ...opts, title, tone: 'info' }),
};

const TONE = {
  success: { icon: CheckCircle,   bg: 'var(--success-bg)', fg: 'var(--success-fg)' },
  danger:  { icon: XCircle,       bg: 'var(--danger-bg)',  fg: 'var(--danger-fg)' },
  warning: { icon: AlertTriangle, bg: 'var(--warning-bg)', fg: 'var(--warning-fg)' },
  info:    { icon: Info,          bg: 'var(--info-bg)',    fg: 'var(--info-fg)' },
};

export function ToastViewport() {
  const [list, setList] = useState(items);
  useEffect(() => {
    const sub = (next) => setList([...next]);
    subs.add(sub);
    return () => subs.delete(sub);
  }, []);

  const visible = list.slice(0, MAX_VISIBLE); // rest queue; they surface as slots free

  return (
    <Portal>
      <div
        className="wf-toasts"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {visible.map((t) => <ToastItem key={t.id} {...t} />)}

        <style>{`
          .wf-toasts {
            position: fixed; bottom: 20px; right: 20px;
            z-index: var(--z-toast);
            display: flex; flex-direction: column-reverse; gap: 10px;
            max-width: min(380px, calc(100vw - 40px));
            pointer-events: none;
          }
          .wf-toast {
            pointer-events: auto;
            display: flex; align-items: flex-start; gap: 10px;
            padding: 12px 14px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            box-shadow: var(--elev-2);
            color: var(--text);
            animation: wf-toast-in var(--dur-slow) var(--ease-spring);
          }
          @keyframes wf-toast-in {
            from { opacity: 0; transform: translateY(10px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .wf-toast-ic {
            width: 26px; height: 26px; flex-shrink: 0;
            border-radius: var(--radius-sm);
            display: grid; place-items: center;
          }
          .wf-toast-title { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); line-height: 1.4; }
          .wf-toast-desc { margin-top: 2px; font-size: var(--fs-caption); color: var(--text-dim); line-height: 1.45; }
          .wf-toast-action {
            margin-top: 6px;
            background: none; border: none; padding: 0;
            font-family: inherit; font-size: var(--fs-caption); font-weight: var(--fw-semibold);
            color: var(--accent); cursor: pointer;
          }
          .wf-toast-action:hover { text-decoration: underline; }
          .wf-toast-x {
            flex-shrink: 0;
            background: none; border: none; padding: 2px;
            color: var(--text-muted); cursor: pointer;
            border-radius: var(--radius-sm);
            display: grid; place-items: center;
            transition: color var(--dur);
          }
          .wf-toast-x:hover { color: var(--text); }
        `}</style>
      </div>
    </Portal>
  );
}

function ToastItem({ id, title, description, tone, action, duration }) {
  const meta = TONE[tone] || TONE.info;
  const Icon = meta.icon;
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const timer = useRef(null);

  useEffect(() => {
    if (!duration || duration <= 0) return; // duration 0/null = sticky until dismissed
    const arm = () => {
      startedAt.current = Date.now();
      timer.current = setTimeout(() => dismiss(id), remaining.current);
    };
    arm();
    return () => clearTimeout(timer.current);
  }, [id, duration]);

  const pause = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current -= Date.now() - startedAt.current;
  };
  const resume = () => {
    if (timer.current || !duration || duration <= 0) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => dismiss(id), Math.max(remaining.current, 800));
  };

  return (
    <div
      className="wf-toast"
      role={tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <div className="wf-toast-ic" style={{ background: meta.bg, color: meta.fg }}>
        <Icon size={15} aria-hidden="true" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="wf-toast-title">{title}</div>
        {description ? <div className="wf-toast-desc">{description}</div> : null}
        {action ? (
          <button
            type="button"
            className="wf-toast-action"
            onClick={() => { action.onClick?.(); dismiss(id); }}
          >
            {action.label}
          </button>
        ) : null}
      </div>
      <button type="button" className="wf-toast-x" onClick={() => dismiss(id)} aria-label="Dismiss notification">
        <X size={14} />
      </button>
    </div>
  );
}
