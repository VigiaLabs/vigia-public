'use client';

import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { BottomSheet, BottomSheetContent, BottomSheetTrigger } from '@/components/ui/bottom-sheet';
import { ActionBlock } from '@/components/chat/action-block';
import { SourcesPanelContent } from '@/components/chat/sources-panel-content';
import { useEvidence } from '@/components/chat/evidence-context';
import { dedupeSources } from '@/lib/sources/utils';

type Variant = 'chip' | 'nav';

export function MobileSourcesSheet({ variant = 'chip' }: { variant?: Variant }) {
  const { payload, status, error, highlightedSourceId } = useEvidence();
  const count = dedupeSources(payload?.sources ?? []).length;
  const isNav = variant === 'nav';

  return (
    <BottomSheet>
      <BottomSheetTrigger asChild>
        {isNav ? (
          <motion.button
            type="button"
            className="flex flex-col items-center gap-1 text-[11px] font-semibold text-text-muted"
            whileTap={{ scale: 0.94 }}
            whileHover={{ y: -1 }}
          >
            <FileText className="h-5 w-5" />
            Sources
          </motion.button>
        ) : (
          <motion.button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary"
            whileTap={{ scale: 0.96 }}
            whileHover={{ y: -1 }}
          >
            <FileText className="h-3.5 w-3.5" />
            {count > 0 ? `${count} sources` : 'Sources'}
          </motion.button>
        )}
      </BottomSheetTrigger>
      <BottomSheetContent className="max-h-[85vh] bg-white px-0 pb-8 pt-0">
        <div className="border-b border-neutral-100 px-5 py-4">
          <h2 className="text-[15px] font-medium text-neutral-900">
            {count > 0 ? `${count} sources` : 'Sources'}
          </h2>
        </div>
        <SourcesPanelContent
          payload={payload}
          status={status}
          error={error}
          highlightedSourceId={highlightedSourceId}
        />
        <div className="px-5 pt-4">
          <ActionBlock />
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
