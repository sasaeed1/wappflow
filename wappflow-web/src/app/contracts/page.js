'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileSignature, Plus, X, Search, Send, Copy, Trash2, Check,
  Download, Ban, Mail, MessageCircle, FileText, ChevronRight,
} from 'lucide-react';
import { contractsAPI, leadsAPI } from '../../lib/api';
import NavBar from '../../components/ContractsShell';

const STATUS = {
  draft:     { label: 'Draft',     color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' },
  sent:      { label: 'Sent',      color: '#3b82f6', bg: 'rgba(59,130,246,0.14)' },
  viewed:    { label: 'Viewed',    color: '#6366f1', bg: 'rgba(99,102,241,0.14)' },
  signed:    { label: 'Signed',    color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
  completed: { label: 'Completed', color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
  declined:  { label: 'Declined',  color: '#ef4444', bg: 'rgba(239,68,68,0.14)' },
  voided:    { label: 'Voided',    color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' },
};
const Pill = ({ s }) => { const m = STATUS[s] || STATUS.draft; return <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: m.color, background: m.bg, padding: '3px 9px', borderRadius: 999 }}>{m.label}</span>; };
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d + (d.includes('Z') ? '' : 'Z')).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return '—'; } };

export default function ContractsPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/contracts'); return; }
    load();
  }, []);
  const load = async () => { setLoading(true); try { const r = await contractsAPI.list(); setContracts(r.data.contracts || []); } catch {} setLoading(false); };

  const shown = useMemo(() => {
    let list = contracts;
    if (filter !== 'all') list = list.filter(c => filter === 'completed' ? (c.status === 'completed' || c.status === 'signed') : c.status === filter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(c => `${c.title} ${c.signer_name || ''}`.toLowerCase().includes(q));
    return list;
  }, [contracts, filter, query]);

  const counts = useMemo(() => {
    const c = { all: contracts.length, sent: 0, completed: 0 };
    contracts.forEach(k => { if (k.status === 'sent' || k.status === 'viewed') c.sent++; if (k.status === 'signed' || k.status === 'completed') c.completed++; });
    return c;
  }, [contracts]);

  return (
    <NavBar>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}><FileSignature size={14} /> Contracts</div>
            <h1 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text)', margin: 0 }}>E-signatures</h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '6px 0 0', maxWidth: 560 }}>Send legally-binding contracts over WhatsApp &amp; email, signed in the browser — with a full audit trail.</p>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button onClick={() => setShowBulk(true)} style={btnGhost}><Send size={15} /> Bulk send</button>
            <button onClick={() => setShowNew(true)} style={btnPrimary}><Plus size={16} /> New contract</button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 11, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            {[['all', `All ${counts.all}`], ['sent', `Awaiting ${counts.sent}`], ['completed', `Signed ${counts.completed}`], ['draft', 'Drafts']].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} style={{ padding: '7px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', background: filter === k ? 'var(--surface)' : 'transparent', color: filter === k ? 'var(--text)' : 'var(--text-muted)', fontSize: 12.5, fontWeight: filter === k ? 700 : 500 }}>{l}</button>
            ))}
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search contracts…" style={{ width: '100%', height: 40, padding: '0 12px 0 36px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        {loading ? <p style={{ color: 'var(--text-muted)', padding: '30px 0' }}>Loading…</p>
          : contracts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'clamp(50px,10vh,110px) 20px', border: '1px dashed var(--border)', borderRadius: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--accent-light)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FileSignature size={24} /></div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>No contracts yet</h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 auto 20px', maxWidth: 380 }}>Create a contract, send it over WhatsApp or email, and collect a legally-binding e-signature — all in one place.</p>
              <button onClick={() => setShowNew(true)} style={btnPrimary}><Plus size={15} /> New contract</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shown.map(c => (
                <button key={c.id} onClick={() => setOpenId(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 13, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={17} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{c.signer_name || 'No signer'}{c.amount ? ` · ${c.amount}` : ''} · {c.sent_at ? `sent ${fmtDate(c.sent_at)}` : `created ${fmtDate(c.created_at)}`}</div>
                  </div>
                  <Pill s={c.status} />
                  <ChevronRight size={16} color="var(--text-muted)" />
                </button>
              ))}
              {shown.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>No contracts match.</p>}
            </div>
          )}
      </div>

      {showNew && <NewContractModal onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); load(); setOpenId(id); }} say={say} />}
      {showBulk && <BulkSendModal onClose={() => setShowBulk(false)} onSent={() => { setShowBulk(false); load(); }} say={say} />}
      {openId && <DetailModal id={openId} onClose={() => { setOpenId(null); load(); }} say={say} />}
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 700, padding: '10px 18px', borderRadius: 999, background: 'var(--text)', color: 'var(--surface)', fontSize: 13, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>{toast}</div>}
    </NavBar>
  );
}

