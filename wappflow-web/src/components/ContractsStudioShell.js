'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { FileSignature, LogOut, Settings, User } from 'lucide-react';
import AppSwitcher from './AppSwitcher';

// Contracts Studio is its own module (opened from the app-switcher, own tab).
// Its own shell — same pattern as Media Studio. More nav appears as phases land.
export default function ContractsStudioShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);

  useEffect(() => { try { const u = localStorage.getItem('user'); if (u) setUser(JSON.parse(u)); } catch {} }, []);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const signOut = () => { try { localStorage.clear(); } catch {} router.push('/login'); };

  const NavLink = ({ href, label }) => {
    const active = pathname === href;
    return (
      <button onClick={() => router.push(href)} style={{
        padding: '7px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
        background: active ? 'var(--accent-light)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)', fontSize: 13, fontWeight: active ? 700 : 500,
      }}>{label}</button>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 100, height: 58, display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
        <AppSwitcher />
        <div onClick={() => router.push('/contracts')} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', marginRight: 6 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileSignature size={15} color="#fff" /></span>
          <b style={{ fontSize: 15.5, color: 'var(--text)', letterSpacing: '-0.3px' }}>Contracts Studio</b>
        </div>
        <nav style={{ display: 'flex', gap: 2, marginLeft: 6 }}>
          <NavLink href="/contracts" label="Overview" />
          <NavLink href="/contracts/vault" label="Client Vault" />
          <NavLink href="/contracts/analytics" label="Analytics" />
        </nav>
        <div style={{ flex: 1 }} />
        <div ref={ref} style={{ position: 'relative' }}>
          <button onClick={() => setMenu(v => !v)} style={{ width: 34, height: 34, borderRadius: 999, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {(user?.full_name || user?.email || 'U')[0]?.toUpperCase()}
          </button>
          {menu && (
            <div style={{ position: 'absolute', top: 42, right: 0, minWidth: 186, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', padding: 6, zIndex: 300 }}>
              <div style={{ padding: '8px 11px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{user?.full_name || user?.email || 'Account'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{user?.email || ''}</div>
              </div>
              <button onClick={() => { setMenu(false); router.push('/profile'); }} style={menuItem}><User size={14} /> My profile</button>
              <button onClick={() => { setMenu(false); window.open('/settings', '_blank'); }} style={menuItem}><Settings size={14} /> Settings</button>
              <button onClick={signOut} style={{ ...menuItem, color: '#ef4444' }}><LogOut size={14} /> Sign out</button>
            </div>
          )}
        </div>
      </header>
      <div>{children}</div>
    </div>
  );
}

const menuItem = { width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer', textAlign: 'left', borderRadius: 8 };
