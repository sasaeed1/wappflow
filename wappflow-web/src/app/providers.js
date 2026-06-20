'use client';

import { ConfirmProvider } from '@/lib/confirm';
import { SoundProvider } from '@/lib/sounds';
import { PlanProvider } from '@/lib/plan';
import ImpersonationBanner from '@/components/ImpersonationBanner';

export default function Providers({ children }) {
  return (
    <ConfirmProvider>
      <SoundProvider>
        <PlanProvider>
          <ImpersonationBanner />
          {children}
        </PlanProvider>
      </SoundProvider>
    </ConfirmProvider>
  );
}
