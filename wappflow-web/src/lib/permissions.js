'use client';

import { useEffect, useState } from 'react';
import { authAPI } from './api';

// What the signed-in member's role allows (PROP-006). The server is the boundary —
// it refuses with 403 { permission_denied } — this only keeps the UI from offering
// buttons that would be refused. One fetch per page load, shared by every caller.
//
// Until the answer arrives everything reads as allowed: hiding then re-showing
// controls on every load would flicker, and the server still says no if it must.

let cache = null;
let inflight = null;

function load() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = authAPI.me()
      .then((r) => { cache = { role: r.data?.user?.role || null, permissions: r.data?.permissions || null, emailVerified: r.data?.user ? !!r.data.user.email_verified_at : null }; return cache; })
      .catch(() => ({ role: null, permissions: null }))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function usePermissions() {
  const [state, setState] = useState(cache);
  useEffect(() => {
    let alive = true;
    load().then((s) => { if (alive) setState(s); });
    return () => { alive = false; };
  }, []);
  const perms = state?.permissions;
  return {
    loaded: !!state,
    role: state?.role || null,
    emailVerified: state ? state.emailVerified : null,
    can: (key) => !perms || perms[key] !== false,
  };
}
