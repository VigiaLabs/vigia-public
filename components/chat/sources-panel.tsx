'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEvidence } from './evidence-context';
import { SourcesPanelContent } from './sources-panel-content';
import { dedupeSources } from '@/lib/sources/utils';

export function SourcesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { payload, status, error, highlightedSourceId, setHighlightedSourceId } = useEvidence();
  const count = dedupeSources(payload?.sources ?? []).length;

  function handleClose() {
    setHighlightedSourceId(null);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close sources"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/10"
            onClick={handleClose}
          />

          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="sources-panel fixed right-0 top-0 z-50 flex h-screen w-full max-w-[400px] flex-col bg-white"
          >
            <header className="sources-panel-head">
              <h2 className="text-[15px] font-medium text-neutral-900">
                {count > 0 ? `${count} sources` : 'Sources'}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </header>

            <div className="sidebar-scroll flex-1 overflow-y-auto">
              <SourcesPanelContent
                payload={payload}
                status={status}
                error={error}
                highlightedSourceId={highlightedSourceId}
              />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
