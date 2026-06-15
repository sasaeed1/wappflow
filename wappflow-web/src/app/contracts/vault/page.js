'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileText, ChevronRight, Phone, Mail } from 'lucide-react';
import { csAPI } from '../../../lib/api';
import ContractsStudioShell from '../../../components/ContractsStudioShell';

const STATUS = {
  draft: ['#64748b', 'Draft'], pending_approval: ['#f59e0b', 'Needs approval'], sent: ['#6366f1', 'Sent'],
  viewed: ['#0ea5e9', 'Viewed'], signed: ['#10b981', 'Signed'], completed: ['#10b981', 'Completed'],
  declined: ['#ef4444', 'Declined'], expired: ['#9ca3af', 'Expired'],
};
const Pill = ({ s }) => { const [c, l] = STATUS[s] || ['#64748b', s]; return <span style={{ fontSize: 11, fontWeight: 700, color: c, background: `${c}1f`, padding: '2px 9px', borderRadius: 999 }}>{l}</span>; };

export default function VaultPage() {
  const router = useRouter();
  const [clients, setClients] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({});

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/contracts/vault'); return; }
    csAPI.vault().then(r => setClients(r.data.clients || [])).catch(() => setClients([]));
  }, []); // eslint-disable-line

  const filtered = useMemo(() => (clients || []).filter(c => !q.trim() || (c.client_name || '').toLowerCase().includes(q.toLowerCase())), [clients, q]);

  return (
    <ContractsStudioShell>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px 60px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px', letterSpacing: '-0.5px' }}>Client Vault</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 22px' }}>Every client’s documents, filed together.</p>

        <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients…" style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {!clients && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
        {clients && filtered.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No clients yet — documents you create will be filed here.</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((c, i) => {
            const key = c.lead_id || `none-${i}`; const isOpen = open[key];
            return (
              <div key={key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                <button onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{(c.client_name || 'C')[0].toUpperCase()}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{c.client_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>{c.documents.length} document{c.documents.length !== 1 ? 's' : ''}</span>
                      {c.signed_count > 0 && <span style={{ color: '#10b981' }}>{c.signed_count} signed</span>}
                      {c.total_value > 0 && <span style={{ fontWeight: 700, color: 'var(--text)' }}>${c.total_value.toLocaleString()}</span>}
                    </div>
                  </div>
                  <ChevronRight size={18} style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }} />
                </button>
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '6px 10px 10px' }}>
                    {(c.phone || c.email) && (
                      <div style={{ display: 'flex', gap: 16, padding: '8px 8px 10px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                        {c.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Phone size={12} /> {c.phone}</span>}
                        {c.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mail size={12} /> {c.email}</span>}
                      </div>
                    )}
                    {c.documents.map(d => (
                      <button key={d.id} onClick={() => router.push(`/contracts/${d.id}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 10px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <FileText size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title || 'Untitled'}</span>
                        {d.totals?.total > 0 && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>${Number(d.totals.total).toLocaleString()}</span>}
                        <Pill s={d.status} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ContractsStudioShell>
  );
}
