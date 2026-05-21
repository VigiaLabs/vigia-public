'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Clock3, Home, Plus } from 'lucide-react';
import { BottomSheet, BottomSheetContent, BottomSheetTrigger } from '@/components/ui/bottom-sheet';
import { QueryHistory } from '@/components/layout/query-history';
import { MobileSourcesSheet } from '@/components/chat/mobile-sources-sheet';

export function MobileBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === '/';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/80 bg-white/90 px-4 pb-[calc(env(safe-area-inset-bottom,0)+1rem)] pt-2 shadow-[0_-10px_30px_rgba(18,14,10,0.12)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md items-end justify-between">
        <div className="flex items-end gap-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className={`flex flex-col items-center gap-1 text-[11px] font-semibold ${
              isHome ? 'text-text-primary' : 'text-text-muted'
            }`}
          >
            <Home className="h-5 w-5" />
            Home
          </button>
          <MobileSourcesSheet variant="nav" />
        </div>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1f3a5f] text-white shadow-[0_10px_24px_rgba(18,14,10,0.18)]"
          aria-label="New thread"
        >
          <Plus className="h-5 w-5" />
        </button>

        <BottomSheet>
          <BottomSheetTrigger asChild>
            <button
              type="button"
              className="flex flex-col items-center gap-1 text-[11px] font-semibold text-text-muted"
            >
              <Clock3 className="h-5 w-5" />
              History
            </button>
          </BottomSheetTrigger>
          <BottomSheetContent className="bg-[#fdfaf4]">
            <div className="space-y-4">
              <div className="text-sm font-semibold text-text-primary">Recent searches</div>
              <QueryHistory onSelect={(threadId) => router.push(`/t/${threadId}`)} />
            </div>
          </BottomSheetContent>
        </BottomSheet>
      </div>
    </div>
  );
}
