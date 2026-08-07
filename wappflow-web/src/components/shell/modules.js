'use client';

import { Users, Camera, FileSignature, LayoutDashboard, UserCheck, Inbox, FileText, Calendar, BarChart2 } from 'lucide-react';
import AICommandCenter from '@/components/AICommandCenter';
import FloatingChat from '@/components/FloatingChat';
import StudioCopilot from '@/components/StudioCopilot';

// Module registry — the one place that knows what modules exist and what each one's
// navigation is (Phase 2). Four shells each hard-coded their own copy of this; the
// app-switcher then hard-coded a FIFTH copy with different targets.
//
// `dialectClass` is how one shell hosts the D8 dialects without flattening them:
// Studio's .ms-root is a token-REMAP scope, so any PROP-002 primitive rendered inside
// it automatically wears the Studio look. The shell skeleton unifies; the CSS scope
// stays exactly as ratified. (Contracts' dialect is .cs-doc and lives in page content,
// so Contracts needs no dialect class at all.)

export const MODULES = {
  crm: {
    key: 'crm',
    label: 'WappFlow CRM',
    home: '/dashboard',
    icon: Users,
    mark: 'linear-gradient(135deg,#6366f1,#4f46e5)',
    notifications: true,
    fabs: [AICommandCenter, FloatingChat],
    nav: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/leads-list', label: 'Leads', icon: Users, match: 'prefix' },
      { href: '/clients', label: 'Clients', icon: UserCheck },
      // Renamed from "Inbox": that label described team chat, while the product calls
      // this module Communications everywhere else (audit item comms-4).
      { href: '/chat', label: 'Communications', icon: Inbox },
      { href: '/invoices', label: 'Invoices', icon: FileText },
      { href: '/bookings', label: 'Bookings', icon: Calendar },
      { href: '/reports', label: 'Analytics', icon: BarChart2, lockFeature: 'analytics', requiredPlan: 'Studio' },
    ],
  },
  studio: {
    key: 'studio',
    label: 'Media Studio',
    home: '/studio',
    icon: Camera,
    mark: 'linear-gradient(135deg,#0e0e11,#3a3a44)',
    dialectClass: 'ms-root',
    fabs: [StudioCopilot],
    nav: [
      { href: '/studio', label: 'Shoots' },
      { href: '/studio/portfolio', label: 'Portfolio' },
    ],
  },
  contracts: {
    key: 'contracts',
    label: 'Contracts Studio',
    home: '/contracts',
    icon: FileSignature,
    mark: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
    nav: [
      { href: '/contracts', label: 'Overview' },
      { href: '/contracts/vault', label: 'Client Vault' },
      { href: '/contracts/analytics', label: 'Analytics' },
    ],
  },
};

export const MODULE_ORDER = ['crm', 'studio', 'contracts'];

/** Active-state rule: exact by default, prefix where a module owns a subtree. */
export function isNavActive(pathname, item) {
  if (!pathname) return false;
  return item.match === 'prefix'
    ? pathname === item.href || pathname.startsWith(item.href + '/')
    : pathname === item.href;
}
