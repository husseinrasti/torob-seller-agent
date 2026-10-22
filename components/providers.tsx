'use client';

import { ThemeProvider } from 'next-themes';
import { Direction } from 'radix-ui';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <Direction.DirectionProvider dir="rtl">
        {children}
        <Toaster position="top-center" dir="rtl" duration={2500} />
      </Direction.DirectionProvider>
    </ThemeProvider>
  );
}
