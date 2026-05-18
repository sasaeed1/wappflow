'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Filter, ChevronRight, Plus, Download,
  Users, MessageSquare, Phone, Calendar, TrendingUp,
  DollarSign, ArrowUpDown, X, CheckSquare, Square,
  UserCheck, ChevronDown, Tag as TagIcon, RotateCcw,
  MessageCircle, Camera, Globe, MonitorSmartphone, Layers,
  Trash2, UsersRound, Image as ImageIcon, AlertTriangle
} from 'lucide-react';
import { leadsAPI, tagsAPI, workspaceAPI, displayPhone, PLATFORM_COLORS, platformAccountsAPI, whatsappGroupsAPI } from '../../lib/api';
import NavBar from '../../components/NavBar';
import { TagChip, TagPicker } from '../../components/TagPicker';
import AddLeadModal from '../../components/AddLeadModal';
import { useConfirm } from '@/lib/confirm';

const STATUS_META = {
  'New':           { dot: '#6366f1', bg: 'rgba(99,102,241,0.12)',  text: '#4338ca' },
  'Contacted':     { dot: '#06b6d4', bg: 'rgba(6,182,212,0.10)',  text: '#0e7490' },
  'Interested':    { dot: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  text: '#b45309' },
  'Negotiating':   { dot: '#f97316', bg: 'rgba(249,115,22,0.10)',  text: '#c2410c' },
  'Closed - Won':  { dot: '#10b981', bg: 'rgba(16,185,129,0.10)',  text: '#047857' },
  'Closed - Lost': { dot: '#ef4444', bg: 'rgba(239,68,68,0.12)',  text: '#b91c1c' },
};
const ALL_STATUSES = ['All', 'New', 'Contacted', 'Interested', 'Negotiating', 'Closed - Won', 'Closed - Lost'];
const SORT_OPTIONS = [
  { value: 'last_message_at_desc', label: 'Last Active' },
  { value: 'created_at_desc',      label: 'Newest First' },
  { value: 'created_at_asc',       label: 'Oldest First' },
  { value: 'name_asc',             label: 'Name A-Z' },
  { value: 'value_desc',           label: 'Highest Value' },
];

