'use client';
import { useEffect, useState, useRef } from 'react';
import { ccApi, BASE_URL } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [live, setLive] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    ccApi.events({ limit: 150 }).then((r) => setEvents(r.data.events)).catch(() => {});
    // Live tail via the admin SSE stream (unnamed frames → onmessage + switch on data.type).
    const token = typeof window !== 'undefined' ? localStorage.getItem('cc_token') : null;
    if (!token) return;
    const es = new EventSource(`${BASE_URL}/api/cc/events/stream?token=${token}`);
    esRef.current = es;
    es.onopen = () => setLive(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'event' && data.event) setEvents((prev) => [{ ...data.event, _live: true }, ...prev].slice(0, 200));
      } catch {}
    };
    es.onerror = () => { setLive(false); };
    return () => { es.close(); };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Live Event Stream</h1>
        <Pill tone={live ? 'green' : 'neutral'}>{live ? '● live' : 'connecting…'}</Pill>
      </div>
      <Card style={{ padding: 0 }}>
        {!events.length && <div style={{ padding: 20, color: 'var(--text-dim,#666)', fontSize: 13 }}>No events yet. Toggle a flag or suspend a workspace to generate one.</div>}
        {events.map((ev, i) => (
          <div key={ev.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border,#1e1e26)', fontSize: 13, background: ev._live ? 'color-mix(in srgb,#34d399 7%,transparent)' : 'transparent' }}>
            <Pill tone={toneFor(ev.type)}>{ev.type}</Pill>
            <span style={{ color: 'var(--text-muted,#9a9aa5)' }}>{ev.entity_type}{ev.entity_id ? ` · ${String(ev.entity_id).slice(0, 12)}` : ''}</span>
            <span style={{ flex: 1 }} />
            {ev.source && <span style={{ fontSize: 11, color: 'var(--text-dim,#666)' }}>{ev.source}</span>}
            <span style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>{ev.ts ? new Date(ev.ts + (String(ev.ts).endsWith('Z') ? '' : 'Z')).toLocaleString() : ''}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function toneFor(t = '') {
  if (t.includes('suspend') || t.includes('declin')) return 'red';
  if (t.includes('flag') || t.includes('override') || t.includes('grace')) return 'amber';
  if (t.includes('sign') || t.includes('paid') || t.includes('restore')) return 'green';
  if (t.includes('impersonat')) return 'purple';
  return 'neutral';
}
