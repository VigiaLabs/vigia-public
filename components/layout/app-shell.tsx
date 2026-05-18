'use client';

import { Sidebar } from '@/components/layout/sidebar';
import { MobileSidebar } from '@/components/layout/mobile-sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <MobileSidebar />
      <main className="flex-1 md:ml-[260px]">{children}</main>
    </>
  );
}