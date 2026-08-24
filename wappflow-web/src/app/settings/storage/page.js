'use client';

// Workspace-facing storage usage (Settings → Storage). Mirrors the founder dashboard's
// numbers, scoped to this workspace, with a plan-limit meter + breakdowns. The 80/90/100%
// warnings fire into the notification center from the backend; this is the at-a-glance view.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, HardDrive, AlertTriangle } from 'lucide-react';
import { storageAPI } from '@/lib/api';
import { clickable } from '@/lib/a11y';

const GB = 1024 ** 3;
const fmtBytes = (n) => {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
};

const LEVEL = {
  ok: { color: '#34d399', label: 'Healthy' },
  warn: { color: '#fbbf24', label: '80% full' },
  critical: { color: '#fb923c', label: '90% full' },
  reached: { color: '#f87171', label: 'Limit reached' },
  unlimited: { color: '#818cf8', label: 'Unlimited' },
};

export default function StorageSettings() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    storageAPI.usage().then((r) => setData(r.data)).catch((e) => setErr(e.response?.data?.error || 'Failed to load storage'));
  }, []);

  const lvl = LEVEL[data?.level] || LEVEL.ok;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #e8e8ea)' }}>      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 60px' }}>
        <button onClick={() => router.push('/settings')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted,#9a9aa5)', cursor: 'pointer', fontSize: 13, marginBottom: 14 }}>
          <ArrowLeft size={15} /> Settings
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <HardDrive size={22} /><h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Storage</h1>
        </div>

        {err && <div style={{ color: '#f87171', fontSize: 14 }}>{err}</div>}
        {!data && !err && <div style={{ color: 'var(--text-dim,#666)' }}>Loading…</div>}

        {data && (
          <>
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 30, fontWeight: 800 }}>{fmtBytes(data.used_bytes)}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-dim,#666)', marginTop: 2 }}>
                    {data.unlimited ? 'of unlimited storage' : `of ${data.limit_gb} GB on your plan`}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 999, color: lvl.color, background: `${lvl.color}22` }}>{lvl.label}</span>
              </div>
              {!data.unlimited && (
                <div style={{ height: 12, borderRadius: 999, background: 'var(--bg,#0a0a0f)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, data.pct)}%`, height: '100%', borderRadius: 999, background: lvl.color, transition: 'width .3s' }} />
                </div>
              )}
              {data.level === 'reached' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, color: '#f87171' }}>
                  <AlertTriangle size={16} /> New uploads are blocked. Free up space or upgrade your plan to continue.
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
              <div style={card}>
                <h3 style={h3}>By type</h3>
                {(data.by_type || []).map((t) => (
                  <div key={t.type} style={row}>
                    <span style={{ textTransform: 'capitalize' }}>{t.type}</span>
                    <span style={{ color: 'var(--text-dim,#666)' }}>{fmtBytes(t.bytes)} · {t.files}</span>
                  </div>
                ))}
                {data.exports_bytes > 0 && <div style={row}><span>Export bundles</span><span style={{ color: 'var(--text-dim,#666)' }}>{fmtBytes(data.exports_bytes)}</span></div>}
              </div>
              <div style={card}>
                <h3 style={h3}>Largest projects</h3>
                {(data.largest_projects || []).map((p) => (
                  <div key={p.id} {...clickable(() => router.push(`/studio/${p.id}`))} style={{ ...row, cursor: 'pointer' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{p.title || 'Untitled'}</span>
                    <span style={{ color: 'var(--text-dim,#666)' }}>{fmtBytes(p.bytes)}</span>
                  </div>
                ))}
                {!(data.largest_projects || []).length && <div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>No media yet.</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const card = { background: 'var(--surface, #14141b)', border: '1px solid var(--border, #1e1e26)', borderRadius: 14, padding: 18 };
const h3 = { fontSize: 13, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-muted,#9a9aa5)' };
const row = { display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border,#1e1e26)', fontSize: 13 };
