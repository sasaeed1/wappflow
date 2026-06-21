'use client';
import { Suspense, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ccApi } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';

export default function TimeMachinePage() {
  // useSearchParams must be inside a Suspense boundary in this Next.js.
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-dim,#666)', fontSize: 13 }}>Loading…</div>}>
      <TimeMachine />
    </Suspense>
  );
}

function TimeMachine() {
  const params = useSearchParams();
  const [type] = useState('workspace');
  const [id, setId] = useState(params.get('id') || '');
  const [asOf, setAsOf] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const reconstruct = useCallback(async () => {
    if (!id.trim()) { setErr('Enter a workspace id.'); return; }
    setBusy(true); setErr('');
    try {
      // datetime-local yields a local "YYYY-MM-DDTHH:mm" — send as ISO for the server.
      const as_of = asOf ? new Date(asOf).toISOString() : undefined;
      const r = await ccApi.timeMachine({ type, id: id.trim(), as_of });
      setData(r.data);
    } catch (e) {
      setData(null);
      setErr(e.response?.data?.error || 'Failed to reconstruct.');
    }
    setBusy(false);
  }, [type, id, asOf]);

  const differs = (k) => data && data.reconstructed && data.current && data.reconstructed[k] !== data.current[k];
  const asOfLabel = data?.as_of ? new Date(data.as_of).toLocaleString() : 'now';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Time Machine</h1>
        <span style={{ color: 'var(--text-dim,#666)', fontSize: 13 }}>Best-effort historical reconstruction</span>
      </div>

      {/* Best-effort note — prominent */}
      <Card style={{ background: '#fbbf2410', borderColor: '#fbbf2433' }}>
        <div style={{ fontSize: 12.5, color: '#fbbf24', lineHeight: 1.5 }}>
          ⚠ This is a <strong>best-effort reconstruction</strong>. We did not store point-in-time snapshots —
          state is rebuilt by replaying the platform event + admin audit spines backwards from the current row.
          A field can only roll back to a value that was captured in an audit “before” snapshot, so fidelity
          improves as event coverage grows. Treat the result as indicative, not authoritative.
        </div>
      </Card>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Entity">
          <select value={type} disabled style={{ ...sel, opacity: .65, cursor: 'not-allowed' }}>
            <option value="workspace">Workspace</option>
          </select>
        </Field>
        <Field label="Workspace id">
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="ws-…" style={{ ...inp, minWidth: 260 }}
            onKeyDown={(e) => { if (e.key === 'Enter') reconstruct(); }} />
        </Field>
        <Field label="As of (optional)">
          <input type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} style={inp} />
        </Field>
        <button disabled={busy} onClick={reconstruct} style={btn}>{busy ? 'Reconstructing…' : 'Reconstruct'}</button>
        {asOf && <button onClick={() => setAsOf('')} style={ghostBtn}>Clear date</button>}
      </div>

      {err && <Card style={{ background: '#f8717110', borderColor: '#f8717133' }}><div style={{ fontSize: 12.5, color: '#f87171' }}>{err}</div></Card>}

      {data && (
        <>
          {/* Reconstructed vs Current */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={hdr}>Reconstructed</span>
                <Pill tone="amber">as of {asOfLabel}</Pill>
              </div>
              <KV label="Status" value={data.reconstructed?.status} highlight={differs('status')} render={(v) => <Pill tone={v === 'suspended' ? 'red' : 'green'}>{v}</Pill>} />
              <KV label="Plan" value={data.reconstructed?.plan} highlight={differs('plan')} render={(v) => <Pill tone={planTone(v)}>{v}</Pill>} />
            </Card>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={hdr}>Current</span>
                <Pill tone="blue">now</Pill>
              </div>
              <KV label="Status" value={data.current?.status} render={(v) => <Pill tone={v === 'suspended' ? 'red' : 'green'}>{v}</Pill>} />
              <KV label="Plan" value={data.current?.plan} render={(v) => <Pill tone={planTone(v)}>{v}</Pill>} />
              {data.current?.name && <KV label="Name" value={data.current.name} render={(v) => <span style={{ fontSize: 13 }}>{v}</span>} />}
            </Card>
          </div>
          {(differs('status') || differs('plan')) && (
            <div style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>Highlighted fields changed between the reconstructed point and now.</div>
          )}

          {/* Merged timeline */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Timeline</h2>
            <span style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>
              {data.timeline.length} item{data.timeline.length === 1 ? '' : 's'}{data.as_of ? ` · up to ${asOfLabel}` : ''} · merged events + audit
            </span>
          </div>
          <Card style={{ padding: 0 }}>
            {!data.timeline.length && <div style={{ padding: 20, color: 'var(--text-dim,#666)', fontSize: 13 }}>No events or audit entries for this workspace in range.</div>}
            {data.timeline.map((it) => <TimelineRow key={it.source + ':' + it.id} item={it} />)}
          </Card>
        </>
      )}

      {!data && !err && (
        <Card><div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>Enter a workspace id and an optional point in time, then Reconstruct.</div></Card>
      )}
    </div>
  );
}

