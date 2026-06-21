'use client';
import { usePathname } from 'next/navigation';
import ControlShell from '@/components/control/ControlShell';

// Login renders bare; every other /control route is wrapped in the shell (which
// also enforces the platform-admin auth guard).
export default function ControlLayout({ children }) {
  const pathname = usePathname();
  if (pathname === '/control/login') return children;
  return <ControlShell>{children}</ControlShell>;
}
