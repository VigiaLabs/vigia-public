'use client';

import { ActionBlock } from '@/components/chat/action-block';
import { EvidenceGallery } from '@/components/chat/evidence-gallery';
import { FinancialBar } from '@/components/chat/financial-bar';
import { SourceCarousel } from '@/components/chat/source-carousel';
import { useEvidence } from '@/components/chat/evidence-context';
import { MapOverlay } from '@/components/vigia-widgets';

export function EvidenceRail() {
  const { payload, status, error } = useEvidence();
  const sources = payload?.sources ?? [];
  const evidenceImages = payload?.evidenceImages ?? [];
  const budgetData = payload?.budgetData;
  const spatialMarkers = payload?.spatialMarkers ?? [];

  return (
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

      <div className="shell-card p-4">
        <div className="shell-section-label">Evidence</div>
        <EvidenceGallery images={evidenceImages} />
      </div>
      <div className="shell-card p-4">
        <SourceCarousel sources={sources} />
      </div>
      <div className="shell-card p-4">
        <div className="shell-section-label">Budget signal</div>
        <FinancialBar budgetData={budgetData} />
      </div>
      <div className="shell-card p-4">
        <div className="shell-section-label">Telemetry</div>
        {spatialMarkers.length ? (
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
        ) : (
          <div className="mt-3 text-xs text-text-muted">
            No telemetry evidence available yet.
          </div>
        )}
      </div>
      <ActionBlock />
    </div>
  );
}
