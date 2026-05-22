'use client';

import { Globe, Image, ScanSearch } from 'lucide-react';
import { useState } from 'react';
import { SidebarTrigger } from '@/components/layout/sidebar-trigger';
import { useSidebar } from '@/lib/context/sidebar-context';
import { cn } from '@/lib/utils';

const tabs = [
  { label: 'Answer', icon: ScanSearch },
  { label: 'Links', icon: Globe },
  { label: 'Images', icon: Image },
] as const;

export function ChatHeader() {
  const [active, setActive] = useState(0);
  const { isOpen } = useSidebar();

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-white/90 pt-[env(safe-area-inset-top,0px)] backdrop-blur-xl">
      <div className="mx-auto max-w-[900px] px-4 md:px-6">
        {/* Mobile brand row */}
        <div className="flex items-center justify-between gap-3 py-2.5 md:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            {!isOpen && <SidebarTrigger />}
            <span className="truncate text-[15px] font-semibold tracking-[0.08em] text-text-primary">
              VIGIA
            </span>
          </div>
          <button className="shrink-0 rounded-full bg-text-primary px-3.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#27272a]">
            Share
          </button>
        </div>

        {/* Tabs row */}
        <div
          className={cn(
            'flex items-center justify-between gap-3',
            'pb-2.5 md:py-2.5',
            'md:pt-2.5'
          )}
        >
          <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab, index) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.label}
                  onClick={() => setActive(index)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    active === index
                      ? 'bg-[#f4f4f5] text-text-primary'
                      : 'text-text-muted hover:text-text-secondary'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
          <button className="hidden shrink-0 rounded-full bg-text-primary px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#27272a] md:inline-flex">
            Share
          </button>
        </div>
      </div>
    </header>
  );
}
