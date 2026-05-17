"use client";

import { Menu } from "lucide-react";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import { SidebarContent } from "@/components/layout/sidebar";

export function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="fixed top-4 left-4 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5 text-gray-600" />
        </button>
      </SheetTrigger>
      <SheetContent>
        <SidebarContent />
      </SheetContent>
    </Sheet>
  );
}
