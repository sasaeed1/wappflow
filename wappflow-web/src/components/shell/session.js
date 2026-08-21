'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// One session read and one correct sign-out for every module (Phase 2).
//
// Before: three shells each parsed `user` from localStorage independently, ~10 pages
// re-parsed it again, and all three shells signed out with `localStorage.clear()`.
// That last one is a real defect, not just duplication — clear() also wipes
// `theme`, `ms-theme` and `wf_dismissed_notifications`, so signing out silently reset
// the user's light/dark choice and their Studio theme. ControlShell was the only shell
// that removed scoped keys; this makes that the rule everywhere.

const SESSION_KEYS = ['token', 'user', 'workspace', 'wf_persist'];

export function useSession() {
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);

  useEffect(() => {
    try {
      const u = localStorage.getItem('user');
      if (u) setUser(JSON.parse(u));
      const w = localStorage.getItem('workspace');
      if (w) setWorkspace(JSON.parse(w));
    } catch {}
  }, []);

  return { user, workspace };
}

export function useSignOut() {
  const router = useRouter();
  return () => {
    // Remove only session keys — preferences (theme, ms-theme) are the user's, not the
    // session's, and survive sign-out.
    try { SESSION_KEYS.forEach((k) => localStorage.removeItem(k)); } catch {}
    router.push('/login');
  };
}

/**
 * Shell-level auth guard. Replaces ~25 copies of the same localStorage check —
 * and covers the six pages that had no guard at all. Always carries ?next= so the
 * user lands back where they were aiming (today that contract is inconsistent).
 */
export function useAuthGuard(enabled = true) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    if (!localStorage.getItem('token')) {
      const next = window.location.pathname + window.location.search;
      router.push(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [enabled, router]);
}
