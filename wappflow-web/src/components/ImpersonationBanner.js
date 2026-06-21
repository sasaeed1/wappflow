'use client';
import { useEffect, useState } from 'react';

// Persistent banner shown in the normal app while a platform admin is impersonating
// a workspace. Exit restores the admin's prior session and returns to Command Center.
export default function ImpersonationBanner() {
  const [on, setOn] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOn(localStorage.getItem('cc_impersonating') === '1');
    setName(localStorage.getItem('cc_imp_name') || 'workspace');
  }, []);

  if (!on) return null;

  const exit = () => {
    const pt = localStorage.getItem('cc_prev_token');
    const pu = localStorage.getItem('cc_prev_user');
    const pw = localStorage.getItem('cc_prev_workspace');
    if (pt) localStorage.setItem('token', pt); else localStorage.removeItem('token');
    if (pu) localStorage.setItem('user', pu); else localStorage.removeItem('user');
    if (pw) localStorage.setItem('workspace', pw); else localStorage.removeItem('workspace');
    ['cc_impersonating', 'cc_imp_name', 'cc_prev_token', 'cc_prev_user', 'cc_prev_workspace'].forEach((k) => localStorage.removeItem(k));
    window.location.href = '/control/customers';
  };

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99999, background: 'linear-gradient(90deg,#7c3aed,#db2777)', color: '#fff', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, fontWeight: 600, boxShadow: '0 -4px 20px rgba(0,0,0,.4)' }}>
      <span>👁️ Impersonating <strong>{name}</strong> · read-only (writes blocked)</span>
      <span style={{ flex: 1 }} />
      <button onClick={exit} style={{ background: 'rgba(255,255,255,.22)', border: 'none', borderRadius: 7, color: '#fff', padding: '5px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 12.5 }}>Exit impersonation</button>
    </div>
  );
}