function NewContractModal({ onClose, onCreated, say }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerPhone, setSignerPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [leadId, setLeadId] = useState('');
  const [leads, setLeads] = useState([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [templates, setTemplates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    leadsAPI.getAll(null).then(r => setLeads(r.data.leads || [])).catch(() => {});
    contractsAPI.templates().then(r => setTemplates(r.data.templates || [])).catch(() => {});
  }, []);
  const filtered = leadSearch ? leads.filter(l => (l.customer_name || '').toLowerCase().includes(leadSearch.toLowerCase())) : leads.slice(0, 6);
  const pickLead = (l) => { setLeadId(l.id); setSignerName(l.customer_name || ''); setSignerEmail(l.email || ''); setSignerPhone(l.customer_phone || ''); setLeadSearch(l.customer_name || ''); };
  const useTemplate = (t) => { setBody(t.body || ''); if (!title) setTitle(t.title); };

  const create = async () => {
    if (!title.trim()) { setErr('Give the contract a title'); return; }
    setSaving(true); setErr('');
    try {
      const r = await contractsAPI.create({ title: title.trim(), body, lead_id: leadId || undefined, signer_name: signerName || undefined, signer_email: signerEmail || undefined, signer_phone: signerPhone || undefined, amount: amount ? Number(amount) : undefined });
      onCreated(r.data.id);
    } catch (e) { setErr(e.response?.data?.error || 'Could not create'); setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>New contract</h2>
        <button onClick={onClose} style={iconBtn}><X size={18} /></button>
      </div>
      {templates.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Template:</span>
          {templates.map(t => <button key={t.id} onClick={() => useTemplate(t)} style={chip}>{t.title}</button>)}
        </div>
      )}
      <Label>Title</Label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Wedding Photography Agreement" style={input} autoFocus />
      <Label>Client</Label>
      <div style={{ position: 'relative', marginBottom: 6 }}>
        <Search size={14} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-muted)' }} />
        <input value={leadSearch} onChange={e => setLeadSearch(e.target.value)} placeholder="Link a client…" style={{ ...input, paddingLeft: 34, marginBottom: 0 }} />
      </div>
      {leadSearch && !leadId && filtered.length > 0 && (
        <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 9, marginBottom: 10 }}>
          {filtered.map(l => <button key={l.id} onClick={() => pickLead(l)} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>{l.customer_name || 'Unnamed'}</button>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <div style={{ flex: 1 }}><Label>Signer name</Label><input value={signerName} onChange={e => setSignerName(e.target.value)} style={input} /></div>
        <div style={{ flex: 1 }}><Label>Amount (optional)</Label><input value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 1500" style={input} /></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Label>Signer email</Label><input value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="for email delivery" style={input} /></div>
        <div style={{ flex: 1 }}><Label>Signer phone</Label><input value={signerPhone} onChange={e => setSignerPhone(e.target.value)} placeholder="for WhatsApp" style={input} /></div>
      </div>
      <Label>Contract body</Label>
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={7} placeholder="Type your terms… Use {{client_name}}, {{date}} and {{amount}} as merge fields." style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '-4px 0 14px' }}>Merge fields: <code>{'{{client_name}}'}</code>, <code>{'{{date}}'}</code>, <code>{'{{amount}}'}</code></p>
      {err && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 12px' }}>{err}</p>}
      <button onClick={create} disabled={saving} style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}>{saving ? 'Creating…' : 'Create draft'}</button>
    </Overlay>
  );
}

