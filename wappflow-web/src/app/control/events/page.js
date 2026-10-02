'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { ccApi, ccEventStreamUrl } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';

// What happened across the platform: product events (signups, leads, contracts
// signed, payments, galleries, bookings, tickets) written by the event spine, plus
// every admin action. Live via SSE (unnamed frames → onmessage + switch on type).
const TYPES = [
  ['', 'All events'], ['user_signed_up', 'Signups'], ['workspace_created', 'Workspaces created'],
  ['lead_created', 'Leads'], ['contract_signed', 'Contracts signed'], ['payment_received', 'Payments'],
  ['gallery_published', 'Galleries published'], ['booking_created', 'Bookings'],
  ['ticket_created', 'Support tickets'], ['workspace_plan_changed', 'Plan changes'],
  ['workspace_suspended', 'Suspensions'], ['impersonation_started', 'Impersonations'],
];

export default function Events() {
  const [events, setEvents] = useState([]);
  const [live, setLive] = useState(false);
  const [type, setType] = useState('');
  const [ws, setWs] = useState('');
  const filters = useRef({ type: '', ws: '' });
  const esRef = useRef(null);
  const retry = useRef(null);

  const load = useCallback(() => {
    ccApi.events({ limit: 200, type: filters.current.type || undefined, workspace_id: filters.current.ws || undefined })
      .then((r) => setEvents(r.data.events || [])).catch(() => {});
  }, []);

  useEffect(() => { filters.current = { type, ws: ws.trim() }; load(); }, [type, ws, load]);

  useEffect(() => {
    let alive = true;
    // The stream URL carries a 60-second ticket, so a dropped connection is reopened
    // with a fresh ticket rather than EventSource's automatic retry of a dead URL.
    const connect = async () => {
      try {
        const url = await ccEventStreamUrl();
        if (!alive) return;
        const es = new EventSource(url);
        esRef.current = es;
        es.onopen = () => setLive(true);
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            switch (data.type) {
              case 'event': {
                const ev = data.event;
                if (!ev) break;
                const f = filters.current;
                if (f.type && ev.type !== f.type) break;
                if (f.ws && ev.workspace_id !== f.ws) break;
                setEvents((prev) => [{ ...ev, _live: true }, ...prev].slice(0, 300));
                break;
              }
              default: break;
            }
          } catch {}
        };
        es.onerror = () => {
          setLive(false); es.close();
          if (alive) retry.current = setTimeout(connect, 4000);
        };
      } catch { if (alive) retry.current = setTimeout(connect, 8000); }
    };
    connect();
    return () => { alive = false; clearTimeout(retry.current); esRef.current?.close(); };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Live Event Stream</h1>
        <Pill tone={live ? 'green' : 'neutral'}>{live ? '● live' : 'connecting…'}</Pill>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select aria-label="Event type" value={type} onChange={(e) => setType(e.target.value)} style={sel}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input aria-label="Workspace ID" value={ws} onChange={(e) => setWs(e.target.value)} placeholder="Filter by workspace ID" style={{ ...sel, minWidth: 220 }} />
      </div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {!events.length && <div style={{ padding: 20, color: 'var(--text-dim,#666)', fontSize: 13 }}>No events match. New signups, leads, signatures, payments and admin actions appear here as they happen.</div>}
        {events.map((ev, i) => (
          <div key={ev.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid var(--border,#1e1e26)', fontSize: 13, background: ev._live ? 'color-mix(in srgb,#34d399 7%,transparent)' : 'transparent' }}>
            <Pill tone={toneFor(ev.type)}>{String(ev.type || '').replace(/_/g, ' ')}</Pill>
            <span style={{ color: 'var(--text-muted,#9a9aa5)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {ev.workspace_id ? <a href={`/control/customers/${ev.workspace_id}`} style={{ color: 'inherit' }}>{ev.workspace_name || String(ev.workspace_id).slice(0, 8)}</a> : 'platform'}
              {ev.entity_type ? ` · ${ev.entity_type}` : ''}
            </span>
            <span style={{ flex: 1 }} />
            {ev.actor_type && <span style={{ fontSize: 11, color: 'var(--text-dim,#666)' }}>{ev.actor_type}</span>}
            <span style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>{ev.ts ? new Date(String(ev.ts).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(ev.ts) ? '' : 'Z')).toLocaleString() : ''}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

const sel = { padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text,#e8e8ea)', fontSize: 13 };

function toneFor(t = '') {
  if (t.includes('suspend') || t.includes('declin') || t.includes('cancel')) return 'red';
  if (t.includes('flag') || t.includes('override') || t.includes('grace') || t.includes('ticket')) return 'amber';
  if (t.includes('sign') || t.includes('paid') || t.includes('payment') || t.includes('restore') || t.includes('published')) return 'green';
  if (t.includes('impersonat')) return 'purple';
  if (t.includes('lead') || t.includes('booking') || t.includes('created')) return 'blue';
  return 'neutral';
}
