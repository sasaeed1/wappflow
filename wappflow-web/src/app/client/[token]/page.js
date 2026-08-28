'use client';

// ════════════════════════════════════════════════════════════════════════════
//  CLIENT PORTAL — everything a client has with this studio, in one place.
//
//  Was a grey page of white rows with emoji icons: 📄 📸 🖼️ 💳 🛍️. Emoji render
//  differently on every platform and carry the vendor's art direction, not the
//  studio's — on a client's Android the portal was decorated by Google.
//
//  DESIGN DECISIONS, stated:
//
//  • WHAT NEEDS YOU COMES FIRST. The old page was ordered by module — documents,
//    galleries, albums, invoices, orders — which is the shape of the software,
//    not of the client's attention. An unsigned contract and an unpaid invoice
//    now surface above everything as one "needs you" band; the rest is history
//    and can wait.
//
//  • ONE ACCENT MEANS ONE THING. Gold marks what is actionable. A status that is
//    merely informational is quiet, so "Paid" does not compete with "Pay now".
//
//  • NAMES ARE PRESENTED, NOT ECHOED. The greeting was "Welcome, sami saeed" —
//    whatever casing the CRM happened to hold.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { fetchClientPortal } from '../../../lib/api';
import { FileText, Images, BookOpen, CreditCard, ShoppingBag, Camera, Check, Clock, ArrowRight } from 'lucide-react';
import PublicBrandMark from '@/components/PublicBrandMark';
import PublicFooter from '@/components/PublicFooter';
import { PublicShell, PublicHero, PublicLoading, PublicUnavailable } from '@/components/public/PublicShell';

