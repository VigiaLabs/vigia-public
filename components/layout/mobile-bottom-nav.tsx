'use client';

import { motion } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';
import { Clock3, Home, Plus } from 'lucide-react';
import { BottomSheet, BottomSheetContent, BottomSheetTrigger } from '@/components/ui/bottom-sheet';
import { QueryHistory } from '@/components/layout/query-history';

export function MobileBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === '/';

  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0)+1rem)] pt-2 shadow-[0_-1px_0_rgba(0,0,0,0.06)] backdrop-blur md:hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div className="mx-auto flex max-w-md items-end justify-between">
        <div className="flex items-end gap-4">
          <motion.button
            type="button"
            onClick={() => router.push('/')}
            className={`flex flex-col items-center gap-1 text-[11px] font-semibold ${
              isHome ? 'text-text-primary' : 'text-text-muted'
            }`}
            whileTap={{ scale: 0.94 }}
            whileHover={{ y: -1 }}
          >
            <Home className="h-5 w-5" />
            Home
          </motion.button>
        </div>

        <motion.button
          type="button"
          onClick={() => router.push('/')}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-white shadow-[0_4px_14px_rgba(0,0,0,0.26)]"
          aria-label="New thread"
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.03 }}
        >
          <Plus className="h-5 w-5" />
        </motion.button>

        <BottomSheet>
          <BottomSheetTrigger asChild>
            <motion.button
              type="button"
              className="flex flex-col items-center gap-1 text-[11px] font-semibold text-text-muted"
              whileTap={{ scale: 0.94 }}
              whileHover={{ y: -1 }}
            >
              <Clock3 className="h-5 w-5" />
              History
            </motion.button>
          </BottomSheetTrigger>
          <BottomSheetContent className="bg-white px-5 pb-8">
            <div className="space-y-1">
              <div className="text-base font-semibold tracking-tight text-text-primary">Recent</div>
              <p className="text-xs text-text-muted">Your infrastructure search history</p>
            </div>
            <div className="mt-4">
              <QueryHistory onSelect={(threadId) => router.push(`/t/${threadId}`)} />
            </div>
          </BottomSheetContent>
        </BottomSheet>
      </div>
    </motion.div>
  );
}
