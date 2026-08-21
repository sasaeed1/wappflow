'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft, ArrowRight } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { MODULES } from './modules';
import { searchAPI } from '@/lib/api';

// CommandPalette — Ctrl/Cmd+K, one box for everything (Phase 5).
//
// The audit's platform-13: a Ctrl+K listener already existed, but it opened the AI
// Command Center — an LLM intent classifier that could return leads, reminders or
// stats, and nothing else. Clients, contracts, invoices, bookings and shoots were
// unreachable from any global surface, and the binding only existed on CRM routes
// because it lived in a CRM fab. This owns the shortcut now (see AICommandCenter,
// which keeps its button), and it is mounted by the shell, so Studio and Contracts
// get it too.
//
// Two kinds of result, deliberately in one list: NAVIGATION (every destination the
// module registry already knows about — no second list of routes to drift) and
// RECORDS from GET /api/search. Navigation answers instantly from memory, so the
// palette is useful before a single request comes back.

const TYPE_LABEL = {
  lead: 'Lead', client: 'Client', contract: 'Contract', invoice: 'Invoice',
  booking: 'Booking', project: 'Shoot', message: 'Message', member: 'Team',
};

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const reqId = useRef(0);

  // Every destination the registry knows, flattened once.
  const destinations = useRef(
    Object.values(MODULES).flatMap((m) => [
      { type: 'nav', label: m.label, sub: 'Open module', url: m.home },
      ...(m.nav || []).map((i) => ({ type: 'nav', label: i.label, sub: m.label, url: i.href })),
      ...(m.menu || []).map((i) => ({ type: 'nav', label: i.label, sub: m.label, url: i.href })),
    ]),
  ).current;

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setResults([]); setActive(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  // Debounced record search. Navigation matches locally and needs no request.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const r = await searchAPI.global(term);
        // Ignore a slow response that a newer keystroke has already superseded.
        if (id === reqId.current) setResults(r.data.results || []);
      } catch { if (id === reqId.current) setResults([]); }
      finally { if (id === reqId.current) setLoading(false); }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const term = q.trim().toLowerCase();
  const navMatches = term
    ? destinations.filter((d) => d.label.toLowerCase().includes(term) || d.sub.toLowerCase().includes(term)).slice(0, 5)
    : destinations.slice(0, 6);
  const items = [...navMatches, ...results];

  useEffect(() => { setActive(0); }, [q, results.length]);

  const go = useCallback((item) => {
    if (!item?.url) return;
    setOpen(false);
    router.push(item.url);
  }, [router]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[active]); }
  };

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <Modal open={open} onClose={() => setOpen(false)} size="md" padded={false} hideClose title="Search">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <Search size={17} color="var(--text-muted)" aria-hidden="true" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search leads, clients, contracts, invoices, bookings…"
          aria-label="Search everything"
          aria-controls="wf-palette-results"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--text)', fontSize: 15, fontFamily: 'inherit',
          }}
        />
        {loading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>searching…</span>}
      </div>

      <div id="wf-palette-results" ref={listRef} role="listbox" style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
        {items.length === 0 ? (
          <div style={{ padding: '26px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {term.length < 2 ? 'Type at least two characters.' : loading ? 'Searching…' : `Nothing matches “${q.trim()}”.`}
          </div>
        ) : items.map((item, i) => (
          <button
            key={`${item.type}-${item.id || item.url}-${i}`}
            data-idx={i}
            role="option"
            aria-selected={i === active}
            onClick={() => go(item)}
            onMouseEnter={() => setActive(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '9px 11px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer',
              background: i === active ? 'var(--accent-bg)' : 'transparent',
              color: 'var(--text)', textAlign: 'left', fontFamily: 'inherit',
            }}
          >
            <span style={{
              fontSize: 10, fontWeight: 'var(--fw-bold)', textTransform: 'uppercase', letterSpacing: '0.4px',
              color: 'var(--text-muted)', minWidth: 56,
            }}>
              {item.type === 'nav' ? 'Go to' : TYPE_LABEL[item.type] || item.type}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 'var(--fw-semibold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.label}
              </span>
              {item.sub && (
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.sub}
                </span>
              )}
            </span>
            {i === active
              ? <CornerDownLeft size={13} color="var(--text-muted)" aria-hidden="true" />
              : <ArrowRight size={13} color="var(--border)" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div style={{
        display: 'flex', gap: 14, padding: '8px 14px', borderTop: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text-muted)',
      }}>
        <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
      </div>
    </Modal>
  );
}