function DetailModal({ id, onClose, say }) {
  const [c, setC] = useState(null);
  const [busy, setBusy] = useState(false);
  const [channels, setChannels] = useState({ whatsapp: true, email: false });
  const load = async () => { try { const r = await contractsAPI.get(id); setC(r.data); } catch { onClose(); } };
  useEffect(() => { load(); }, [id]);

  const send = async () => {
    const chs = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
    if (!chs.length) { say('Pick at least one channel'); return; }
    setBusy(true);
    try { const r = await contractsAPI.send(id, chs); const d = r.data.delivery || {};
      say(`Sent${d.whatsapp === 'sent' ? ' · WhatsApp ✓' : ''}${d.email === 'sent' ? ' · Email ✓' : d.email === 'not_configured' ? ' · email SMTP not set' : ''}`);
      await load();
    } catch (e) { say(e.response?.data?.error || 'Send failed'); }
    setBusy(false);
  };
  const copyLink = () => { if (c?.sign_url) { try { navigator.clipboard.writeText(c.sign_url); say('Sign link copied'); } catch {} } };
  const voidIt = async () => { if (!window.confirm('Void this contract? It can no longer be signed.')) return; setBusy(true); try { await contractsAPI.voidContract(id); await load(); say('Voided'); } catch {} setBusy(false); };
  const del = async () => { if (!window.confirm('Delete this contract permanently?')) return; try { await contractsAPI.remove(id); onClose(); } catch {} };
  const downloadPdf = async () => {
    try { const r = await contractsAPI.downloadPdf(id); const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = `${c.title}-signed.pdf`; a.click(); URL.revokeObjectURL(url); }
    catch { say('No signed PDF yet'); }
  };

  if (!c) return <Overlay onClose={onClose}><p style={{ color: 'var(--text-muted)' }}>Loading…</p></Overlay>;
  const closed = ['signed', 'completed', 'voided', 'declined'].includes(c.status);
  return (
    <Overlay onClose={onClose} wide>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{c.title}</h2><Pill s={c.status} /></div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{c.signer_name || 'No signer'}{c.signer_email ? ` · ${c.signer_email}` : ''}{c.amount ? ` · ${c.amount}` : ''}</p></div>
        <button onClick={onClose} style={iconBtn}><X size={18} /></button>
      </div>

      {/* send / actions */}
      {!closed && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, margin: '14px 0' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Send for signature</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <ChanToggle on={channels.whatsapp} onClick={() => setChannels(s => ({ ...s, whatsapp: !s.whatsapp }))} icon={<MessageCircle size={14} />} label="WhatsApp" />
            <ChanToggle on={channels.email} onClick={() => setChannels(s => ({ ...s, email: !s.email }))} icon={<Mail size={14} />} label="Email" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={send} disabled={busy} style={btnPrimary}><Send size={14} /> {c.status === 'draft' ? 'Send' : 'Resend'}</button>
            {c.sign_url && <button onClick={copyLink} style={btnGhost}><Copy size={14} /> Copy link</button>}
            <button onClick={voidIt} disabled={busy} style={{ ...btnGhost, marginLeft: 'auto' }}><Ban size={14} /> Void</button>
            {c.status === 'draft' && <button onClick={del} style={{ ...btnGhost, color: '#ef4444' }}><Trash2 size={14} /></button>}
          </div>
        </div>
      )}
      {(c.status === 'signed' || c.status === 'completed') && (
        <div style={{ border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.08)', borderRadius: 12, padding: 14, margin: '14px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Check size={18} color="#10b981" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Signed by {c.signed_typed_name || c.signer_name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', wordBreak: 'break-all' }}>SHA-256: {c.doc_hash}</div>
          </div>
          {c.has_signed_pdf && <button onClick={downloadPdf} style={btnPrimary}><Download size={14} /> Signed PDF</button>}
        </div>
      )}

      {/* audit trail */}
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', margin: '6px 0 8px' }}>Audit trail</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderLeft: '2px solid var(--border)', paddingLeft: 14, marginBottom: 14 }}>
        {(c.events || []).map((e, i) => (
          <div key={i} style={{ position: 'relative', paddingBottom: 12 }}>
            <span style={{ position: 'absolute', left: -20, top: 3, width: 9, height: 9, borderRadius: 999, background: 'var(--accent)' }} />
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>{e.type}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(e.created_at)} {e.ip ? `· IP ${e.ip}` : ''}</div>
          </div>
        ))}
        {(!c.events || c.events.length === 0) && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No activity yet.</span>}
      </div>

      {/* body preview */}
      <details>
        <summary style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>Contract text</summary>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.55, marginTop: 10, maxHeight: 240, overflowY: 'auto' }}>{c.body || '—'}</div>
      </details>
    </Overlay>
  );
}

