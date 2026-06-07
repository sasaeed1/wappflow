'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

// Reuses WappFlow's existing theme mechanism (localStorage 'theme' + the `.light`
// class on <html>) so the shift is consistent across the whole app — no parallel
// theme state. Light = gallery wall; dark = gallery at night.
export default function StudioThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains('light'));
  }, []);

  const toggle = () => {
    const next = !light;
    document.documentElement.classList.toggle('light', next);
    try { localStorage.setItem('theme', next ? 'light' : 'dark'); } catch {}
    setLight(next);
  };

  return (
    <button onClick={toggle} className="ms-theme-toggle"
      aria-label="Toggle light or dark" title={light ? 'Switch to dark' : 'Switch to light'}>
      {light ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );
}
