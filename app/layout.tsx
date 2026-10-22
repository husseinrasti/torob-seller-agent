import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/components/providers';
import './globals.css';

const vazirmatn = localFont({
  src: '../public/fonts/Vazirmatn-Variable.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-vazirmatn',
});

export const metadata: Metadata = {
  title: 'همراه خرید — دستیار خرید حضوری',
  description: 'دستیار هوشمند خرید حضوری در تهران: انتخاب کالا، فروشنده‌های نزدیک، پیگیری موجودی و برنامه مراجعه.',
  applicationName: 'همراه خرید',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f766e',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable} suppressHydrationWarning>
      <body className="bg-muted/40 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
