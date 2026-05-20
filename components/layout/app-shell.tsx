'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';
import { PWAInstallBadge } from '@/components/ui/pwa-install-badge';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PWAInstallBadge />
      <Sidebar />
      <MobileSidebar />
      <main className="flex-1 md:ml-[260px] bg-cream">{children}</main>
    </>
  );
}