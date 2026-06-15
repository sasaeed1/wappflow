'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Aperture, BookOpen, Clapperboard, Settings, LogOut, Users, Zap, Camera, ArrowUpRight, HelpCircle, User, Trash2 } from 'lucide-react';
import StudioCopilot from './StudioCopilot';

const FLUX_URL = process.env.NEXT_PUBLIC_FLUX_URL || 'http://localhost:3000';
// Three creative-studio identities (see studio.css). Aperture = gallery, BookOpen
// = magazine, Clapperboard = film.
const THEMES = [['monochrome', Aperture, 'Monochrome'], ['editorial', BookOpen, 'Editorial'], ['cinema', Clapperboard, 'Cinema']];
// migrate anyone still holding a retired theme id
const THEME_MIGRATE = { 'dark-pro': 'cinema', airy: 'editorial', bold: 'monochrome' };
const DEFAULT_THEME = 'monochrome';
const resolveTheme = (t) => (THEMES.some(([id]) => id === t) ? t : (THEME_MIGRATE[t] || DEFAULT_THEME));

// Studio's own application shell. Used in place of WappFlow's NavBar on every
// /studio screen, so Studio is a self-contained module (opened in a new tab via
// the app-switcher in WappFlow Core). Owns the theme switcher + navigation.
export default function StudioShell({ children }) {
  const router = useRouter();
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [menu, setMenu] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [user, setUser] = useState(null);
  const menuRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    let t = DEFAULT_THEME;
    try { t = resolveTheme(localStorage.getItem('ms-theme')); } catch {}
    setTheme(t);
    document.documentElement.setAttribute('data-ms-theme', t);
    try { localStorage.setItem('ms-theme', t); } catch {} // persist any migration
    try { const u = localStorage.getItem('user'); if (u) setUser(JSON.parse(u)); } catch {}
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenu(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const pickTheme = (t) => {
    setTheme(t);
    document.documentElement.setAttribute('data-ms-theme', t);
    try { localStorage.setItem('ms-theme', t); } catch {}
  };
  const signOut = () => { try { localStorage.clear(); } catch {} router.push('/login'); };

  return (
    <div className="ms-root">
      <header className="ms-shell">
        {/* app-switcher (waffle) */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button className="ms-waffle" onClick={() => setMenu(v => !v)} title="Switch app" aria-label="Switch app"><LayoutGrid size={19} /></button>
          {menu && (
            <div className="ms-menu" style={{ left: 0 }}>
              {/* same-origin: keep the referrer so the new tab inherits the session */}
              <a className="ms-menu-item" href="/dashboard" target="_blank" onClick={() => setMenu(false)}>
                <span className="ms-menu-ico" style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}><Users size={15} /></span>
                <span style={{ flex: 1 }}>WappFlow CRM</span><ArrowUpRight size={14} style={{ opacity: 0.4 }} />
              </a>
              <div className="ms-menu-item" style={{ cursor: 'default', background: 'var(--ms-surface-2)' }}>
                <span className="ms-menu-ico" style={{ background: 'var(--ms-accent)', color: 'var(--ms-on-accent)' }}><Camera size={15} /></span>
                <span style={{ flex: 1, fontWeight: 600 }}>Media Studio</span>
              </div>
              <a className="ms-menu-item" href={FLUX_URL} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}>
                <span className="ms-menu-ico" style={{ background: 'linear-gradient(135deg,#A78BFA,#22D3EE,#EC4899)' }}><Zap size={15} /></span>
                <span style={{ flex: 1 }}>Flux</span><ArrowUpRight size={14} style={{ opacity: 0.4 }} />
              </a>
            </div>
          )}
        </div>

        {/* wordmark */}
        <div className="ms-wordmark" onClick={() => router.push('/studio')}>
          <span className="ms-menu-ico" style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--ms-accent)', color: 'var(--ms-on-accent)' }}><Camera size={15} /></span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><b>Studio</b></span>
        </div>

        <nav className="ms-shell-nav" style={{ marginLeft: 8 }}>
          <button className="ms-shell-link" onClick={() => router.push('/studio')}>Shoots</button>
          <button className="ms-shell-link" onClick={() => router.push('/studio/portfolio')}>Portfolio</button>
        </nav>

        <div style={{ flex: 1 }} />

        {/* theme switcher */}
        <div className="ms-themeswitch" title="Theme">
          {THEMES.map(([t, Icon, label]) => (
            <button key={t} className={theme === t ? 'is-active' : ''} onClick={() => pickTheme(t)} title={label} aria-label={label}><Icon size={14} /></button>
          ))}
        </div>

        <button className="ms-waffle" title="Studio settings" onClick={() => router.push('/studio/settings')} aria-label="Studio settings"><Settings size={17} /></button>

        {/* user */}
        <div ref={userRef} style={{ position: 'relative' }}>
          <button onClick={() => setUserMenu(v => !v)} style={{ width: 34, height: 34, borderRadius: 999, border: '1px solid var(--ms-line)', cursor: 'pointer', background: 'var(--ms-surface-2)', color: 'var(--ms-ink)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {(user?.full_name || user?.email || 'U')[0]?.toUpperCase()}
          </button>
          {userMenu && (
            <div className="ms-menu" style={{ right: 0 }}>
              <div style={{ padding: '8px 11px 10px', borderBottom: '1px solid var(--ms-line)', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ms-ink)' }}>{user?.full_name || user?.email || 'Account'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ms-ink-3)' }}>{user?.email || ''}</div>
              </div>
              <button className="ms-menu-item" onClick={() => { setUserMenu(false); router.push('/studio/settings'); }} style={{ color: 'var(--ms-ink)' }}><Settings size={15} /> Studio settings</button>
              <button className="ms-menu-item" onClick={() => { setUserMenu(false); router.push('/studio/help'); }} style={{ color: 'var(--ms-ink)' }}><HelpCircle size={15} /> Help center</button>
              <button className="ms-menu-item" onClick={() => { setUserMenu(false); router.push('/studio/trash'); }} style={{ color: 'var(--ms-ink)' }}><Trash2 size={15} /> Trash</button>
              <button className="ms-menu-item" onClick={() => { router.push('/profile'); }} style={{ color: 'var(--ms-ink)' }}><User size={15} /> My profile</button>
              <button className="ms-menu-item" onClick={signOut} style={{ color: '#e0726a' }}><LogOut size={15} /> Sign out</button>
            </div>
          )}
        </div>
      </header>

      <div className="ms-shell-content">{children}</div>
      <StudioCopilot />
    </div>
  );
}
