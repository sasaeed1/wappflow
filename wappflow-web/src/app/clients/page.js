'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, UserCheck, MessageCircle, ArrowRight, Undo2, Phone, Calendar,
  TrendingUp, Users, Award,
} from 'lucide-react';
import { leadsAPI, displayPhone, settingsAPI } from '../../lib/api';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';

const fmtMoney = (n, sym = '$') => {
  if (!n) return null;
  try { return sym + ' ' + new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n); } catch { return sym + ' ' + n; }
};
const fmtDate = (d) => { if (!d) return null; try { return new Date(d).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); } catch { return null; } };
const initial = (s) => (s || '?').trim()[0]?.toUpperCase() || '?';
const AVATAR_HUES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
const hueFor = (s) => AVATAR_HUES[(s || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_HUES.length];

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [company, setCompany] = useState(null);
  const sym = company?.currency_symbol || '$';

  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/clients'); return; }
    load();
    settingsAPI.getCompany().then(r => setCompany(r.data.company || {})).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    // The catch used to be empty, so a failed fetch left clients=[] and the page
    // rendered "No clients yet" — telling the user their data is gone during an
    // outage. Record the failure instead and let the render branch on it.
    setError(null);
    try {
      const r = await leadsAPI.getAll({ client: 1 });
      setClients(r.data.leads || []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Request failed');
    }
    setLoading(false);
  };

  const moveBack = async (c) => {
    setBusy(c.id);
    try { await leadsAPI.setClient(c.id, false); setClients(prev => prev.filter(x => x.id !== c.id)); say(`${c.customer_name || 'Client'} moved back to Leads`); }
    catch { say('Could not move back'); }
    setBusy(null);
  };

  // Lifetime revenue is what they have actually PAID (sum of paid invoices),
  // supplied by the API. actual_sale holds a single deal's value, so a repeat
  // client's fifth booking used to be reported as their entire history.
  const revenue = useMemo(() => clients.reduce((s, c) => s + (Number(c.lifetime_revenue) || 0), 0), [clients]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => `${c.customer_name || ''} ${c.customer_phone || ''} ${c.email || ''}`.toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px)' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>
              <Award size={14} /> Clients
            </div>
            <h1 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text)', margin: 0 }}>Your clients</h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '6px 0 0', maxWidth: 560 }}>
              Won deals you&apos;ve moved out of the pipeline. They stay in your chat &amp; analytics — just out of the Leads list.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatCard icon={<Users size={15} />} label="Clients" value={clients.length} />
            {revenue > 0 && <StatCard icon={<TrendingUp size={15} />} label="Lifetime revenue" value={fmtMoney(revenue, sym)} />}
          </div>
        </div>

        {/* search */}
        <div style={{ position: 'relative', maxWidth: 380, marginBottom: 22 }}>
          <Search size={16} style={{ position: 'absolute', left: 13, top: 12, color: 'var(--text-muted)' }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search clients…"
            style={{ width: '100%', height: 42, padding: '0 14px 0 38px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {/* Order matters: error → loading → empty → filtered-empty → content. Anything
            else lets a failure or a pending fetch masquerade as "you have no data". */}
        {error ? (
          <ErrorState
            title="Could not load your clients"
            description="Your clients are safe — we just couldn’t fetch them right now."
            detail={error}
            onRetry={load}
          />
        ) : loading ? (
          <Spinner size="lg" center label="Loading clients" />
        ) : clients.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="No clients yet"
            description="Win a deal, then use Move to Clients on the lead to keep your pipeline clean without losing the relationship."
            action={{ label: 'Go to Leads', onClick: () => router.push('/leads-list') }}
            style={{ border: '1px dashed var(--border)', borderRadius: 16 }}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            filtered
            icon={Search}
            title={`No clients match “${query}”`}
            description="Try a different spelling, or clear the search to see everyone."
            action={{ label: 'Clear search', onClick: () => setQuery('') }}
            compact
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {shown.map(c => (
              <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, transition: 'box-shadow .15s, transform .15s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, background: hueFor(c.customer_name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>
                    {initial(c.customer_name)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.customer_name || 'Unnamed client'}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={11} /> {displayPhone(c.customer_phone, c.platform_source) || '—'}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 18, marginBottom: 16, flexWrap: 'wrap' }}>
                  {(Number(c.lifetime_revenue) > 0 || c.actual_sale) ? (
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{fmtMoney(Number(c.lifetime_revenue) || c.actual_sale, sym)}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {Number(c.lifetime_revenue) > 0 ? 'Paid to date' : 'Deal value'}
                      </div>
                    </div>
                  ) : null}
                  {fmtDate(c.client_since) && (
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}><Calendar size={12} /> {fmtDate(c.client_since)}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client since</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => router.push(`/leads/${c.id}`)} style={btnPrimary}>Open <ArrowRight size={14} /></button>
                  <button onClick={() => router.push(`/leads/${c.id}`)} style={btnGhost} title="Open chat"><MessageCircle size={14} /></button>
                  <button onClick={() => moveBack(c)} disabled={busy === c.id} style={{ ...btnGhost, marginLeft: 'auto' }} title="Move back to Leads"><Undo2 size={14} /> {busy === c.id ? '…' : 'To leads'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 600, padding: '10px 18px', borderRadius: 999, background: 'var(--text)', color: 'var(--surface)', fontSize: 13, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>{toast}</div>}
    </>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderRadius: 13, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      </div>
    </div>
  );
}

const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700 };
const btnGhost = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 13px', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600 };
