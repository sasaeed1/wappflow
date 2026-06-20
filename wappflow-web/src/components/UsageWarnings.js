'use client';

import { usePlan } from '@/lib/plan';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Sparkles, X } from 'lucide-react';

// Global soft-limit banner. Shows the single most-severe metric at >=80% usage:
//   warn (>=80%): warning · critical (>=90%): warning + upgrade · reached (100%):
//   hard-stop notice + upgrade. Dismissable per metric for the session.
const LABELS = {
  leads: 'monthly leads',
  users: 'team seats',
  whatsapp_accounts: 'WhatsApp accounts',
  storage_gb: 'storage',
  contract_sends: 'contract sends',
};
const SEV = { reached: 3, critical: 2, warn: 1 };

export default function UsageWarnings() {
  const { quota, plan, planName } = usePlan();
  const router = useRouter();
  const [dismissed, setDismissed] = useState({});

  if (!quota || !plan) return null;

  const flagged = Object.entries(quota)
    .filter(([m, q]) => q && SEV[q.level] && !dismissed[m])
    .sort((a, b) => SEV[b[1].level] - SEV[a[1].level]);
  if (!flagged.length) return null;

  const [metric, q] = flagged[0];
  const label = LABELS[metric] || metric;
  const reached = q.level === 'reached';
  const critical = q.level === 'critical';
  const isStorage = metric === 'storage_gb';
  const used = isStorage ? `${q.used} GB` : q.used;
  const limit = isStorage ? `${q.limit} GB` : q.limit;
  const accent = reached ? '#ef4444' : '#f59e0b';

  const message = reached
    ? `You've reached your ${label} limit (${used} of ${limit}) on ${planName}.`
    : `You've used ${used} of ${limit} ${label}${critical ? '' : ''} on ${planName}.`;
  const showUpgrade = reached || critical;

  return (
    <div style={{
      width: '100%',
      background: reached ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)',
      borderBottom: `1px solid ${accent}55`,
      color: 'var(--text)', fontFamily: 'inherit',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: accent, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <AlertTriangle size={13} />
        </span>
        <span style={{ flex: 1, fontSize: 13, minWidth: 180 }}>
          {message}{' '}
          {q.reset_date && q.monthly && !reached && (
            <span style={{ color: 'var(--text-muted)' }}>Resets {new Date(String(q.reset_date).replace(' ', 'T') + 'Z').toLocaleDateString()}.</span>
          )}
          {reached && <span style={{ color: 'var(--text-muted)' }}> Upgrade to keep going.</span>}
        </span>
        {showUpgrade && (
          <button
            onClick={() => router.push('/settings?tab=plan')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <Sparkles size={13} /> Upgrade plan
          </button>
        )}
        <button
          onClick={() => setDismissed(d => ({ ...d, [metric]: true }))}
          aria-label="Dismiss"
          style={{ width: 24, height: 24, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
