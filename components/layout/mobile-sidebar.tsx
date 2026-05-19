'use client';

import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SidebarContent } from '@/components/layout/sidebar';

export function MobileSidebar() {
  return (
    <div className="fixed left-4 top-4 z-30 md:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-md bg-surface transition-colors hover:bg-gray-100 active:bg-gray-200"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5 text-text-primary" />
          </button>
        </SheetTrigger>

        <SheetContent className="w-[280px] bg-sidebar-bg p-0">
          <aside className="flex h-full flex-col px-4 py-6">
            <SidebarContent />
          </aside>
        </SheetContent>
      </Sheet>
    </div>
  );
}