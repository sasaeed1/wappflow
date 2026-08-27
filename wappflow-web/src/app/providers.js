'use client';

import { ConfirmProvider } from '@/lib/confirm';
import { ToastViewport } from '@/components/ui/Toast';
import { SoundProvider } from '@/lib/sounds';
import { PlanProvider } from '@/lib/plan';
import { RealtimeProvider } from '@/components/shell/realtime';
import { PlanLockStyles } from '@/components/PlanLock';
import UsageWarnings from '@/components/UsageWarnings';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import UploadTray from '@/components/UploadTray';

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
            {/* Above the router: an upload keeps running and keeps reporting
                while you navigate. Mounted here for the same reason the SSE
                stream is — the shell remounts per route, this must not. */}
            <UploadTray />
            {children}
          </RealtimeProvider>
        </PlanProvider>
      </SoundProvider>
    </ConfirmProvider>
  );
}
