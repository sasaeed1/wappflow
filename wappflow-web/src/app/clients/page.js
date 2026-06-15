'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, UserCheck, MessageCircle, ArrowRight, Undo2, Phone, Calendar,
  TrendingUp, Users, Award,
} from 'lucide-react';
import { leadsAPI, displayPhone } from '../../lib/api';
import NavBar from '../../components/NavBar';

const fmtMoney = (n) => {
  if (!n) return null;
  try { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n); } catch { return String(n); }
};
const fmtDate = (d) => { if (!d) return null; try { return new Date(d).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); } catch { return null; } };
const initial = (s) => (s || '?').trim()[0]?.toUpperCase() || '?';
const AVATAR_HUES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
const hueFor = (s) => AVATAR_HUES[(s || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_HUES.length];

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/clients'); return; }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try { const r = await leadsAPI.getAll({ client: 1 }); setClients(r.data.leads || []); } catch {}
    setLoading(false);
  };

  const moveBack = async (c) => {
    setBusy(c.id);
    try { await leadsAPI.setClient(c.id, false); setClients(prev => prev.filter(x => x.id !== c.id)); say(`${c.customer_name || 'Client'} moved back to Leads`); }
    catch { say('Could not move back'); }
    setBusy(null);
  };

  const revenue = useMemo(() => clients.reduce((s, c) => s + (Number(c.actual_sale) || 0), 0), [clients]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(c => `${c.customer_name || ''} ${c.customer_phone || ''} ${c.email || ''}`.toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <NavBar>
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
            {revenue > 0 && <StatCard icon={<TrendingUp size={15} />} label="Lifetime revenue" value={fmtMoney(revenue)} />}
          </div>
        </div>

        {/* search */}
        <div style={{ position: 'relative', maxWidth: 380, marginBottom: 22 }}>
          <Search size={16} style={{ position: 'absolute', left: 13, top: 12, color: 'var(--text-muted)' }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search clients…"
            style={{ width: '100%', height: 42, padding: '0 14px 0 38px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14, padding: '40px 0' }}>Loading clients…</p>
        ) : clients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'clamp(50px, 10vh, 110px) 20px', border: '1px dashed var(--border)', borderRadius: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--accent-light)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><UserCheck size={24} /></div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>No clients yet</h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 auto 20px', maxWidth: 380 }}>Win a deal, then use <strong>Move to Clients</strong> on the lead to keep your pipeline clean without losing the relationship.</p>
            <button onClick={() => router.push('/leads-list')} style={btnPrimary}>Go to Leads <ArrowRight size={15} /></button>
          </div>
        ) : shown.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14, padding: '30px 0' }}>No clients match “{query}”.</p>
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
                  {c.actual_sale ? (
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{fmtMoney(c.actual_sale)}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deal value</div>
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
    </NavBar>
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
