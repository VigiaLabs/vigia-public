'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SidebarContent } from '@/components/layout/sidebar';
import { useSidebar } from '@/lib/context/sidebar-context';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return isMobile;
}

export function MobileSidebar() {
  const { isOpen, open, close } = useSidebar();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  function handleClose() {
    setIsSearchOpen(false);
    setSearchQuery('');
    close();
  }

  return (
    <>
      {isMobile && (
        <Sheet
          open={isOpen}
          onOpenChange={(openState) => {
            if (openState) {
              open();
            } else {
              handleClose();
            }
          }}
        >
          <SheetContent className="w-[300px] border-border/80 bg-sidebar-bg p-0 shadow-[8px_0_32px_rgba(0,0,0,0.08)] [&>button]:hidden">
            <SidebarContent
              onClose={handleClose}
              onNavigate={handleClose}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              isSearchOpen={isSearchOpen}
              onSearchOpenChange={setIsSearchOpen}
            />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
