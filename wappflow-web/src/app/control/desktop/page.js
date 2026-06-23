'use client';
import { useEffect, useState } from 'react';
import { ccApi, fmtNum } from '@/lib/ccApi';
import { Card } from '@/components/control/ControlShell';

// Command Center · Desktop fleet management (Phase 7). Installed versions, machine
// count, last-sync, and version governance (force-update floor + blocked builds).
export default function DesktopFleet() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ latest_version: '', min_version: '', blocked_versions: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () => ccApi.desktopFleet()
    .then((r) => { setD(r.data); const p = r.data.policy || {}; let blk = []; try { blk = JSON.parse(p.blocked_versions || '[]'); } catch {} setForm({ latest_version: p.latest_version || '', min_version: p.min_version || '', blocked_versions: blk.join(', ') }); })
    .catch((e) => setErr(e.response?.data?.error || 'Failed'));
  useEffect(() => { load(); }, []);

  const savePolicy = async () => {
    setSaving(true); setSaved(false);
    try {
      await ccApi.setDesktopPolicy({
        latest_version: form.latest_version.trim() || null,
        min_version: form.min_version.trim() || null,
        blocked_versions: form.blocked_versions.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setSaved(true); load();
    } catch (e) { setErr(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (err) return <div style={{ color: '#f87171' }}>{err}</div>;
  if (!d) return <div style={{ color: 'var(--text-dim,#666)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Desktop Fleet</h1>
        <span style={{ color: 'var(--text-dim,#666)', fontSize: 13 }}>{fmtNum(d.machine_count)} machines · {fmtNum(d.stale_7d)} stale (7d)</span>
      </div>

      <Card>
        <h3 style={h3}>Installed versions</h3>
        {!d.by_version.length && <div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>No desktop installs have reported yet.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {d.by_version.map((v) => (
            <div key={v.version}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v.version}</span>
                <span style={{ color: 'var(--text-dim,#666)' }}>{fmtNum(v.n)}</span>
              </div>
              <div style={{ height: 9, borderRadius: 999, background: 'var(--bg,#0a0a0f)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.round((v.n / Math.max(1, d.machine_count)) * 100)}%`, height: '100%', borderRadius: 999, background: '#60a5fa' }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 style={h3}>Version policy</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
          <Field label="Latest version (advertised)" value={form.latest_version} onChange={(v) => setForm((f) => ({ ...f, latest_version: v }))} placeholder="e.g. 1.4.0" />
          <Field label="Minimum version (force-update floor)" value={form.min_version} onChange={(v) => setForm((f) => ({ ...f, min_version: v }))} placeholder="below this → must update" />
          <Field label="Blocked versions (comma-separated)" value={form.blocked_versions} onChange={(v) => setForm((f) => ({ ...f, blocked_versions: v }))} placeholder="e.g. 1.2.3, 1.2.4" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={savePolicy} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{saving ? 'Saving…' : 'Save policy'}</button>
            {saved && <span style={{ color: '#34d399', fontSize: 12.5 }}>Saved ✓</span>}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)', marginTop: 12 }}>Desktops poll <code>/api/desktop/update-policy</code> on launch: below the floor → forced update; a blocked version → hard-stop.</div>
      </Card>

      <Card>
        <h3 style={h3}>Devices ({fmtNum(d.devices.length)})</h3>
        {!d.devices.length && <div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>None yet.</div>}
        {d.devices.map((dev) => (
          <div key={dev.device_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border,#1e1e26)', fontSize: 12.5 }}>
            <span style={{ fontFamily: 'monospace', color: 'var(--text-dim,#666)' }}>{String(dev.device_id).slice(0, 12)} · {dev.platform || '—'}</span>
            <span><span style={{ fontFamily: 'monospace' }}>{dev.version || '—'}</span> · last seen {dev.last_seen ? new Date(dev.last_seen.replace(' ', 'T') + 'Z').toLocaleDateString() : '—'}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: 'var(--text-muted,#9a9aa5)' }}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border,#1e1e26)', background: 'var(--bg,#0a0a0f)', color: 'var(--text,#e7e7ea)', fontSize: 13, outline: 'none' }} />
    </label>
  );
}

const h3 = { fontSize: 13, fontWeight: 700, margin: '0 0 14px', color: 'var(--text-muted,#9a9aa5)' };
