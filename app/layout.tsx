import type { Metadata, Viewport } from 'next';
import { Fraunces, Manrope } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/app-shell';
import { AI } from '@/app/ai/provider';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#111827' },
    { media: '(prefers-color-scheme: dark)', color: '#f9f9f8' },
  ],
};

export const metadata: Metadata = {
  title: {
    default: 'VIGIA Search — Government Infrastructure Intelligence',
    template: '%s · VIGIA',
  },
  description:
    'Verify budgets, track spatial data, and audit infrastructure projects with AI-powered insights.',
  keywords: [
    'infrastructure',
    'government',
    'audit',
    'budget',
    'spatial data',
  ],
  authors: [{ name: 'VIGIA' }],
  creator: 'VIGIA',
  publisher: 'VIGIA',
  formatDetection: {
    email: false,
    telephone: false,
    address: false,
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VIGIA',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://vigia.example.com',
    siteName: 'VIGIA Search',
    title: 'VIGIA Search — Government Infrastructure Intelligence',
    description:
      'Verify budgets, track spatial data, and audit infrastructure projects with AI-powered insights.',
    images: [
      {
        url: '/icon-512.png',
        width: 512,
        height: 512,
        alt: 'VIGIA Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VIGIA Search',
    description: 'Government Infrastructure Intelligence Platform',
    images: ['/icon-512.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        {/* PWA mobile web app meta */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="VIGIA" />

        {/* Favicon + app icons */}
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="flex min-h-screen h-full bg-cream text-text-primary">
        <AI>
          <AppShell>{children}</AppShell>
        </AI>
      </body>
    </html>
  );
}