'use client';

import { Direction } from 'radix-ui';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Direction.DirectionProvider dir="rtl">
      {children}
      <Toaster position="top-center" dir="rtl" />
    </Direction.DirectionProvider>
  );
}
