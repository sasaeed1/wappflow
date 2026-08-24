'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, TrendingUp, Pause, Sparkles, Flag, X } from 'lucide-react';
import { ccApi } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';
import { clickable } from '@/lib/a11y';

const KIND_META = {
  suspended: { icon: Pause, label: 'Suspended' },
  churn_risk: { icon: AlertTriangle, label: 'Churn risk' },
  expansion: { icon: TrendingUp, label: 'Expansion' },
  ai_cost: { icon: Sparkles, label: 'AI cost' },
};
const SEV_TONE = { high: 'red', medium: 'amber', low: 'blue', info: 'neutral' };

export default function FounderInbox() {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => { ccApi.inbox().then((r) => setD(r.data)).catch((e) => setErr(e.response?.data?.error || 'Failed')); }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <div style={{ color: '#f87171' }}>{err}</div>;
  if (!d) return <div style={{ color: 'var(--text-dim,#666)' }}>Loading…</div>;

  const dismiss = async (id) => { try { await ccApi.dismissInbox(id); load(); } catch (e) { alert(e.response?.data?.error || 'Failed'); } };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Founder Inbox</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {d.counts.high ? <Pill tone="red">{d.counts.high} high</Pill> : null}
          {d.counts.medium ? <Pill tone="amber">{d.counts.medium} medium</Pill> : null}
          {d.counts.low ? <Pill tone="blue">{d.counts.low} low</Pill> : null}
          {d.counts.info ? <Pill tone="neutral">{d.counts.info} info</Pill> : null}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-dim,#666)', margin: 0 }}>What needs your attention — synthesized from suspensions, churn/expansion scores, AI spend, and flagged items. Computed signals resolve automatically when the condition clears.</p>

      <Card style={{ padding: 0 }}>
        {!d.items.length && <div style={{ padding: 24, color: 'var(--text-dim,#666)', fontSize: 13 }}>📭 Inbox zero — nothing needs attention. (At-risk/expansion signals appear after a health rollup.)</div>}
        {d.items.map((it, i) => {
          const meta = KIND_META[it.kind] || { icon: Flag, label: it.kind };
          const Icon = meta.icon;
          return (
            <div key={it.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border,#1e1e26)' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--bg,#0a0a0f)', flexShrink: 0 }}><Icon size={16} /></div>
              <div style={{ flex: 1, minWidth: 0, cursor: it.link ? 'pointer' : 'default' }} {...clickable(() => it.link && router.push(it.link))}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{it.title}</div>
                {it.body && <div style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>{it.body}</div>}
              </div>
              <Pill tone={SEV_TONE[it.severity] || 'neutral'}>{meta.label}</Pill>
              {it.persisted && <button onClick={() => dismiss(it.id)} title="Dismiss" style={{ background: 'none', border: 'none', color: 'var(--text-dim,#666)', cursor: 'pointer' }}><X size={15} /></button>}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
