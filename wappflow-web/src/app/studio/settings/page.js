'use client';
/* eslint-disable @next/next/no-img-element -- avatar is a dynamic /uploads URL */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Aperture, BookOpen, Clapperboard, User, Globe, Copy, ExternalLink, MessageSquare,
  Sliders, HelpCircle, LogOut, Check, Image as ImageIcon, Film, Shield, Camera,
} from 'lucide-react';
import { mediaAPI, leadsAPI } from '../../../lib/api';
import NavBar from '../../../components/StudioShell';

const THEMES = [
  ['monochrome', Aperture, 'Monochrome', 'Leica / museum — cool white, black serif display, gallery-flush grid.'],
  ['editorial', BookOpen, 'Editorial', 'Vogue / Kinfolk — cream paper, serif, vast whitespace.'],
  ['cinema', Clapperboard, 'Cinema', 'Film studio — deep black, Anton caps, grain & vignette.'],
];

// studio UI prefs live client-side (per device), read by the studio pages.
const PREFS_KEY = 'ms-prefs';
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; } };
const writePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {} };

export default function StudioSettingsPage() {
  const router = useRouter();
  const [theme, setTheme] = useState('monochrome');
  const [user, setUser] = useState(null);
  const [prefs, setPrefs] = useState({});
  const [pf, setPf] = useState(null);
  const [waStatus, setWaStatus] = useState('unknown'); // connected | disconnected | unknown
  const [toast, setToast] = useState(null);

  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/studio/settings'); return; }
    try { setTheme(localStorage.getItem('ms-theme') || 'monochrome'); } catch {}
    try { const u = localStorage.getItem('user'); if (u) setUser(JSON.parse(u)); } catch {}
    setPrefs(readPrefs());
    mediaAPI.getPortfolio().then(r => setPf(r.data)).catch(() => {});
    // best-effort WhatsApp status (don't hard-fail if the endpoint shape differs)
    leadsAPI.getAll(null).then(() => {}).catch(() => {});
  }, []);

  const pickTheme = (t) => {
    setTheme(t);
    try { localStorage.setItem('ms-theme', t); } catch {}
    document.documentElement.setAttribute('data-ms-theme', t);
  };
  const setPref = (k, v) => { const next = { ...prefs, [k]: v }; setPrefs(next); writePrefs(next); };

  const copyLink = () => { if (pf?.share_url) { try { navigator.clipboard.writeText(pf.share_url); say('Link copied'); } catch {} } };
  const togglePublic = async () => {
    try { const r = await mediaAPI.updatePortfolio({ is_public: !pf.is_public }); setPf(r.data); say(r.data.is_public ? 'Portfolio is public' : 'Portfolio is private'); } catch {}
  };
  const signOut = () => { try { localStorage.clear(); } catch {} router.push('/login'); };

  return (
    <NavBar>
      <div className="ms-page" style={{ maxWidth: 920 }}>
        <p className="ms-eyebrow" style={{ marginBottom: 8 }}>Studio</p>
        <h1 className="ms-display" style={{ fontSize: 'clamp(30px, 4.6vw, 60px)', marginBottom: 6 }}>Settings</h1>
        <p className="ms-lede" style={{ marginBottom: 36 }}>Tune how the Studio looks and behaves, manage your public portfolio, and find help.</p>

        {/* APPEARANCE */}
        <Section icon={<Camera size={15} />} title="Appearance" sub="Switching theme switches the whole studio — typography, colour, motion.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {THEMES.map(([t, Icon, label, desc]) => (
              <button key={t} onClick={() => pickTheme(t)} style={{
                textAlign: 'left', padding: 16, borderRadius: 12, cursor: 'pointer', background: 'var(--ms-surface)',
                border: theme === t ? '2px solid var(--ms-ink)' : '1px solid var(--ms-line)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                  <Icon size={20} />
                  {theme === t && <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--ms-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={12} color="var(--ms-on-accent)" /></span>}
                </div>
                <div style={{ fontFamily: 'var(--ms-font-display)', fontSize: 17, color: 'var(--ms-ink)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--ms-ink-3)', lineHeight: 1.5 }}>{desc}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* PROFILE */}
        <Section icon={<User size={15} />} title="Profile" sub="Your account is shared with WappFlow CRM.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 999, background: 'var(--ms-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'var(--ms-ink-2)' }}>
              {(user?.full_name || user?.email || 'U')[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ms-ink)' }}>{user?.full_name || 'Your account'}</div>
              <div style={{ fontSize: 13, color: 'var(--ms-ink-3)' }}>{user?.email || ''}</div>
            </div>
            <button onClick={() => window.open('/profile', '_blank')} className="ms-btn-ghost"><ExternalLink size={14} /> Edit profile</button>
          </div>
        </Section>

        {/* PORTFOLIO */}
        <Section icon={<Globe size={15} />} title="Portfolio" sub="Your public, shareable showcase.">
          {pf ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <span className={`ms-status${pf.is_public ? ' ms-status-live' : ''}`}>{pf.is_public ? 'Public' : 'Private'}</span>
                {pf.is_public && <a href={pf.share_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--ms-ink)', fontWeight: 600, textDecoration: 'none' }}>{pf.share_url?.replace(/^https?:\/\//, '')}</a>}
                <span style={{ fontSize: 12.5, color: 'var(--ms-ink-3)' }}>· {pf.view_count || 0} views</span>
              </div>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                <button onClick={() => router.push('/studio/portfolio')} className="ms-btn-ink"><Sliders size={14} /> Open editor</button>
                <button onClick={togglePublic} className="ms-btn-ghost">{pf.is_public ? 'Make private' : 'Make public'}</button>
                {pf.is_public && <button onClick={copyLink} className="ms-btn-ghost"><Copy size={14} /> Copy link</button>}
              </div>
            </div>
          ) : <p style={{ fontSize: 13, color: 'var(--ms-ink-3)' }}>Loading…</p>}
        </Section>

        {/* DEFAULTS */}
        <Section icon={<Sliders size={15} />} title="Defaults & preferences" sub="Saved on this device.">
          <Row label="Default library view" hint="How the photo grid opens.">
            <div className="ms-seg" style={{ padding: 3 }}>
              {[['c', 'Collage'], ['m', 'Grid'], ['l', 'Large']].map(([v, l]) => (
                <button key={v} onClick={() => setPref('libraryView', v)} className={(prefs.libraryView || 'c') === v ? 'is-active' : ''} style={{ padding: '6px 12px' }}>{l}</button>
              ))}
            </div>
          </Row>
          <Row label="AI advisory hints" hint="Show focus / duplicate / quality badges (never auto-applied).">
            <Toggle on={prefs.aiHints !== false} onChange={(v) => setPref('aiHints', v)} />
          </Row>
          <Row label="Default gallery downloads" hint="New galleries start with this download policy.">
            <div className="ms-seg" style={{ padding: 3 }}>
              {[['none', 'Off'], ['web', 'Web'], ['high-res', 'Hi-res']].map(([v, l]) => (
                <button key={v} onClick={() => setPref('galleryDownload', v)} className={(prefs.galleryDownload || 'web') === v ? 'is-active' : ''} style={{ padding: '6px 12px' }}>{l}</button>
              ))}
            </div>
          </Row>
          <Row label="Default reel aspect" hint="Starting aspect for new reels.">
            <div className="ms-seg" style={{ padding: 3 }}>
              {[['9:16', '9:16'], ['1:1', '1:1'], ['16:9', '16:9']].map(([v, l]) => (
                <button key={v} onClick={() => setPref('reelAspect', v)} className={(prefs.reelAspect || '9:16') === v ? 'is-active' : ''} style={{ padding: '6px 12px' }}>{l}</button>
              ))}
            </div>
          </Row>
        </Section>

        {/* DELIVERY */}
        <Section icon={<MessageSquare size={15} />} title="Delivery" sub="Galleries & your portfolio send over your connected WhatsApp.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, color: 'var(--ms-ink-2)', flex: 1 }}>WhatsApp delivery is managed in WappFlow CRM. Connect a number there to send galleries and your portfolio in one click.</span>
            <button onClick={() => window.open('/settings', '_blank')} className="ms-btn-ghost"><ExternalLink size={14} /> CRM settings</button>
          </div>
        </Section>

        {/* HELP + ACCOUNT */}
        <Section icon={<HelpCircle size={15} />} title="Help & account" sub="">
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/studio/help')} className="ms-btn-ink"><HelpCircle size={14} /> Help center</button>
            <button onClick={() => window.open('/settings', '_blank')} className="ms-btn-ghost"><Shield size={14} /> Account & billing</button>
            <button onClick={signOut} className="ms-btn-ghost" style={{ color: '#d4564a', borderColor: 'rgba(212,86,74,0.4)' }}><LogOut size={14} /> Sign out</button>
          </div>
        </Section>
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 600, padding: '9px 18px', borderRadius: 999, background: 'var(--ms-ink)', color: 'var(--ms-paper)', fontSize: 13 }}>{toast}</div>}
    </NavBar>
  );
}

function Section({ icon, title, sub, children }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <span style={{ color: 'var(--ms-spark)' }}>{icon}</span>
        <h2 className="ms-h2" style={{ fontSize: 'clamp(18px, 2.2vw, 24px)' }}>{title}</h2>
      </div>
      {sub && <p style={{ fontSize: 13, color: 'var(--ms-ink-3)', margin: '0 0 16px' }}>{sub}</p>}
      <div className="ms-panel" style={{ padding: 'clamp(16px, 2vw, 22px)' }}>{children}</div>
    </section>
  );
}
function Row({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--ms-line)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--ms-ink)', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--ms-ink-3)', marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}
function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? 'var(--ms-accent)' : 'var(--ms-surface-2)', position: 'relative', transition: 'background .2s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: 999, background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  );
}
