import AppShell from '@/components/shell/AppShell';

// Tab title for every /contracts/* route (absolute → overrides the root template).
export const metadata = { title: { absolute: 'Contracts Studio' } };

// Phase 2: the shell is mounted ONCE here instead of being imported and re-wrapped by
// each of the six pages (which re-wrapped it again on their loading branches). The
// chrome now persists across navigation within the module rather than remounting.
// The Contracts D8 dialect is .cs-doc and travels with page content, so it is untouched.
export default function ContractsLayout({ children }) {
  return <AppShell module="contracts">{children}</AppShell>;
}
