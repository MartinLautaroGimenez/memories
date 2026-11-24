import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/reenie-beanie/400.css';
import './app.css';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { ToastProvider } from '@/components/Toast';

export const generateMetadata = (): Metadata => ({
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
  title: { default: 'Memories', template: '%s · Memories' },
  description: 'Tus fotos de viajes y eventos en un lugar propio.',
  applicationName: 'Memories',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Memories', statusBarStyle: 'default' },
  openGraph: { images: ['/og-image.png'] },
  robots: { index: false, follow: false },
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#E9EEF0' },
    { media: '(prefers-color-scheme: dark)', color: '#170D0B' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('theme')?.value;
  return (
    <html lang="es" data-theme={theme === 'dark' || theme === 'light' ? theme : undefined} suppressHydrationWarning>
      <body>
        <div className="surface" aria-hidden="true" />
        <div className="fx" id="fx" aria-hidden="true" />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
