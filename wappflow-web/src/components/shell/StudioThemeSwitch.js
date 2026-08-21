'use client';

import { useState, useEffect } from 'react';
import { Aperture, BookOpen, Clapperboard } from 'lucide-react';

// Studio's three creative identities — a shell ACTION slot, not shell furniture
// (Phase 2). Lifted verbatim out of StudioShell so the module keeps its dialect
// controls while the surrounding chrome unifies.
//
// The retired-id migration is preserved exactly: anyone still holding 'dark-pro' /
// 'airy' / 'bold' is moved onto the current ids and the corrected value is written
// back. studio/layout.js repeats this same mapping in a pre-paint inline script so
// the theme is on <html> before first paint — the two MUST stay in agreement.

const THEMES = [
  ['monochrome', Aperture, 'Monochrome'],
  ['editorial', BookOpen, 'Editorial'],
  ['cinema', Clapperboard, 'Cinema'],
];
const THEME_MIGRATE = { 'dark-pro': 'cinema', airy: 'editorial', bold: 'monochrome' };
const DEFAULT_THEME = 'monochrome';
const resolveTheme = (t) => (THEMES.some(([id]) => id === t) ? t : (THEME_MIGRATE[t] || DEFAULT_THEME));

export default function StudioThemeSwitch() {
  const [theme, setTheme] = useState(DEFAULT_THEME);

  useEffect(() => {
    let t = DEFAULT_THEME;
    try { t = resolveTheme(localStorage.getItem('ms-theme')); } catch {}
    setTheme(t);
    document.documentElement.setAttribute('data-ms-theme', t);
    try { localStorage.setItem('ms-theme', t); } catch {} // persist any migration
  }, []);

  const pick = (t) => {
    setTheme(t);
    document.documentElement.setAttribute('data-ms-theme', t);
    try { localStorage.setItem('ms-theme', t); } catch {}
  };

  return (
    <div className="ms-themeswitch" title="Theme" role="group" aria-label="Studio theme">
      {THEMES.map(([t, Icon, label]) => (
        <button
          key={t}
          className={theme === t ? 'is-active' : ''}
          onClick={() => pick(t)}
          title={label}
          aria-label={label}
          aria-pressed={theme === t}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  );
}
