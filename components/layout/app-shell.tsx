'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';
import { SidebarSettingsPanel } from '@/components/layout/sidebar-settings';
import { PWAInstallBadge } from '@/components/ui/pwa-install-badge';
import { SidebarProvider } from '@/lib/context/sidebar-context';
import { SettingsProvider } from '@/lib/context/settings-context';

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
    <SettingsProvider>
      <SidebarProvider>
        <PWAInstallBadge />
        <Sidebar />
        <MobileSidebar />
        <MobileBottomNav />
        <SidebarSettingsPanel />
        <main className="flex-1 bg-white transition-[margin-left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:ml-[var(--sidebar-width,56px)]">
          {children}
        </main>
      </SidebarProvider>
    </SettingsProvider>
  );
}
