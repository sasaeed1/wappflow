'use client';

import { ConfirmProvider } from '@/lib/confirm';
import { SoundProvider } from '@/lib/sounds';
import { PlanProvider } from '@/lib/plan';
import { PlanLockStyles } from '@/components/PlanLock';
import PlanWelcomeModal from '@/components/PlanWelcomeModal';

export default function Providers({ children }) {
  return (
    <ConfirmProvider>
      <SoundProvider>
        <PlanProvider>
          <PlanLockStyles />
          <PlanWelcomeModal />
          {children}
        </PlanProvider>
      </SoundProvider>
    </ConfirmProvider>
  );
}