function BulkSendModal({ onClose, onSent, say }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState([]);
  const [leads, setLeads] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [channels, setChannels] = useState({ whatsapp: true, email: false });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    leadsAPI.getAll(null).then(r => setLeads(r.data.leads || [])).catch(() => {});
    contractsAPI.templates().then(r => setTemplates(r.data.templates || [])).catch(() => {});
  }, []);
  const filtered = q ? leads.filter(l => (l.customer_name || '').toLowerCase().includes(q.toLowerCase())) : leads.slice(0, 40);
  const toggle = (id) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pickTemplate = (id) => { setTemplateId(id); const t = templates.find(x => x.id === id); if (t) { setBody(t.body || ''); if (!title) setTitle(t.title); } };

  const send = async () => {
    if (!title.trim()) { setErr('Give the contract a title'); return; }
    if (picked.size === 0) { setErr('Pick at least one client'); return; }
    const chs = Object.entries(channels).filter(([, v]) => v).map(([k]) => k);
    if (!chs.length) { setErr('Pick a channel'); return; }
    setSending(true); setErr('');
    try { const r = await contractsAPI.bulkSend({ title: title.trim(), body, template_id: templateId || undefined, lead_ids: Array.from(picked), channels: chs }); say(`Sent to ${r.data.sent} client${r.data.sent === 1 ? '' : 's'}`); onSent(); }
    catch (e) { setErr(e.response?.data?.error || 'Bulk send failed'); setSending(false); }
  };

  return (
    <Overlay onClose={onClose} wide>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Bulk send</h2>
        <button onClick={onClose} style={iconBtn}><X size={18} /></button>
      </div>
      <Label>Title</Label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 2026 Booking Agreement" style={input} />
      {templates.length > 0 && (
        <>
          <Label>Template</Label>
          <select value={templateId} onChange={e => pickTemplate(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
            <option value="">— Blank / custom body —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </>
      )}
      {!templateId && <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="Contract body (merge fields auto-fill per client)…" style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />}
      <Label>Send to ({picked.size} selected)</Label>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <Search size={14} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-muted)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients…" style={{ ...input, paddingLeft: 34, marginBottom: 0 }} />
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12 }}>
        {filtered.map(l => (
          <button key={l.id} onClick={() => toggle(l.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: picked.has(l.id) ? 'var(--accent-light)' : 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${picked.has(l.id) ? 'var(--accent)' : 'var(--border)'}`, background: picked.has(l.id) ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{picked.has(l.id) && <Check size={12} color="#fff" />}</span>
            <span style={{ flex: 1 }}>{l.customer_name || 'Unnamed'}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.email ? 'email' : ''}{l.email && l.customer_phone ? ' · ' : ''}{l.customer_phone ? 'phone' : ''}</span>
          </button>
        ))}
        {filtered.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: 12, margin: 0 }}>No clients found.</p>}
      </div>
      <Label>Channels</Label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <ChanToggle on={channels.whatsapp} onClick={() => setChannels(s => ({ ...s, whatsapp: !s.whatsapp }))} icon={<MessageCircle size={14} />} label="WhatsApp" />
        <ChanToggle on={channels.email} onClick={() => setChannels(s => ({ ...s, email: !s.email }))} icon={<Mail size={14} />} label="Email" />
      </div>
      {err && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 12px' }}>{err}</p>}
      <button onClick={send} disabled={sending} style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}><Send size={15} /> {sending ? 'Sending…' : `Send to ${picked.size || ''} client${picked.size === 1 ? '' : 's'}`}</button>
    </Overlay>
  );
}

function Overlay({ children, onClose, wide }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: wide ? 560 : 480, maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 24, boxShadow: '0 30px 80px rgba(0,0,0,0.4)' }}>{children}</div>
    </div>
  );
}
const ChanToggle = ({ on, onClick, icon, label }) => (
  <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>{on ? <Check size={14} /> : icon} {label}</button>
);
const Label = ({ children }) => <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '10px 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{children}</label>;
const input = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', marginBottom: 4 };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700 };
const btnGhost = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 13px', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600 };
const iconBtn = { width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const chip = { padding: '5px 11px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer' };
