import type { Metadata, Viewport } from 'next';
import { DemoBanner } from '@/components/ops/DemoBanner';
import './globals.css';

const fontVars = 'font-sans';

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Apex Ops CMMS',
  description:
    'Apex Ops CMMS — facility maintenance management (tenant APX-NUSA-01): work orders, field inspections with a real offline outbox, evidence capture, and audit ledger.',
  applicationName: 'Apex Ops',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Apex Ops',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`bg-surface text-ink antialiased ${fontVars}`}>
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
