'use client';

import { ConfirmProvider } from '@/lib/confirm';
import { SoundProvider } from '@/lib/sounds';

export default function Providers({ children }) {
  return (
    <ConfirmProvider>
      <SoundProvider>
        {children}
      </SoundProvider>
    </ConfirmProvider>
  );
}
