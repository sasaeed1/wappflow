'use client';

import { ConfirmProvider } from '@/lib/confirm';
import { SoundProvider } from '@/lib/sounds';
import { PlanProvider } from '@/lib/plan';

export default function Providers({ children }) {
  return (
    <ConfirmProvider>
      <SoundProvider>
        <PlanProvider>
          {children}
        </PlanProvider>
      </SoundProvider>
    </ConfirmProvider>
  );
}
