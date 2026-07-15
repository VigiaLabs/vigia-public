'use client';

import { EvidenceGallery } from '@/components/chat/evidence-gallery';
import { FinancialBar } from '@/components/chat/financial-bar';
import { SourceList } from '@/components/chat/source-list';
import { MapOverlay } from '@/components/vigia-widgets';
import type { UIPayload } from '@/lib/agents/ui-hook';
import { dedupeSources } from '@/lib/sources/utils';

type Props = {
  payload: UIPayload | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  highlightedSourceId?: string | null;
};

export function SourcesPanelContent({
  payload,
  status,
  error,
  highlightedSourceId,
}: Props) {
  const sources = dedupeSources(payload?.sources ?? []);
  const evidenceImages = payload?.evidenceImages ?? [];
  const budgetData = payload?.budgetData;
  const spatialMarkers = payload?.spatialMarkers ?? [];

  if (status === 'loading') {
    return (
      <div>
        <p className="px-5 py-3 text-[12px] text-neutral-400">Loading sources…</p>
        <SourceList sources={[]} loading />
      </div>
    );
  }

  if (status === 'error' && error) {
    return <p className="px-5 py-6 text-[13px] text-red-600">{error}</p>;
  }

  return (
    <>
      <SourceList
        sources={sources}
        highlightedSourceId={highlightedSourceId}
        claims={payload?.claims ?? []}
      />

      {evidenceImages.length > 0 && (
        <section className="border-t border-neutral-100 px-5 py-5">
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Evidence</h3>
          <EvidenceGallery images={evidenceImages} />
        </section>
      )}

      {budgetData && (
        <section className="border-t border-neutral-100 px-5 py-5">
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Budget</h3>
          <FinancialBar budgetData={budgetData} />
        </section>
      )}

      {spatialMarkers.length > 0 && (
        <section className="border-t border-neutral-100 px-5 py-5">
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Telemetry</h3>
          <div className="space-y-3">
            {spatialMarkers.map((marker, i) => (
              <MapOverlay
                key={`${marker.lat}-${marker.lng}-${i}`}
                lat={marker.lat}
                lng={marker.lng}
                label={marker.title}
                severity={marker.severity}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
