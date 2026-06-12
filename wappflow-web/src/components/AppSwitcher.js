'use client';

import { useState, useRef, useEffect } from 'react';
import { LayoutGrid, Users, Camera, Zap, ArrowUpRight } from 'lucide-react';

const FLUX_URL = process.env.NEXT_PUBLIC_FLUX_URL || 'http://localhost:3000';

// Google-style app-switcher for WappFlow Core's nav. Studio is a separate module,
// so it opens in a new tab from here (not an in-app nav link).
export default function AppSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const item = (Icon, bg, label, props, current) => (
    <a {...props} onClick={() => setOpen(false)} style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '10px 11px', borderRadius: 9,
      textDecoration: 'none', cursor: 'pointer', background: current ? 'var(--surface2)' : 'transparent',
      color: 'var(--text)', fontSize: 13.5,
    }} onMouseEnter={e => { if (!current) e.currentTarget.style.background = 'var(--surface2)'; }}
       onMouseLeave={e => { if (!current) e.currentTarget.style.background = 'transparent'; }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={15} /></span>
      <span style={{ flex: 1, fontWeight: current ? 700 : 500 }}>{label}</span>
      {!current && <ArrowUpRight size={14} style={{ opacity: 0.4 }} />}
    </a>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} title="Apps" aria-label="Switch app" style={{
        width: 36, height: 36, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--text-muted)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .12s',
      }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
         onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
        <LayoutGrid size={18} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 248, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', padding: 8, zIndex: 300 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '6px 10px 8px' }}>Switch app</div>
          {item(Users, 'linear-gradient(135deg,#6366f1,#4f46e5)', 'WappFlow CRM', { href: '/dashboard' }, true)}
          {item(Camera, 'linear-gradient(135deg,#0e0e11,#3a3a44)', 'Media Studio', { href: '/studio', target: '_blank', rel: 'noreferrer' }, false)}
          {item(Zap, 'linear-gradient(135deg,#A78BFA,#22D3EE,#EC4899)', 'Flux', { href: FLUX_URL, target: '_blank', rel: 'noreferrer' }, false)}
        </div>
      )}
    </div>
  );
}
