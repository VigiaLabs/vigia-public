'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEvidence } from './evidence-context';
import { SourceCarousel } from './source-carousel';
import { EvidenceGallery } from './evidence-gallery';
import { FinancialBar } from './financial-bar';
import { MapOverlay } from '@/components/vigia-widgets';

export function SourcesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { payload, status, error } = useEvidence();
  const sources = payload?.sources ?? [];
  const evidenceImages = payload?.evidenceImages ?? [];
  const budgetData = payload?.budgetData;
  const spatialMarkers = payload?.spatialMarkers ?? [];

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="fixed right-0 top-0 z-50 flex h-screen w-[420px] flex-col border-l border-border/80 bg-white px-6 py-6 shadow-[0_10px_40px_rgba(0,0,0,0.06)]"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-semibold text-text-primary">Sources</div>
              <div className="text-xs text-text-muted">Sources for the selected assistant reply</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sources"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-black/[0.04]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-5 overflow-y-auto">
            {status === 'loading' && (
              <div className="shell-muted-card p-4 text-xs text-text-muted">Gathering verified evidence...</div>
            )}
            {status === 'error' && error && (
              <div className="shell-card p-4 text-xs text-red-700">{error}</div>
            )}

            <div>
              <div className="shell-section-label">Evidence</div>
              <EvidenceGallery images={evidenceImages} />
            </div>

            <div>
              <SourceCarousel sources={sources} />
            </div>

            <div>
              <div className="shell-section-label">Budget signal</div>
              <FinancialBar budgetData={budgetData} />
            </div>

            <div>
              <div className="shell-section-label">Telemetry</div>
              {spatialMarkers.length ? (
                <div className="space-y-3">
                  {spatialMarkers.map((marker, i) => (
                    <MapOverlay key={`${marker.lat}-${marker.lng}-${i}`} lat={marker.lat} lng={marker.lng} label={marker.label} severity={marker.severity} />
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-xs text-text-muted">No telemetry evidence available yet.</div>
              )}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