// ── Bulk Assign Modal ───────────────────────────────────────────────────────
function BulkAssignModal({ leadIds, members, onClose, onDone }) {
  const confirm = useConfirm();
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('manual'); // 'manual' | 'round_robin'
  // For round robin: set of user_ids to include (null = all)
  const activeMembers = members.filter(m => m.user_id);
  const [rrSelected, setRrSelected] = useState(() => new Set(activeMembers.map(m => m.user_id)));

  const toggleRr = (userId) => {
    setRrSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const handleAssign = async () => {
    if (mode === 'manual' && !selected) return;
    if (mode === 'round_robin' && rrSelected.size === 0) {
      await confirm({ title: 'Pick at least one teammate', message: 'Select at least one member to distribute leads to.', alertOnly: true, tone: 'warning' });
      return;
    }
    setLoading(true);
    try {
      if (mode === 'round_robin') {
        const userIds = rrSelected.size === activeMembers.length ? undefined : Array.from(rrSelected);
        await leadsAPI.roundRobin(leadIds, userIds);
      } else {
        await leadsAPI.bulkAssign(leadIds, selected);
      }
      onDone();
    } catch (e) {
      await confirm({ title: 'Assignment failed', message: e.response?.data?.error || 'Unknown error', alertOnly: true, tone: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCheck size={20} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Assign Leads</h2>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>{leadIds.length} lead{leadIds.length > 1 ? 's' : ''} selected</p>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'var(--surface2)', borderRadius: 10, padding: 4 }}>
          {[['manual', 'Assign to Member'], ['round_robin', 'Round Robin']].map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
              background: mode === m ? 'var(--surface)' : 'transparent',
              color: mode === m ? 'var(--text)' : 'var(--text-dim)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
            }}>{label}</button>
          ))}
        </div>

        {mode === 'manual' ? (
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Select Team Member</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
              <button
                onClick={() => setSelected('')}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${selected === '' ? '#6366f1' : 'var(--border)'}`, background: selected === '' ? 'rgba(99,102,241,0.12)' : 'var(--surface2)', cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={12} color="var(--text-dim)" />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Unassign</span>
              </button>
              {members.map(m => {
                const name = m.full_name || m.invite_email || m.email || 'Member';
                const color = { super_admin: '#f59e0b', admin: '#6366f1', manager: '#06b6d4', user: '#10b981' }[m.role] || '#6366f1';
                return (
                  <button key={m.id} onClick={() => setSelected(m.user_id || m.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                    border: `1.5px solid ${selected === (m.user_id || m.id) ? '#6366f1' : 'var(--border)'}`,
                    background: selected === (m.user_id || m.id) ? 'rgba(99,102,241,0.12)' : 'var(--surface2)', cursor: 'pointer', textAlign: 'left'
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color }}>
                      {name[0].toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{m.role?.replace('_', ' ')}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <RotateCcw size={16} color="#6366f1" />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Round Robin</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>
                {rrSelected.size}/{activeMembers.length} selected
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Select which members to include. Leads will be distributed evenly among them.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {activeMembers.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', padding: '16px 0' }}>No active members found</p>
              ) : activeMembers.map(m => {
                const name = m.full_name || m.invite_email || m.email || 'Member';
                const userId = m.user_id;
                const isOn = rrSelected.has(userId);
                const color = { super_admin: '#f59e0b', admin: '#6366f1', manager: '#06b6d4', user: '#10b981' }[m.role] || '#6366f1';
                return (
                  <button key={userId} onClick={() => toggleRr(userId)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
                    border: `1.5px solid ${isOn ? '#6366f1' : 'var(--border)'}`,
                    background: isOn ? 'rgba(99,102,241,0.12)' : 'var(--surface2)', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.15s'
                  }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color, flexShrink: 0 }}>
                      {name[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{m.role?.replace('_', ' ')}</p>
                    </div>
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, border: `2px solid ${isOn ? '#6366f1' : 'var(--border)'}`,
                      background: isOn ? '#6366f1' : 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      {isOn && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  </button>
                );
              })}
            </div>
            {activeMembers.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => setRrSelected(new Set(activeMembers.map(m => m.user_id)))} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>
                  Select All
                </button>
                <span style={{ color: 'var(--border)', fontSize: 11 }}>·</span>
                <button onClick={() => setRrSelected(new Set())} style={{ fontSize: 11, color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', border: '1.5px solid var(--border)', borderRadius: 11, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={handleAssign} disabled={loading || (mode === 'manual' && selected === null)} style={{
            flex: 2, padding: '11px', background: loading ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
            border: 'none', borderRadius: 11, color: 'white', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}>
            {loading ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Assigning…</> : <><UserCheck size={15} /> Assign {leadIds.length} Lead{leadIds.length > 1 ? 's' : ''}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Trash Confirm Modal ────────────────────────────────────────────────
function BulkTrashModal({ count, loading, onCancel, onConfirm }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 250, padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,0.4)', maxWidth: 440, width: '100%', padding: 28, border: '1.5px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={22} color="#ef4444" />
          </div>
          <div>
            <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Move {count} lead{count === 1 ? '' : 's'} to Trash?</p>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Restorable within 90 days from the Trash page.</p>
          </div>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 22, lineHeight: 1.5 }}>
          These leads will be hidden from the active pipeline and analytics. Their messages, notes, and history are preserved.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={loading} style={{ flex: 1, padding: '11px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 12, background: loading ? '#9ca3af' : '#ef4444', color: 'white', fontWeight: 700, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {loading ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Moving…</> : <><Trash2 size={14} /> Move to Trash</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create WhatsApp Group Modal ─────────────────────────────────────────────
// Three-step flow: pick eligible leads → choose WA account → name+icon
function CreateGroupModal({ selectedLeads, onClose, onDone, onError }) {
  const [step, setStep] = useState(1);          // 1=review, 2=name, 3=created (show invite)
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState(null);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);   // { group_id, invite_link, added_count, skipped, ineligible }

  // Partition the selection into "real WA numbers" vs "platform IDs / no phone"
  const { eligible, ineligible } = (() => {
    const e = [], i = [];
    for (const l of selectedLeads) {
      const p = String(l.customer_phone || '').trim();
      const digits = p.replace(/\D/g, '');
      const hasJid = p.includes('@');
      if (hasJid || (digits.length >= 7 && digits.length <= 15)) e.push(l);
      else i.push(l);
    }
    return { eligible: e, ineligible: i };
  })();

  useEffect(() => {
    whatsappGroupsAPI.readyAccounts()
      .then(r => {
        const acc = r.data?.accounts || [];
        setAccounts(acc);
        // Auto-select the first ready account
        if (acc.length > 0) setAccountId(acc[0].accountId);
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, []);

  const handleIconChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { onError?.('Icon must be an image'); return; }
    if (f.size > 2 * 1024 * 1024) { onError?.('Icon must be under 2 MB'); return; }
    setIconFile(f);
    const reader = new FileReader();
    reader.onload = ev => setIconPreview(ev.target?.result);
    reader.readAsDataURL(f);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (eligible.length === 0) { onError?.('No eligible leads — all selected leads lack a real phone number'); return; }
    setCreating(true);
    try {
      const res = await whatsappGroupsAPI.create({
        name: name.trim(),
        description: description.trim() || undefined,
        lead_ids: eligible.map(l => l.id),
        account_id: accountId || undefined,
      });
      const data = res.data;
      setResult(data);

      // Upload icon as a follow-up PATCH if provided
      if (iconFile && data.group_id) {
        try {
          const fd = new FormData();
          fd.append('icon', iconFile);
          if (accountId) fd.append('account_id', accountId);
          await whatsappGroupsAPI.update(data.group_id, fd);
        } catch (e) { console.warn('Icon upload failed:', e?.response?.data?.error || e.message); }
      }

      setStep(3);
    } catch (e) {
      onError?.(e.response?.data?.error || e.message || 'Group creation failed');
    } finally { setCreating(false); }
  };

  // Step 3 = success screen with invite link / skipped summary
  const Backdrop = ({ children }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 250, padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,0.4)', maxWidth: 540, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1.5px solid var(--border)' }}>
        {children}
      </div>
    </div>
  );

  return (
    <Backdrop>
      <div style={{ padding: 28 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg, #25d366, #128c7e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UsersRound size={22} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Create WhatsApp Group</p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>
              {step === 1 && `${eligible.length} of ${selectedLeads.length} selected lead${selectedLeads.length === 1 ? '' : 's'} can be added`}
              {step === 2 && 'Set the group name, description, and icon'}
              {step === 3 && 'Group created successfully'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer' }}>
            <X size={18} color="var(--text-muted)" />
          </button>
        </div>

        {/* Step 1 — review members + account picker */}
        {step === 1 && (
          <>
            {/* Eligible leads */}
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                Members to add ({eligible.length})
              </p>
              {eligible.length === 0 ? (
                <div style={{ padding: 14, background: 'rgba(239,68,68,0.10)', border: '1.5px solid rgba(239,68,68,0.3)', borderRadius: 12, fontSize: 13, color: '#dc2626' }}>
                  None of the selected leads have a real WhatsApp phone number. Instagram/Facebook/website leads can't be added to WhatsApp groups directly.
                </div>
              ) : (
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface2)' }}>
                  {eligible.map(l => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: '#25d36622', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#16a34a', flexShrink: 0 }}>
                        {(l.customer_name||'?')[0]?.toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.customer_name || 'Unknown'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{displayPhone(l.customer_phone, l.platform_source)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ineligible warning */}
            {ineligible.length > 0 && (
              <div style={{ marginBottom: 18, padding: 12, background: 'rgba(245,158,11,0.10)', border: '1.5px solid rgba(245,158,11,0.3)', borderRadius: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#b45309', margin: '0 0 6px' }}>
                  {ineligible.length} lead{ineligible.length === 1 ? '' : 's'} skipped — no real WhatsApp number
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  {ineligible.slice(0, 3).map(l => l.customer_name || 'Unknown').join(', ')}{ineligible.length > 3 ? ` and ${ineligible.length - 3} more` : ''}
                </p>
              </div>
            )}

            {/* Account picker */}
            <div style={{ marginBottom: 22 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                Send from
              </p>
              {loadingAccounts ? (
                <div style={{ padding: 14, background: 'var(--surface2)', borderRadius: 12, fontSize: 13, color: 'var(--text-dim)' }}>Loading connected WhatsApp accounts…</div>
              ) : accounts.length === 0 ? (
                <div style={{ padding: 14, background: 'rgba(239,68,68,0.10)', border: '1.5px solid rgba(239,68,68,0.3)', borderRadius: 12, fontSize: 13, color: '#dc2626' }}>
                  No connected WhatsApp account is ready. Connect WhatsApp in Settings → Connections first.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {accounts.map(a => {
                    const sel = accountId === a.accountId;
                    return (
                      <button key={a.key} onClick={() => setAccountId(a.accountId)} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                        borderRadius: 12, border: `2px solid ${sel ? '#25d366' : 'var(--border)'}`,
                        background: sel ? 'rgba(37,211,102,0.10)' : 'var(--surface)',
                        cursor: 'pointer', textAlign: 'left',
                      }}>
                        <MessageCircle size={16} color="#25d366" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                            {a.nickname || a.account_name || 'WhatsApp'}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>
                            {a.phoneNumber ? `+${a.phoneNumber}` : 'Connected'}
                          </p>
                        </div>
                        {sel && <CheckSquare size={16} color="#25d366" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '12px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={() => setStep(2)}
                disabled={eligible.length === 0 || accounts.length === 0}
                style={{
                  flex: 2, padding: '12px', border: 'none', borderRadius: 12,
                  background: (eligible.length === 0 || accounts.length === 0) ? 'var(--border)' : 'linear-gradient(135deg, #25d366, #128c7e)',
                  color: 'white', fontWeight: 700, cursor: (eligible.length === 0 || accounts.length === 0) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                Continue <ChevronRight size={15} />
              </button>
            </div>
          </>
        )}

        {/* Step 2 — name, description, icon */}
        {step === 2 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Group Name *</label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Bahria Town Buyers — May Cohort"
                  maxLength={50}
                  style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }}
                />
                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>{name.length}/50 characters</p>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Description (optional)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="What is this group for? Members can read this in WhatsApp."
                  style={{ width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Group Icon (optional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, background: iconPreview ? `url(${iconPreview}) center/cover` : 'var(--surface2)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {!iconPreview && <ImageIcon size={22} color="var(--text-dim)" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <label htmlFor="group-icon-upload" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      <ImageIcon size={13} /> {iconPreview ? 'Change icon' : 'Upload icon'}
                    </label>
                    <input id="group-icon-upload" type="file" accept="image/*" onChange={handleIconChange} style={{ display: 'none' }} />
                    <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>JPG / PNG, square works best, max 2 MB.</p>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} disabled={creating} style={{ flex: 1, padding: '12px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Back</button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || creating}
                style={{
                  flex: 2, padding: '12px', border: 'none', borderRadius: 12,
                  background: (!name.trim() || creating) ? 'var(--border)' : 'linear-gradient(135deg, #25d366, #128c7e)',
                  color: 'white', fontWeight: 700, cursor: (!name.trim() || creating) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {creating ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Creating group…</> : <><UsersRound size={15} /> Create Group</>}
              </button>
            </div>
          </>
        )}

        {/* Step 3 — success */}
        {step === 3 && result && (
          <>
            <div style={{ textAlign: 'center', padding: '14px 0 22px' }}>
              <div style={{ width: 60, height: 60, borderRadius: 18, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <UsersRound size={28} color="#10b981" />
              </div>
              <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>Group created</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                Added {result.added_count} member{result.added_count === 1 ? '' : 's'} to <strong>{name}</strong>
              </p>
            </div>

            {result.invite_link && (
              <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, border: '1.5px solid var(--border)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 6px' }}>Invite Link</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.invite_link}</code>
                  <button onClick={() => { navigator.clipboard?.writeText(result.invite_link); onDone?.('Invite link copied'); }} style={{ padding: '6px 12px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Copy</button>
                </div>
              </div>
            )}

            {result.skipped?.length > 0 && (
              <div style={{ background: 'rgba(245,158,11,0.10)', borderRadius: 12, padding: '12px 14px', marginBottom: 18, border: '1.5px solid rgba(245,158,11,0.3)' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#b45309', margin: '0 0 6px' }}>
                  {result.skipped.length} number{result.skipped.length === 1 ? '' : 's'} skipped during invite
                </p>
                <ul style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, paddingLeft: 18 }}>
                  {result.skipped.slice(0, 4).map((s, i) => (
                    <li key={i}>{s.phone} — {s.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={() => onDone?.(`Group "${name}" created with ${result.added_count} member${result.added_count === 1 ? '' : 's'}`)} style={{ width: '100%', padding: '12px', border: 'none', borderRadius: 12, background: 'linear-gradient(135deg, #25d366, #128c7e)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              Done
            </button>
          </>
        )}
      </div>
    </Backdrop>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function LeadsListPage() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [tagFilter, setTagFilter] = useState(null);
  const [assignedFilter, setAssignedFilter] = useState('all'); // 'all' | 'mine' | 'unassigned' | memberId
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('last_message_at_desc');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [platformFilter, setPlatformFilter] = useState(null); // null = all
  const [accountFilter, setAccountFilter] = useState(null);
  const [platformAccounts, setPlatformAccounts] = useState([]);

  // Selection state
  const [selected, setSelected] = useState(new Set());
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showTrashConfirm, setShowTrashConfirm] = useState(false);
  const [bulkTrashing, setBulkTrashing] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => { setToast({ msg, type, ts: Date.now() }); setTimeout(() => setToast(t => (t && t.ts) ? null : t), 3500); };
  // Auto-clear toast
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3500); return () => clearTimeout(id); }, [toast]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    const params = new URLSearchParams(window.location.search);
    const pf = params.get('platform');
    const ac = params.get('account');
    if (pf) setPlatformFilter(pf);
    if (ac) setAccountFilter(ac);
    fetchAll(pf, ac);
    platformAccountsAPI.getAll().then(r => setPlatformAccounts(r.data.accounts || [])).catch(() => {});
  }, []);

  useEffect(() => { applyFilters(); }, [search, statusFilter, tagFilter, sortBy, assignedFilter, dateFrom, dateTo, allLeads]);

  const fetchAll = async (pf, ac) => {
    try {
      const params = {};
      if (pf && pf !== 'all') params.platform = pf;
      if (ac) params.account_id = ac;
      const [leadsRes, tagsRes, wsRes] = await Promise.allSettled([
        leadsAPI.getAll(Object.keys(params).length ? params : null),
        tagsAPI.getAll(),
        workspaceAPI.get(),
      ]);
      if (leadsRes.status === 'fulfilled') setAllLeads(leadsRes.value.data.leads || []);
      if (tagsRes.status === 'fulfilled') setAllTags(tagsRes.value.data.tags || []);
      if (wsRes.status === 'fulfilled') setMembers((wsRes.value.data.members || []).filter(m => m.invite_status === 'active' && m.user_id));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleTagToggle = async (leadId, tag, isAssigned) => {
    try {
      if (isAssigned) await tagsAPI.remove(leadId, tag.id);
      else await tagsAPI.assign(leadId, tag.id);
      setAllLeads(prev => prev.map(l => l.id !== leadId ? l : {
        ...l, tags: isAssigned ? (l.tags||[]).filter(t => t.id !== tag.id) : [...(l.tags||[]), tag]
      }));
    } catch (e) { console.error(e); }
  };

  const applyFilters = () => {
    let filtered = [...allLeads];
    if (statusFilter !== 'All') filtered = filtered.filter(l => l.status === statusFilter);
    if (tagFilter) filtered = filtered.filter(l => (l.tags||[]).some(t => t.id === tagFilter));

    // Assignment filter
    const me = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user')||'{}').id : null;
    if (assignedFilter === 'mine') filtered = filtered.filter(l => l.assigned_to === me);
    else if (assignedFilter === 'unassigned') filtered = filtered.filter(l => !l.assigned_to);
    else if (assignedFilter !== 'all') filtered = filtered.filter(l => l.assigned_to === assignedFilter);

    // Date range filter
    if (dateFrom) filtered = filtered.filter(l => new Date(l.created_at) >= new Date(dateFrom));
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23,59,59);
      filtered = filtered.filter(l => new Date(l.created_at) <= end);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(l => l.customer_name?.toLowerCase().includes(q) || l.customer_phone?.includes(q) || l.status?.toLowerCase().includes(q));
    }
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'created_at_asc':  return new Date(a.created_at) - new Date(b.created_at);
        case 'created_at_desc': return new Date(b.created_at) - new Date(a.created_at);
        case 'name_asc':        return (a.customer_name||'').localeCompare(b.customer_name||'');
        case 'value_desc':      return ((b.actual_sale||b.estimated_value||0)-(a.actual_sale||a.estimated_value||0));
        default:                return new Date(b.last_message_at) - new Date(a.last_message_at);
      }
    });
    setLeads(filtered);
  };

  const memberById = (id) => members.find(m => m.user_id === id);
  const statusCounts = ALL_STATUSES.reduce((acc,s) => { acc[s] = s==='All' ? allLeads.length : allLeads.filter(l=>l.status===s).length; return acc; }, {});

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    if (selected.size === leads.length && leads.length > 0) setSelected(new Set());
    else setSelected(new Set(leads.map(l => l.id)));
  };
  const clearSelection = () => setSelected(new Set());

  const handleAssignDone = () => {
    setShowAssignModal(false);
    clearSelection();
    fetchAll();
  };

  const hasFilters = tagFilter || assignedFilter !== 'all' || dateFrom || dateTo || statusFilter !== 'All';

  return (
    <NavBar>
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Platform filter banner */}
      {platformFilter && (() => {
        const PMETA = { whatsapp: { label: 'WhatsApp', color: '#25d366', Icon: MessageCircle }, instagram: { label: 'Instagram', color: '#e1306c', Icon: Camera }, facebook: { label: 'Facebook', color: '#1877f2', Icon: MonitorSmartphone }, website: { label: 'Website', color: '#6366f1', Icon: Globe } };
        const pm = PMETA[platformFilter] || { label: platformFilter, color: '#6366f1', Icon: Layers };
        const accountName = accountFilter ? (platformAccounts.find(a => a.id === accountFilter)?.account_name || '') : '';
        return (
          <div style={{ background: pm.color + '12', borderBottom: `2px solid ${pm.color}30`, padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <pm.Icon size={16} color={pm.color} />
            <span style={{ fontSize: 13, fontWeight: 700, color: pm.color }}>Filtering by: {pm.label}{accountName ? ` — ${accountName}` : ''}</span>
            <button onClick={() => { setPlatformFilter(null); setAccountFilter(null); window.history.replaceState({}, '', '/leads-list'); fetchAll(null, null); }} style={{ marginLeft: 'auto', padding: '4px 12px', border: `1px solid ${pm.color}40`, borderRadius: 8, background: 'transparent', color: pm.color, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <X size={12} /> Clear filter
            </button>
          </div>
        );
      })()}

      {/* Page header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users style={{ width: 14, height: 14, color: 'white' }} />
          </div>
          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{platformFilter ? `${platformFilter.charAt(0).toUpperCase() + platformFilter.slice(1)} Leads` : 'All Leads'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.12)', border: '1px solid #c7d2fe', padding: '2px 10px', borderRadius: 20 }}>{allLeads.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Export */}
          <button
            onClick={() => {
              const exportRows = leads.map(l => [l.customer_name||'', displayPhone(l.customer_phone||''), l.email||'', l.status||'', l.lead_source||'', (l.tags||[]).map(t=>t.name).join('; '), l.estimated_value||'', l.actual_sale||'', l.address||'', l.created_at||'']);
              const headers = ['Name','Phone','Email','Status','Source','Tags','Estimated Value','Actual Sale','Address','Created'];
              const escape = v => { const s = v==null?'':String(v); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
              const csv = [headers.join(','), ...exportRows.map(r => r.map(escape).join(','))].join('\n');
              const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href=url; a.download=`leads-${new Date().toISOString().slice(0,10)}.csv`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            }}
            disabled={leads.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: leads.length ? 'rgba(16,185,129,0.10)' : 'var(--surface2)', border: `1.5px solid ${leads.length ? '#a7f3d0' : 'var(--border)'}`, borderRadius: 10, color: leads.length ? '#059669' : 'var(--text-dim)', fontSize: 13, fontWeight: 700, cursor: leads.length ? 'pointer' : 'not-allowed' }}
          >
            <Download style={{ width: 14, height: 14 }} /> Export CSV {leads.length > 0 && `(${leads.length})`}
          </button>
          <button onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: 'none', borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}>
            <Plus style={{ width: 15, height: 15 }} /> New Lead
          </button>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px' }}>

        {/* Bulk action bar — shown when items selected */}
        {selected.size > 0 && (
          <div style={{ background: '#1e1b4b', borderRadius: 14, padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
              {selected.size} lead{selected.size > 1 ? 's' : ''} selected
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowAssignModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#6366f1', border: 'none', borderRadius: 9, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <UserCheck size={14} /> Assign
            </button>
            <button
              onClick={() => setShowGroupModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#16a34a', border: 'none', borderRadius: 9, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              title="Create a WhatsApp group with the selected leads"
            >
              <UsersRound size={14} /> WhatsApp Group
            </button>
            <button onClick={() => {
              const exportRows = leads.filter(l => selected.has(l.id)).map(l => [l.customer_name||'', displayPhone(l.customer_phone||''), l.status||'', l.created_at||'']);
              const csv = ['Name,Phone,Status,Created', ...exportRows.map(r => r.join(','))].join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='selected-leads.csv'; a.click();
            }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#312e81', border: 'none', borderRadius: 9, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Download size={14} /> Export Selected
            </button>
            <button
              onClick={() => setShowTrashConfirm(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#dc2626', border: 'none', borderRadius: 9, color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              title="Move selected leads to trash"
            >
              <Trash2 size={14} /> Move to Trash
            </button>
            <button onClick={clearSelection} style={{ padding: '7px 12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 9, color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Filters row */}
        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {/* Search */}
          <div style={{ position: 'relative', minWidth: 220, flex: 1 }}>
            <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: 'var(--text-dim)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, status..."
              style={{ width: '100%', padding: '8px 12px 8px 34px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, outline: 'none', color: 'var(--text)', background: 'var(--surface2)', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor='#6366f1'} onBlur={e => e.target.style.borderColor='var(--border)'}
            />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={13} /></button>}
          </div>

          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)', background: 'var(--surface2)', cursor: 'pointer', outline: 'none' }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {/* Assignment filter */}
          <select value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)} style={{ padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)', background: 'var(--surface2)', cursor: 'pointer', outline: 'none' }}>
            <option value="all">All Assigned</option>
            <option value="mine">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
            {members.map(m => <option key={m.id} value={m.user_id}>{m.full_name || m.invite_email || 'Member'}</option>)}
          </select>

          {/* Date range toggle */}
          <button onClick={() => setShowFilters(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: `1.5px solid ${hasFilters ? '#c7d2fe' : 'var(--border)'}`, borderRadius: 10, background: hasFilters ? 'rgba(99,102,241,0.12)' : 'var(--surface)', color: hasFilters ? '#6366f1' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Filter size={13} /> Filters {hasFilters && <span style={{ fontSize: 10, background: '#6366f1', color: 'white', borderRadius: '50%', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>!</span>}
          </button>

          {leads.length !== allLeads.length && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>Showing {leads.length} of {allLeads.length}</span>
          )}
        </div>

        {/* Extended filters */}
        {showFilters && (
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={14} color="var(--text-dim)" />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Created from</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none', color: 'var(--text)', background: 'var(--surface2)' }} onFocus={e => e.target.style.borderColor='#6366f1'} onBlur={e => e.target.style.borderColor='var(--border)'} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>to</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none', color: 'var(--text)', background: 'var(--surface2)' }} onFocus={e => e.target.style.borderColor='#6366f1'} onBlur={e => e.target.style.borderColor='var(--border)'} />
            </div>
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ fontSize: 12, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear dates</button>
            )}
          </div>
        )}

        {/* Tag filter pills */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tag:</span>
            <button onClick={() => setTagFilter(null)} style={{ padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${!tagFilter ? '#6366f1' : 'var(--border)'}`, background: !tagFilter ? 'rgba(99,102,241,0.12)' : 'var(--surface)', color: !tagFilter ? '#4338ca' : 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>All</button>
            {allTags.map(tag => (
              <button key={tag.id} onClick={() => setTagFilter(tagFilter === tag.id ? null : tag.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${tagFilter===tag.id ? tag.color : tag.color+'44'}`, background: tagFilter===tag.id ? tag.color+'22' : 'var(--surface)', color: tag.color, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color }} />{tag.name}
              </button>
            ))}
          </div>
        )}

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {ALL_STATUSES.map(s => {
            const meta = STATUS_META[s] || { dot: '#6366f1', bg: 'rgba(99,102,241,0.12)', text: '#4338ca' };
            const active = statusFilter === s;
            return (
              <button key={s} onClick={() => setStatusFilter(s)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, border: `1.5px solid ${active ? meta.dot : 'var(--border)'}`, background: active ? meta.bg : 'var(--surface)', color: active ? meta.text : 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {s !== 'All' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot }} />}
                {s}
                <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10, background: active ? meta.dot : 'var(--surface2)', color: active ? 'white' : 'var(--text-dim)' }}>{statusCounts[s]}</span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1.2fr 1fr 1fr 1.4fr 1fr 1fr 40px', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', alignItems: 'center' }}>
            <div onClick={toggleAll} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {selected.size === leads.length && leads.length > 0
                ? <CheckSquare size={16} color="#6366f1" />
                : <Square size={16} color="#d1d5db" />
              }
            </div>
            {['Lead', 'Phone', 'Status', 'Messages', 'Tags', 'Assigned', 'Value', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</span>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>Loading leads...</div>
          ) : leads.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Users style={{ width: 36, height: 36, color: 'var(--border)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-dim)' }}>No leads found</p>
              {(search || hasFilters) && <button onClick={() => { setSearch(''); setTagFilter(null); setAssignedFilter('all'); setDateFrom(''); setDateTo(''); setStatusFilter('All'); }} style={{ marginTop: 8, fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear all filters</button>}
            </div>
          ) : leads.map((lead, i) => {
            const sc = STATUS_META[lead.status] || STATUS_META['New'];
            const value = lead.actual_sale || lead.estimated_value;
            const isSelected = selected.has(lead.id);
            const assignedMember = lead.assigned_to ? memberById(lead.assigned_to) : null;
            const assignedName = assignedMember ? (assignedMember.full_name || assignedMember.invite_email || 'Member') : null;
            return (
              <div key={lead.id} style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1.2fr 1fr 1fr 1.4fr 1fr 1fr 40px', alignItems: 'center', padding: '12px 16px', borderBottom: i < leads.length-1 ? '1px solid var(--border)' : 'none', background: isSelected ? 'rgba(99,102,241,0.12)' : 'var(--surface)', transition: 'background 0.1s', cursor: 'pointer' }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background='var(--surface2)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background='var(--surface)'; }}
                onClick={() => router.push(`/leads/${lead.id}`)}
              >
                {/* Checkbox */}
                <div onClick={e => toggleSelect(lead.id, e)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected ? <CheckSquare size={16} color="#6366f1" /> : <Square size={16} color="#d1d5db" />}
                </div>

                {/* Name + platform chip stacked together in column 2 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${sc.dot}dd, ${sc.dot}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'white' }}>
                    {lead.customer_name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.customer_name || 'Unknown'}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                      {(() => {
                        const platform = (lead.platform_source || 'whatsapp').toLowerCase();
                        const pColor = PLATFORM_COLORS[platform] || '#6b7280';
                        const acctName = lead.account_display_name || lead.account_nickname || lead.account_name;
                        const platName = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', website: 'Website' }[platform] || platform;
                        return (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: pColor + '18', color: pColor, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: pColor, flexShrink: 0 }} />
                            {platName}{acctName ? ` · ${acctName}` : ''}
                          </span>
                        );
                      })()}
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{new Date(lead.last_message_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Phone */}
                {(() => {
                  const display = displayPhone(lead.customer_phone, lead.platform_source);
                  if (!display || display === 'No phone') return <span />;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Phone size={11} color="var(--text-dim)" />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{display}</span>
                    </div>
                  );
                })()}

                {/* Status + inline AI score */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 20, background: sc.bg, color: sc.text, display: 'inline-block' }}>{lead.status}</span>
                  {(lead.sentiment || lead.urgency || lead.lead_score > 0) && (() => {
                    const SENT = { positive: '😊', neutral: '😐', negative: '😟', frustrated: '😠' };
                    const URG_COLORS = { low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };
                    return (
                      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                        {lead.lead_score > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>
                            ✨{lead.lead_score}
                          </span>
                        )}
                        {SENT[lead.sentiment] && (
                          <span title={lead.sentiment} style={{ fontSize: 11 }}>{SENT[lead.sentiment]}</span>
                        )}
                        {URG_COLORS[lead.urgency] && lead.urgency !== 'low' && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 20, background: URG_COLORS[lead.urgency] + '18', color: URG_COLORS[lead.urgency], textTransform: 'capitalize' }}>
                            {lead.urgency}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Messages */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <MessageSquare size={12} color="var(--text-dim)" />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{lead.total_messages}</span>
                </div>

                {/* Tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  {(lead.tags||[]).map(tag => <TagChip key={tag.id} tag={tag} size="sm" />)}
                  <TagPicker leadId={lead.id} assignedTags={lead.tags||[]} allTags={allTags} onToggle={(tag, isAssigned) => handleTagToggle(lead.id, tag, isAssigned)} />
                </div>

                {/* Assigned */}
                <div onClick={e => e.stopPropagation()}>
                  {assignedName ? (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', color: '#6366f1', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <UserCheck size={10} /> {assignedName.split(' ')[0]}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--border)' }}>—</span>
                  )}
                </div>

                {/* Value */}
                <span style={{ fontSize: 13, fontWeight: value ? 800 : 400, color: value ? sc.dot : 'var(--border)' }}>
                  {value ? `Rs ${value.toLocaleString()}` : '—'}
                </span>

                <ChevronRight size={15} color="#d1d5db" />
              </div>
            );
          })}
        </div>

      </main>

      <AddLeadModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onLeadAdded={() => { fetchAll(); setShowAddModal(false); }} />

      {showAssignModal && (
        <BulkAssignModal
          leadIds={[...selected]}
          members={members}
          onClose={() => setShowAssignModal(false)}
          onDone={handleAssignDone}
        />
      )}

      {showGroupModal && (
        <CreateGroupModal
          selectedLeads={leads.filter(l => selected.has(l.id))}
          onClose={() => setShowGroupModal(false)}
          onDone={(msg) => { setShowGroupModal(false); clearSelection(); showToast(msg, 'success'); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {showTrashConfirm && (
        <BulkTrashModal
          count={selected.size}
          loading={bulkTrashing}
          onCancel={() => setShowTrashConfirm(false)}
          onConfirm={async () => {
            setBulkTrashing(true);
            try {
              const res = await leadsAPI.bulkTrash([...selected]);
              showToast(res.data?.message || `Moved ${selected.size} leads to trash`, 'success');
              setShowTrashConfirm(false);
              clearSelection();
              await fetchAll();
            } catch (e) {
              showToast(e.response?.data?.error || 'Failed to move leads to trash', 'error');
            } finally { setBulkTrashing(false); }
          }}
        />
      )}

      {toast && (
        <div role="alert" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
          background: toast.type === 'error' ? 'rgba(239,68,68,0.95)' : toast.type === 'info' ? 'rgba(99,102,241,0.95)' : 'rgba(16,185,129,0.95)',
          color: 'white', padding: '12px 18px', borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)', fontSize: 14, fontWeight: 600,
          maxWidth: 380, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>{toast.type === 'error' ? '⚠️' : toast.type === 'info' ? 'ℹ️' : '✓'}</span>
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, width: 22, height: 22, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
        </div>
      )}
    </div>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </NavBar>
  );
}
