'use client';
// Shared building blocks for Command Center pages (PROP-005). One dialog, one set
// of tabs, one sparkline, one button style — so no page hand-rolls its own.
import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

// ── FormDialog: a Modal with labelled fields. Resolves via onSubmit(values). ──
//   fields: [{ name, label, type: 'text'|'number'|'textarea'|'select'|'date'|'password'|'email',
//              options: [[value,label]], placeholder, hint, required, min, max, step }]
export function FormDialog({ open, title, description, fields = [], initial = {}, submitLabel = 'Save', tone = 'primary', onClose, onSubmit }) {
  const [vals, setVals] = useState(initial);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setVals(initial); setErr(''); setBusy(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const set = (k, v) => setVals((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e?.preventDefault();
    for (const f of fields) if (f.required && (vals[f.name] === undefined || vals[f.name] === '')) { setErr(`${f.label} is required`); return; }
    setBusy(true); setErr('');
    try { await onSubmit(vals); }
    catch (e2) { setErr(e2?.response?.data?.need_step_up ? 'Confirmation cancelled.' : (e2?.response?.data?.error || e2?.message || 'Something went wrong')); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={title} description={description} size="sm"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={submit}>{submitLabel}</Button></>}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        {fields.map((f) => {
          const id = `fd-${f.name}`;
          const common = { id, value: vals[f.name] ?? '', onChange: (e) => set(f.name, e.target.value), style: fieldInp, placeholder: f.placeholder };
          return (
            <div key={f.name} style={{ display: 'grid', gap: 5 }}>
              <label htmlFor={id} style={fieldLbl}>{f.label}</label>
              {f.type === 'textarea' ? <textarea rows={f.rows || 3} {...common} />
                : f.type === 'select' ? <select {...common}>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                : <input type={f.type || 'text'} min={f.min} max={f.max} step={f.step} inputMode={f.type === 'number' ? 'decimal' : undefined} {...common} />}
              {f.hint && <span style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>{f.hint}</span>}
            </div>
          );
        })}
        {err && <div role="alert" style={{ color: '#f87171', fontSize: 13 }}>{err}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border,#1e1e26)', overflowX: 'auto', scrollbarWidth: 'none' }}>
      {tabs.map(([k, label, badge]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          style={{ flexShrink: 0, padding: '10px 14px', background: 'none', border: 'none', borderBottom: `2px solid ${value === k ? 'var(--accent,#818cf8)' : 'transparent'}`,
            color: value === k ? 'var(--text,#e8e8ea)' : 'var(--text-dim,#777)', fontWeight: value === k ? 700 : 500, fontSize: 13.5, cursor: 'pointer' }}>
          {label}{badge ? <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 7px', borderRadius: 999, background: 'var(--surface2,#1c1c26)' }}>{badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ── Sparkline: a small area chart, theme-safe, no library ─────────────────────
export function Sparkline({ values = [], width = 220, height = 44, color = '#818cf8', label }) {
  const pts = values.map((v) => Number(v) || 0);
  if (pts.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', fontSize: 11.5, color: 'var(--text-dim,#666)' }}>Not enough history yet</div>;
  const max = Math.max(...pts, 1);
  const step = width / (pts.length - 1);
  const xy = pts.map((v, i) => [i * step, height - 3 - (v / max) * (height - 8)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label || 'trend'} style={{ display: 'block', maxWidth: '100%' }}>
      <path d={area} fill={color} fillOpacity="0.14" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.6" fill={color} />
    </svg>
  );
}

// ── Buttons (Command Center tone) ─────────────────────────────────────────────
export function Btn({ color = '#818cf8', subtle = false, children, ...rest }) {
  return (
    <button {...rest} style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${color}55`, background: subtle ? 'transparent' : `${color}1a`,
      color, fontWeight: 600, fontSize: 13, cursor: rest.disabled ? 'default' : 'pointer', opacity: rest.disabled ? 0.55 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, ...(rest.style || {}) }}>
      {children}
    </button>
  );
}

export const Muted = ({ children, style }) => <div style={{ fontSize: 13, color: 'var(--text-dim,#666)', ...style }}>{children}</div>;
export const H3 = ({ children, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
    <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--text-muted,#9a9aa5)' }}>{children}</h3>{right}
  </div>
);
export const Row = ({ children, style }) => <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border,#1e1e26)', fontSize: 13, ...style }}>{children}</div>;

export const fieldLbl = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted,#9a9aa5)' };
export const fieldInp = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--bg,#0a0a0f)', color: 'var(--text,#e8e8ea)', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
export const selectStyle = { padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text,#e8e8ea)', fontSize: 13 };
