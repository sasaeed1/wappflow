import AppShell from '@/components/shell/AppShell';

// Phase 2: the shell is mounted here instead of being imported and re-wrapped by every
// page (CRM pages re-wrapped it on each return path, so a loading state and its loaded
// state mounted the chrome separately). It now persists across navigation.
export default function Layout({ children }) {
  return <AppShell module="crm">{children}</AppShell>;
}
