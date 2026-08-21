'use client';

import { ConfirmProvider } from '@/lib/confirm';
import { ToastViewport } from '@/components/ui/Toast';
import { SoundProvider } from '@/lib/sounds';
import { PlanProvider } from '@/lib/plan';
import { RealtimeProvider } from '@/components/shell/realtime';
import { PlanLockStyles } from '@/components/PlanLock';
import UsageWarnings from '@/components/UsageWarnings';
import ImpersonationBanner from '@/components/ImpersonationBanner';

export default function Providers({ children }) {
  return (
    <ConfirmProvider>
      <SoundProvider>
        <PlanProvider>
          {/* One SSE connection for the whole app. Mounted here rather than in
              AppShell because the shell still remounts per route — the stream
              must survive navigation, not restart with it. */}
          <RealtimeProvider>
            <PlanLockStyles />
            <UsageWarnings />
            <ImpersonationBanner />
            <ToastViewport />
            {children}
          </RealtimeProvider>
        </PlanProvider>
      </SoundProvider>
    </ConfirmProvider>
  );
}
