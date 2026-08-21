'use client';

import { useEffect, useState } from 'react';

// A tiny publish/subscribe for the counts the shell already fetches.
//
// ShellNotifications polls /api/notifications/summary once a minute for the bell.
// The nav needs one of those numbers too (unread team messages), and the obvious
// fix — a second component fetching the same endpoint — would double the polling
// Phase 4 just finished cutting down. So the bell publishes what it fetched and
// anything else in the shell reads it. One request, many readers.

let current = { todayLeads: 0, reminders: 0, unread: 0, comms: 0, total: 0 };
const listeners = new Set();

export function publishSummary(next) {
  current = { ...current, ...next };
  for (const fn of listeners) { try { fn(current); } catch {} }
}

export function useSummary() {
  const [summary, setSummary] = useState(current);
  useEffect(() => {
    listeners.add(setSummary);
    setSummary(current); // adopt whatever was already fetched before we mounted
    return () => { listeners.delete(setSummary); };
  }, []);
  return summary;
}
