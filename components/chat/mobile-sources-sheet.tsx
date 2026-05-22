'use client';

import { FileText } from 'lucide-react';
import { BottomSheet, BottomSheetContent, BottomSheetTrigger } from '@/components/ui/bottom-sheet';
import { ActionBlock } from '@/components/chat/action-block';
import { EvidenceGallery } from '@/components/chat/evidence-gallery';
import { FinancialBar } from '@/components/chat/financial-bar';
import { SourceCarousel } from '@/components/chat/source-carousel';
import { useEvidence } from '@/components/chat/evidence-context';
import { MapOverlay } from '@/components/vigia-widgets';

type Variant = 'chip' | 'nav';

export function MobileSourcesSheet({ variant = 'chip' }: { variant?: Variant }) {
  const { payload, status, error } = useEvidence();
  const sources = payload?.sources ?? [];
  const evidenceImages = payload?.evidenceImages ?? [];
  const budgetData = payload?.budgetData;
  const spatialMarkers = payload?.spatialMarkers ?? [];
  const isNav = variant === 'nav';

  return (
    <BottomSheet>
      <BottomSheetTrigger asChild>
        {isNav ? (
          <button
            type="button"
            className="flex flex-col items-center gap-1 text-[11px] font-semibold text-text-muted"
          >
            <FileText className="h-5 w-5" />
            Sources
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-text-secondary shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-colors hover:bg-[#fafafa]"
          >
            <FileText className="h-3.5 w-3.5" />
            Sources
          </button>
        )}
      </BottomSheetTrigger>
      <BottomSheetContent className="bg-white">
        <div className="space-y-6">
          {status === 'loading' && (
            <div className="shell-muted-card p-4 text-xs text-text-muted">
              Gathering verified evidence...
            </div>
          )}
          {status === 'error' && error && (
            <div className="shell-card p-4 text-xs text-red-700">
              {error}
            </div>
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
                  <MapOverlay
                    key={`${marker.lat}-${marker.lng}-${i}`}
                    lat={marker.lat}
                    lng={marker.lng}
                    label={marker.label}
                    severity={marker.severity}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs text-text-muted">
                No telemetry evidence available yet.
              </div>
            )}
          </div>
          <ActionBlock />
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
