'use client';
import { useEffect, useState } from 'react';

// Impersonation handoff: applies a Command Center impersonation token into the normal
// app session (preserving any prior session for restore on exit), then opens the app
// as the workspace owner. Writes are blocked server-side in read mode.
export default function Impersonate() {
  const [msg, setMsg] = useState('Starting impersonation…');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { setMsg('Missing impersonation token.'); return; }
    (async () => {
      try {
        // Preserve the current (admin's own) session so "Exit impersonation" can restore it.
        const prevT = localStorage.getItem('token');
        const prevU = localStorage.getItem('user');
        const prevW = localStorage.getItem('workspace');
        if (prevT) localStorage.setItem('cc_prev_token', prevT); else localStorage.removeItem('cc_prev_token');
        if (prevU) localStorage.setItem('cc_prev_user', prevU); else localStorage.removeItem('cc_prev_user');
        if (prevW) localStorage.setItem('cc_prev_workspace', prevW); else localStorage.removeItem('cc_prev_workspace');

        localStorage.setItem('token', token);
        const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
        const r = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        const me = await r.json();
        const u = me.user || me;
        if (u && (u.id || u.email)) localStorage.setItem('user', JSON.stringify(u));
        if (me.workspace) localStorage.setItem('workspace', JSON.stringify(me.workspace));
        localStorage.setItem('cc_impersonating', '1');
        localStorage.setItem('cc_imp_name', me.workspace?.name || u?.business_name || u?.full_name || 'workspace');
        localStorage.setItem('cc_imp_mode', me.impersonation?.mode || 'read');
        window.location.replace('/dashboard');
      } catch (e) {
        setMsg('Failed to start impersonation: ' + (e?.message || 'error'));
      }
    })();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0a0f', color: '#e8e8ea', fontSize: 14 }}>
      {msg}
    </div>
  );
}
