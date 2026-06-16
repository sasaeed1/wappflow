'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { fetchClientPortal } from '../../../lib/api';

const money = (s, n) => `${s || '$'}${(Number(n) || 0).toLocaleString()}`;
const DOC_STATUS = {
  draft: ['#64748b', 'Draft'], sent: ['#6366f1', 'Awaiting you'], viewed: ['#0ea5e9', 'Opened'],
  signed: ['#10b981', 'Signed'], completed: ['#10b981', 'Signed'], declined: ['#ef4444', 'Declined'],
  expired: ['#9ca3af', 'Expired'], pending_approval: ['#f59e0b', 'In review'],
};
const INV_STATUS = { draft: ['#64748b', 'Draft'], sent: ['#6366f1', 'Due'], paid: ['#10b981', 'Paid'], overdue: ['#ef4444', 'Overdue'] };

export default function ClientPortalPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    fetchClientPortal(token).then(d => { setData(d); setState('ok'); document.title = `${d.brand} · Your portal`; }).catch(() => setState('missing'));
  }, [token]);

  if (state === 'loading') return <div style={center}><div style={spinner} /><style>{`@keyframes csp{to{transform:rotate(360deg)}}`}</style></div>;
  if (state !== 'ok') return <div style={{ ...center, flexDirection: 'column', gap: 8, textAlign: 'center', padding: 24 }}><h1 style={{ fontSize: 24, margin: 0 }}>Not available</h1><p style={{ color: '#70707a' }}>This link may have been withdrawn or is incorrect.</p></div>;

  const Section = ({ title, children, empty }) => (
    <div style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a8a93', margin: '0 0 12px' }}>{title}</h2>
      {empty ? <p style={{ fontSize: 14, color: '#9aa0aa', margin: 0 }}>{empty}</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>}
    </div>
  );
  const Pill = ({ map, s }) => { const [c, l] = (map[s] || ['#64748b', s]); return <span style={{ fontSize: 11.5, fontWeight: 700, color: c, background: `${c}1f`, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{l}</span>; };
  const Row = ({ href, icon, title, sub, right }) => {
    const inner = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderRadius: 14, background: '#fff', border: '1px solid #ececf1', textDecoration: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 700, color: '#16161a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>{sub && <div style={{ fontSize: 12.5, color: '#8a8a93' }}>{sub}</div>}</div>
        {right}
      </div>
    );
    return href ? <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{inner}</a> : inner;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f6f7f9,#eceef2)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 60px' }}>
        <header style={{ textAlign: 'center', padding: '48px 0 36px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20, marginBottom: 16 }}>{(data.brand || 'W')[0].toUpperCase()}</div>
          <div style={{ fontSize: 12.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8a8a93' }}>{data.brand}</div>
          <h1 style={{ fontSize: 'clamp(26px,5vw,34px)', fontWeight: 800, color: '#16161a', margin: '6px 0 0', letterSpacing: '-0.02em' }}>Welcome, {data.client_name}</h1>
          <p style={{ fontSize: 14.5, color: '#70707a', margin: '8px 0 0' }}>Everything for your project, in one place.</p>
        </header>

        {(data.milestones || []).length > 0 && (
          <Section title="Progress">
            {data.milestones.map((m, i) => (
              <Row key={i} icon={m.status === 'done' ? '✅' : m.status === 'in_progress' ? '⏳' : '○'} title={m.title} sub={m.due_date ? `Due ${m.due_date}` : ''} right={<span style={{ fontSize: 12, color: m.status === 'done' ? '#10b981' : '#8a8a93', textTransform: 'capitalize' }}>{(m.status || '').replace('_', ' ')}</span>} />
            ))}
          </Section>
        )}

        <Section title="Documents" empty={data.documents.length ? null : 'No documents yet.'}>
          {data.documents.map((d, i) => <Row key={i} href={d.url} icon="📄" title={d.title} sub={d.type} right={<Pill map={DOC_STATUS} s={d.status} />} />)}
        </Section>

        <Section title="Galleries" empty={data.galleries.length ? null : 'Your galleries will appear here once delivered.'}>
          {data.galleries.map((g, i) => <Row key={i} href={g.url} icon="🖼️" title={g.title} sub="View & download" right={<span style={{ fontSize: 13, color: '#6366f1', fontWeight: 700 }}>Open →</span>} />)}
        </Section>

        {(data.albums || []).length > 0 && (
          <Section title="Albums">
            {data.albums.map((a, i) => <Row key={i} icon="📔" title={a.title || 'Album'} sub={a.page_count ? `${a.page_count} pages` : ''} right={<span style={{ fontSize: 12, color: '#8a8a93', textTransform: 'capitalize' }}>{a.status}</span>} />)}
          </Section>
        )}

        <Section title="Invoices" empty={data.invoices.length ? null : 'No invoices yet.'}>
          {data.invoices.map((inv, i) => <Row key={i} icon="💳" title={inv.invoice_number} sub={new Date(inv.created_at + 'Z').toLocaleDateString()} right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><b style={{ fontSize: 14, color: '#16161a' }}>{money(inv.currency_symbol, inv.total)}</b><Pill map={INV_STATUS} s={inv.status} /></span>} />)}
        </Section>

        {(data.orders || []).length > 0 && (
          <Section title="Orders">
            {data.orders.map((o, i) => <Row key={i} icon="🛍️" title={(o.items || []).map(it => `${it.qty}× ${it.name}`).join(', ') || 'Order'} sub={new Date(o.created_at + 'Z').toLocaleDateString()} right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><b style={{ fontSize: 14, color: '#16161a' }}>{money(o.currency_symbol, o.total)}</b><span style={{ fontSize: 12, color: '#8a8a93', textTransform: 'capitalize' }}>{o.status}</span></span>} />)}
          </Section>
        )}

        {data.projects.length > 0 && (
          <Section title="Projects">
            {data.projects.map((p, i) => <Row key={i} icon="📸" title={p.title} right={<span style={{ fontSize: 12.5, color: '#8a8a93', textTransform: 'capitalize' }}>{p.status}</span>} />)}
          </Section>
        )}

        <p style={{ textAlign: 'center', fontSize: 12, color: '#a8aeb8', marginTop: 40 }}>Powered by {data.brand}</p>
      </div>
    </div>
  );
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eceef2' };
const spinner = { width: 26, height: 26, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: '#16161a', borderRadius: '50%', animation: 'csp .9s linear infinite' };
