'use client';
import { useState, useRef, useEffect } from 'react';
import { Download } from 'lucide-react';
import { BASE_URL } from '@/lib/ccApi';

// Reusable export control (§23). Hits the server export endpoint with the current
// filters so the download reflects the FULL filtered dataset, not just the visible page.
// Auth rides on ?token= (platformAuth accepts it) so a plain link download works.
export default function ExportButton({ dataset, params = {} }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (format) => {
    const token = (typeof window !== 'undefined' && localStorage.getItem('cc_token')) || '';
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''));
    const qs = new URLSearchParams({ dataset, format, token, ...clean }).toString();
    window.open(`${BASE_URL}/api/cc/export?${qs}`, '_blank');
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text-muted,#9a9aa5)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        <Download size={14} /> Export
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 40, background: 'var(--surface,#14141b)', border: '1px solid var(--border,#1e1e26)', borderRadius: 10, padding: 5, zIndex: 50, minWidth: 120, boxShadow: '0 12px 30px rgba(0,0,0,.5)' }}>
          {['csv', 'json'].map((f) => (
            <button key={f} onClick={() => go(f)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, background: 'none', border: 'none', color: 'var(--text,#e8e8ea)', fontSize: 13, cursor: 'pointer' }}>
              Export {f.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
