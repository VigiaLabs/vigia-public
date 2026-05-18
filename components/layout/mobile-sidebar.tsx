'use client';

import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SidebarContent } from '@/components/layout/sidebar';

export function MobileSidebar() {
  return (
    <div className="fixed left-4 top-4 z-30 md:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <button className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface shadow-sm">
            <Menu className="h-5 w-5 text-text-primary" />
          </button>
        </SheetTrigger>

        <SheetContent side="left" className="w-[260px] bg-sidebar-bg p-0">
          <aside className="flex h-full flex-col px-5 py-6">
            <SidebarContent />
          </aside>
        </SheetContent>
      </Sheet>
    </div>
  );
}