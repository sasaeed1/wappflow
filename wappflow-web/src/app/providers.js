'use client';

import { ConfirmProvider } from '@/lib/confirm';
import { ToastViewport } from '@/components/ui/Toast';
import { SoundProvider } from '@/lib/sounds';
import { PlanProvider } from '@/lib/plan';
import { PlanLockStyles } from '@/components/PlanLock';
import UsageWarnings from '@/components/UsageWarnings';
import ImpersonationBanner from '@/components/ImpersonationBanner';

export default function Providers({ children }) {
  return (
    <ConfirmProvider>
      <SoundProvider>
        <PlanProvider>
          <PlanLockStyles />
          <UsageWarnings />
          <ImpersonationBanner />
          <ToastViewport />
          {children}
        </PlanProvider>
      </SoundProvider>
    </ConfirmProvider>
  );
}