function TimelineRow({ item }) {
  const [open, setOpen] = useState(false);
  const hasDiff = item.before || item.after;
  return (
    <div style={{ borderBottom: '1px solid var(--border,#1e1e26)' }}>
      <div onClick={() => hasDiff && setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: hasDiff ? 'pointer' : 'default', fontSize: 13 }}>
        <Pill tone={item.source === 'audit' ? 'amber' : 'blue'}>{item.source}</Pill>
        <span style={{ fontWeight: 600 }}>{item.label}</span>
        <span style={{ flex: 1 }} />
        {item.actor && <span style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>{String(item.actor).slice(0, 18)}</span>}
        <span style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>{item.ts ? new Date(/Z|[+-]\d\d:?\d\d$/.test(String(item.ts)) ? item.ts : item.ts + 'Z').toLocaleString() : ''}</span>
      </div>
      {open && hasDiff && (
        <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Diff title="Before" data={item.before} />
          <Diff title="After" data={item.after} />
        </div>
      )}
    </div>
  );
}

function Diff({ title, data }) {
  return (
    <div style={{ background: 'var(--bg,#0a0a0f)', border: '1px solid var(--border,#1e1e26)', borderRadius: 9, padding: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim,#666)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 6 }}>{title}</div>
      <pre style={{ margin: 0, fontSize: 11.5, color: 'var(--text-muted,#9a9aa5)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{data ? JSON.stringify(data, null, 2) : '—'}</pre>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim,#666)', textTransform: 'uppercase', letterSpacing: .4 }}>{label}</span>
      {children}
    </div>
  );
}

function KV({ label, value, render, highlight }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderRadius: 8, ...(highlight ? { background: '#fbbf240f', padding: '7px 8px', margin: '0 -8px' } : {}) }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim,#666)', width: 64 }}>{label}</span>
      {value != null ? render(value) : <span style={{ color: 'var(--text-dim,#666)', fontSize: 13 }}>—</span>}
      {highlight && <span style={{ fontSize: 10.5, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: .4, marginLeft: 'auto' }}>changed</span>}
    </div>
  );
}

const inp = { padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text,#e8e8ea)', fontSize: 13 };
const sel = { ...inp };
const btn = { padding: '8px 14px', borderRadius: 9, border: '1px solid #818cf855', background: '#818cf81a', color: '#818cf8', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const ghostBtn = { padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text-muted,#9a9aa5)', fontSize: 13, cursor: 'pointer' };
const hdr = { fontSize: 11, color: 'var(--text-dim,#666)', textTransform: 'uppercase', letterSpacing: .4, fontWeight: 700 };
function planTone(p) { return ({ free: 'neutral', starter: 'blue', growth: 'purple', enterprise: 'green' })[p] || 'neutral'; }
