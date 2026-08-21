'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, RotateCcw, XCircle, AlertTriangle, Clock, Inbox } from 'lucide-react';
import { leadsAPI, displayPhone } from '../../lib/api';
import { useConfirm } from '@/lib/confirm';
import { formatRelative } from '../../lib/datetime';

const STATUS_COLOR = {
  'New': '#6366f1', 'Contacted': '#06b6d4', 'Interested': '#f59e0b',
  'Negotiating': '#f97316', 'Closed - Won': '#10b981', 'Closed - Lost': '#ef4444',
};

export default function TrashPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [emptying, setEmptying] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login'); return; }
    fetchTrash();
  }, []);

  const fetchTrash = async () => {
    setLoading(true);
    try {
      const res = await leadsAPI.getTrash();
      setLeads(Array.isArray(res.data.leads) ? res.data.leads : []);
    } catch { setLeads([]); }
    finally { setLoading(false); }
  };

  // Trash auto-purges after 90 days — show how long each lead has left.
  const daysRemaining = (deletedAt) => {
    if (!deletedAt) return 90;
    const d = new Date(String(deletedAt).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(deletedAt)) ? '' : 'Z'));
    if (isNaN(d.getTime())) return 90;
    return Math.max(0, 90 - Math.floor((Date.now() - d.getTime()) / 86400000));
  };

  const handleRestore = async (lead) => {
    const ok = await confirm({ title: 'Restore lead?', message: `Restore ${lead.customer_name || 'this lead'} back to your active leads?`, confirmLabel: 'Restore' });
    if (!ok) return;
    setBusyId(lead.id);
    try { await leadsAPI.restore(lead.id); setLeads(p => p.filter(l => l.id !== lead.id)); }
    catch { await confirm({ title: 'Restore failed', message: 'Could not restore this lead. Please try again.', alertOnly: true, tone: 'danger' }); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (lead) => {
    const ok = await confirm({ title: 'Delete permanently?', message: `This permanently deletes ${lead.customer_name || 'this lead'} and all its messages, notes and invoices. This cannot be undone.`, confirmLabel: 'Delete forever', tone: 'danger' });
    if (!ok) return;
    setBusyId(lead.id);
    try { await leadsAPI.permanentDelete(lead.id); setLeads(p => p.filter(l => l.id !== lead.id)); }
    catch { await confirm({ title: 'Delete failed', message: 'Could not delete this lead. Please try again.', alertOnly: true, tone: 'danger' }); }
    finally { setBusyId(null); }
  };

  const handleEmptyAll = async () => {
    const ok = await confirm({
      title: `Empty trash — delete all ${leads.length}?`,
      message: 'Every lead in the trash will be permanently deleted along with its messages, notes and invoices. This cannot be undone.',
      confirmLabel: 'Empty trash', tone: 'danger', requireTyped: 'DELETE',
    });
    if (!ok) return;
    setEmptying(true);
    try { await leadsAPI.emptyTrash(); setLeads([]); }
    catch { await confirm({ title: 'Failed', message: 'Could not empty the trash. Please try again.', alertOnly: true, tone: 'danger' }); }
    finally { setEmptying(false); }
  };

  return (
    <>
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px 48px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: 'linear-gradient(135deg, #ef4444, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Trash2 size={20} color="white" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Trash</h1>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>{leads.length} deleted {leads.length === 1 ? 'lead' : 'leads'}</p>
            </div>
            {leads.length > 0 && (
              <button onClick={handleEmptyAll} disabled={emptying}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 11, border: '1.5px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', fontWeight: 700, fontSize: 13, cursor: emptying ? 'default' : 'pointer' }}>
                <XCircle size={15} /> {emptying ? 'Emptying…' : 'Empty Trash'}
              </button>
            )}
          </div>

          {/* Info banner */}
          <div style={{ display: 'flex', gap: 12, padding: '13px 16px', background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)', borderRadius: 12, marginBottom: 20 }}>
            <AlertTriangle size={18} color="var(--warning-text)" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: 'var(--warning-text)', margin: 0, lineHeight: 1.5 }}>
              Deleted leads stay here for <strong>90 days</strong>, then are removed automatically. You can restore them any time before then.
            </p>
          </div>

          {/* Body */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
              <div style={{ width: 34, height: 34, border: '3px solid var(--border)', borderTopColor: '#ef4444', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : leads.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '72px 24px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 18 }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Inbox size={30} color="var(--text-dim)" />
              </div>
              <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>Trash is empty</p>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Deleted leads will show up here for 90 days.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {leads.map(lead => {
                const days = daysRemaining(lead.deleted_at);
                const color = STATUS_COLOR[lead.status] || '#6366f1';
                const busy = busyId === lead.id;
                const phone = displayPhone(lead.customer_phone, lead.platform_source);
                return (
                  <div key={lead.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, opacity: busy ? 0.5 : 1, transition: 'opacity 0.15s', flexWrap: 'wrap' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: `linear-gradient(135deg, ${color}, ${color}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                      {lead.customer_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 170 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{lead.customer_name || 'Unknown'}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: color + '22', color }}>{lead.status}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
                        {phone && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{phone}</span>}
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Deleted {formatRelative(lead.deleted_at)}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, color: days < 7 ? 'var(--danger)' : 'var(--warning-text)' }}>
                          <Clock size={12} /> {days} day{days === 1 ? '' : 's'} left
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => handleRestore(lead)} disabled={busy}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1.5px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'default' : 'pointer' }}>
                        <RotateCcw size={13} /> Restore
                      </button>
                      <button onClick={() => handleDelete(lead)} disabled={busy}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1.5px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'default' : 'pointer' }}>
                        <XCircle size={13} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