const money = (sym, n) => `${sym || '$'}${(Number(n) || 0).toLocaleString()}`;
const fmtDate = (d) => (d ? new Date(String(d).replace(' ', 'T')).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

// Title Case a name the CRM may hold in any casing. Only touches all-lower or
// all-upper input: "McDonald" and "de Souza" are how someone chose to write
// their own name and must survive untouched.
function presentName(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'there';
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

const DOC_NEEDS_YOU = new Set(['sent', 'viewed', 'pending']);
const INV_NEEDS_YOU = new Set(['sent', 'pending', 'overdue']);

export default function ClientPortalPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    fetchClientPortal(token)
      .then((d) => { setData(d); setState('ok'); document.title = `${d.brand?.name || 'Your'} · Client portal`; })
      .catch(() => setState('missing'));
  }, [token]);

  // What is waiting on the client, gathered before anything is drawn. This is the
  // question they opened the page to answer.
  const todo = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (const d of data.documents || []) {
      if (DOC_NEEDS_YOU.has(d.status)) out.push({ kind: 'doc', title: d.title, sub: 'Waiting for your signature', href: d.url, cta: 'Review & sign' });
    }
    for (const inv of data.invoices || []) {
      if (inv.pay_url && INV_NEEDS_YOU.has(inv.status)) {
        out.push({ kind: 'inv', title: inv.invoice_number, sub: `${money(inv.currency_symbol, inv.total)} due`, href: inv.pay_url, cta: 'Pay now' });
      }
    }
    for (const o of data.orders || []) {
      if (o.pay_url && o.status !== 'paid') out.push({ kind: 'order', title: 'Print order', sub: `${money(o.currency_symbol, o.total)} due`, href: o.pay_url, cta: 'Pay now' });
    }
    return out;
  }, [data]);

  if (state === 'loading') return <PublicLoading />;
  if (state !== 'ok') return <PublicUnavailable title="Portal unavailable" message="This link may have been withdrawn, or it is incorrect." />;

  return (
    <PublicShell>
      <PublicHero
        kicker={data.brand?.name || 'Your studio'}
        title={`Welcome, ${presentName(data.client_name)}`}
        sub="Everything for your project, in one place."
      >
        <PublicBrandMark brand={data.brand} style={{ marginBottom: 16 }} />
      </PublicHero>

      <div className="pub-wrap pub-wrap--narrow" style={{ paddingBottom: 70 }}>

        {/* ── Anything waiting on the client, above everything else ─────────── */}
        {todo.length > 0 && (
          <section className="pub-section">
            <h2 className="pub-h2" style={{ marginBottom: 14 }}>Needs you</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {todo.map((t, i) => (
                <a key={i} href={t.href} target="_blank" rel="noreferrer" className="pub-card"
                   style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit', borderColor: 'rgba(194,168,120,0.45)' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(194,168,120,0.16)', color: 'var(--pub-accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {t.kind === 'doc' ? <FileText size={16} /> : <CreditCard size={16} />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700 }}>{t.title}</span>
                    <span className="pub-dim" style={{ display: 'block', fontSize: 12.5, marginTop: 1 }}>{t.sub}</span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--pub-accent)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {t.cta} <ArrowRight size={14} />
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {(data.links?.book || data.links?.shop) && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 30 }}>
            {data.links?.book && <a href={data.links.book} className="pub-btn">Book another session</a>}
            {data.links?.shop && <a href={data.links.shop} className="pub-btn pub-btn--ghost">Order prints</a>}
          </div>
        )}

        {(data.milestones || []).length > 0 && (
          <Section title="Progress">
            {data.milestones.map((m, i) => (
              <Row key={i}
                icon={m.status === 'done' ? <Check size={16} /> : <Clock size={16} />}
                tone={m.status === 'done' ? 'done' : 'default'}
                title={m.title}
                sub={m.due_date ? `Due ${fmtDate(m.due_date)}` : ''}
                right={<span className={`pub-badge${m.status === 'done' ? ' pub-badge--done' : ''}`} style={{ textTransform: 'capitalize' }}>{(m.status || '').replace('_', ' ')}</span>} />
            ))}
          </Section>
        )}

        <Section title="Documents" empty={(data.documents || []).length ? null : 'No documents yet.'}>
          {(data.documents || []).map((d, i) => (
            <Row key={i} href={d.url} icon={<FileText size={16} />} title={d.title} sub={d.type}
              right={<span className={`pub-badge${DOC_NEEDS_YOU.has(d.status) ? ' pub-badge--wait' : d.status === 'completed' || d.status === 'signed' ? ' pub-badge--done' : ''}`} style={{ textTransform: 'capitalize' }}>{d.status}</span>} />
          ))}
        </Section>

        <Section title="Galleries" empty={(data.galleries || []).length ? null : 'Your galleries will appear here once delivered.'}>
          {(data.galleries || []).map((g, i) => (
            <Row key={i} href={g.url} icon={<Images size={16} />} title={g.title} sub="View & download"
              right={<span style={{ color: 'var(--pub-accent)', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>Open <ArrowRight size={13} /></span>} />
          ))}
        </Section>

        {(data.albums || []).length > 0 && (
          <Section title="Albums">
            {data.albums.map((a, i) => (
              <Row key={i} icon={<BookOpen size={16} />} title={a.title || 'Album'} sub={a.page_count ? `${a.page_count} pages` : ''}
                right={<span className="pub-badge" style={{ textTransform: 'capitalize' }}>{a.status}</span>} />
            ))}
          </Section>
        )}

        <Section title="Invoices" empty={(data.invoices || []).length ? null : 'No invoices yet.'}>
          {(data.invoices || []).map((inv, i) => (
            <Row key={i} icon={<CreditCard size={16} />} title={inv.invoice_number} sub={fmtDate(inv.created_at)}
              right={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <b style={{ fontSize: 14 }}>{money(inv.currency_symbol, inv.total)}</b>
                  {/* Already offered above under "Needs you" — repeating the button
                      here would make one debt look like two. */}
                  <span className={`pub-badge${inv.status === 'paid' ? ' pub-badge--done' : INV_NEEDS_YOU.has(inv.status) ? ' pub-badge--wait' : ''}`} style={{ textTransform: 'capitalize' }}>{inv.status}</span>
                </span>
              } />
          ))}
        </Section>

        {(data.orders || []).length > 0 && (
          <Section title="Orders">
            {data.orders.map((o, i) => (
              <Row key={i} icon={<ShoppingBag size={16} />}
                title={(o.items || []).map((it) => `${it.qty}× ${it.name}`).join(', ') || 'Order'}
                sub={fmtDate(o.created_at)}
                right={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <b style={{ fontSize: 14 }}>{money(o.currency_symbol, o.total)}</b>
                    <span className={`pub-badge${o.status === 'paid' ? ' pub-badge--done' : ''}`} style={{ textTransform: 'capitalize' }}>{o.status}</span>
                  </span>
                } />
            ))}
          </Section>
        )}

        {(data.projects || []).length > 0 && (
          <Section title="Projects">
            {data.projects.map((p, i) => (
              <Row key={i} icon={<Camera size={16} />} title={p.title}
                right={<span className="pub-badge" style={{ textTransform: 'capitalize' }}>{p.status}</span>} />
            ))}
          </Section>
        )}

        <PublicFooter brand={data.brand} style={{ padding: '30px 0 0' }} />
      </div>
    </PublicShell>
  );
}

function Section({ title, children, empty }) {
  return (
    <section className="pub-section">
      <h2 className="pub-h2" style={{ marginBottom: 14 }}>{title}</h2>
      {empty ? <p className="pub-dim" style={{ fontSize: 13.5, margin: 0 }}>{empty}</p>
             : <div style={{ display: 'grid', gap: 9 }}>{children}</div>}
    </section>
  );
}

function Row({ href, icon, title, sub, right, tone }) {
  const inner = (
    <div className="pub-card" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px' }}>
      <span style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center',
        background: tone === 'done' ? 'rgba(16,185,129,0.14)' : 'var(--pub-surface)',
        color: tone === 'done' ? '#34d399' : 'var(--pub-ink-2)',
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {sub && <div className="pub-dim" style={{ fontSize: 12.5, marginTop: 1, textTransform: 'capitalize' }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
  return href ? <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</a> : inner;
}
