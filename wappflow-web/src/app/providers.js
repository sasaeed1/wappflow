'use client';

import { ConfirmProvider } from '@/lib/confirm';
import { SoundProvider } from '@/lib/sounds';
import { PlanProvider } from '@/lib/plan';
import { PlanLockStyles } from '@/components/PlanLock';
import UsageWarnings from '@/components/UsageWarnings';

export default function Providers({ children }) {
  return (
    <ConfirmProvider>
      <SoundProvider>
        <PlanProvider>
          <PlanLockStyles />
          <UsageWarnings />
          {children}
        </PlanProvider>
      </SoundProvider>
    </ConfirmProvider>
  );
}
