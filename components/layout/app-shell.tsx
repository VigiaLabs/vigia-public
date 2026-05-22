'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { PWAInstallBadge } from '@/components/ui/pwa-install-badge';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, [pathname]);

  return (
    <>
      <PWAInstallBadge />
      <Sidebar />
      <MobileSidebar />
      <MobileBottomNav />
      <main className="flex-1 md:ml-[260px] bg-white">{children}</main>
    </>
  );
}