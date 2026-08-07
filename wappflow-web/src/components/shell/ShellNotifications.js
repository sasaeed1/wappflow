'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, Users, Clock, CheckCircle } from 'lucide-react';
import Dropdown from '@/components/ui/Dropdown';
import { leadsAPI, remindersAPI, notificationsAPI, displayPhone } from '@/lib/api';

// ShellNotifications — the notification bell, lifted out of NavBar (Phase 2).
//
// Behaviour is a faithful port, deliberately: the dedupe rule (derived lead cards are
// suppressed when the persistent feed already points at the same lead), the 24-hour
// reminder window, the locally-dismissed set, and the 60s poll all match the original.
// What changed is WHERE it lives — mounted once by the shell instead of by whichever
// page happened to wrap itself in NavBar, so Studio and Contracts users can finally
// see the same feed CRM users always had.
//
// The panel now rides the Dropdown primitive, so it gains Escape-to-close and the
// overlay stack, which the hand-rolled version never had.

export default function ShellNotifications() {
  const router = useRouter();
  const [badge, setBadge] = useState(0);
  const [todayLeads, setTodayLeads] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [feed, setFeed] = useState([]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 60000);
    return () => clearInterval(poll);
  }, []);

  const load = async () => {
    try {
      const now = new Date();
      const [leadsRes, remindersRes] = await Promise.all([
        leadsAPI.getAll(null).catch(() => ({ data: { leads: [] } })),
        remindersAPI.getUpcoming().catch(() => ({ data: { reminders: [] } })),
      ]);
      const all = leadsRes.data.leads || [];
      const today = all.filter((l) => new Date(l.created_at).toDateString() === now.toDateString());
      setTodayLeads(today);
      const urgent = (remindersRes.data.reminders || []).filter((r) => {
        const due = new Date(r.due_date || r.reminder_date);
        return (due - now) / 36e5 <= 24;
      });
      setReminders(urgent);

      let feedItems = [], feedUnread = 0;
      try {
        const nr = await notificationsAPI.get();
        feedItems = nr.data.notifications || [];
        feedUnread = nr.data.unread || 0;
        setFeed(feedItems);
      } catch {}

      const feedLeadUrls = new Set(feedItems.map((f) => f.url).filter(Boolean));
      const dismissed = new Set(JSON.parse(localStorage.getItem('wf_dismissed_notifications') || '[]'));
      const derived = [
        ...today.filter((l) => !feedLeadUrls.has(`/leads/${l.id}`)).map((l) => `lead-${l.id}`),
        ...urgent.map((r) => `rem-${r.id}`),
      ].filter((id) => !dismissed.has(id)).length;
      setBadge(derived + feedUnread);
    } catch {}
  };

  const markAllRead = async () => {
    try { await notificationsAPI.markAllRead?.(); } catch {}
    const ids = items().map((i) => i.id);
    try {
      const dismissed = new Set(JSON.parse(localStorage.getItem('wf_dismissed_notifications') || '[]'));
      ids.forEach((id) => dismissed.add(id));
      localStorage.setItem('wf_dismissed_notifications', JSON.stringify([...dismissed]));
    } catch {}
    setBadge(0);
    load();
  };

  const items = () => {
    const now = new Date();
    let dismissed = new Set();
    try { dismissed = new Set(JSON.parse(localStorage.getItem('wf_dismissed_notifications') || '[]')); } catch {}
    const feedLeadUrls = new Set(feed.map((f) => f.url).filter(Boolean));
    return [
      ...feed.map((n) => ({
        id: `notif-${n.id}`, type: n.type || 'info', emoji: n.icon || '🔔',
        title: n.title, sub: n.body || '',
        color: 'var(--accent)', bg: 'var(--accent-bg)',
        href: n.url || null, unread: !n.is_read,
      })),
      ...todayLeads.filter((l) => !feedLeadUrls.has(`/leads/${l.id}`)).map((l) => ({
        id: `lead-${l.id}`, type: 'lead',
        title: `New lead: ${l.customer_name || 'Unknown'}`,
        sub: displayPhone(l.customer_phone, l.platform_source),
        color: 'var(--accent)', bg: 'var(--accent-bg)',
        href: `/leads/${l.id}`,
      })),
      ...reminders.map((r) => {
        const due = new Date(r.due_date || r.reminder_date);
        const overdue = due < now;
        return {
          id: `rem-${r.id}`, type: 'reminder',
          title: r.title || r.message || 'Reminder',
          sub: overdue ? `Overdue — ${due.toLocaleTimeString()}` : `Due ${due.toLocaleString()}`,
          color: overdue ? 'var(--danger-fg)' : 'var(--warning-fg)',
          bg: overdue ? 'var(--danger-bg)' : 'var(--warning-bg)',
          href: null,
        };
      }),
    ].filter((i) => !dismissed.has(i.id));
  };

  const list = items();

  return (
    <Dropdown
      label="Notifications"
      width={340}
      panelStyle={{ padding: 0, overflow: 'hidden' }}
      trigger={(p) => (
        <button
          {...p}
          aria-label={badge > 0 ? `Notifications, ${badge} unread` : 'Notifications'}
          style={{
            position: 'relative', width: 36, height: 36, borderRadius: 'var(--radius)',
            border: 'none', background: 'transparent', color: 'var(--text-muted)',
            cursor: 'pointer', display: 'grid', placeItems: 'center',
          }}
        >
          <Bell size={18} />
          {badge > 0 && (
            <span
              style={{
                position: 'absolute', top: 3, right: 3, minWidth: 16, height: 16,
                padding: '0 4px', borderRadius: 'var(--radius-pill)',
                background: 'var(--danger)', color: 'var(--on-accent)',
                border: '2px solid var(--surface)',
                fontSize: 9.5, fontWeight: 'var(--fw-bold)',
                display: 'grid', placeItems: 'center',
              }}
            >
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={13} color="var(--text)" />
              <span style={{ fontSize: 13, fontWeight: 'var(--fw-bold)', color: 'var(--text)' }}>Notifications</span>
              {list.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 'var(--fw-bold)', padding: '2px 7px', borderRadius: 10, background: 'var(--danger)', color: 'var(--on-accent)' }}>
                  {list.length}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {list.length > 0 && (
                <button onClick={markAllRead} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'var(--fw-semibold)' }}>
                  Mark all read
                </button>
              )}
              <button onClick={close} aria-label="Close notifications" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={15} />
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {list.length === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                <CheckCircle size={26} color="var(--success)" style={{ margin: '0 auto 8px', display: 'block' }} />
                <p style={{ fontSize: 13, fontWeight: 'var(--fw-bold)', color: 'var(--text)', margin: 0 }}>All caught up!</p>
              </div>
            ) : list.map((item) => (
              <div
                key={item.id}
                onClick={() => { if (item.href) { close(); router.push(item.href); } }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--border)', cursor: item.href ? 'pointer' : 'default' }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, background: item.bg, display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 15 }}>
                  {item.emoji ? <span>{item.emoji}</span>
                    : item.type === 'lead' ? <Users size={13} color={item.color} />
                    : <Clock size={13} color={item.color} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 'var(--fw-bold)', color: 'var(--text)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.title}
                    {item.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
