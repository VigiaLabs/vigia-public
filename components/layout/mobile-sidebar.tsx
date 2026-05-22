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
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur transition-colors hover:bg-[#fafafa] active:bg-[#f4f4f5]"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5 text-text-primary" />
          </button>
        </SheetTrigger>

        <SheetContent className="w-[290px] bg-sidebar-bg p-0">
          <aside className="flex h-full flex-col px-4 py-6">
            <SidebarContent />
          </aside>
        </SheetContent>
      </Sheet>
    </div>
  );
}