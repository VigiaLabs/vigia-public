'use client';

import { useState } from 'react';
import {
  ContradictionBanner,
  SeverityBadge,
  BudgetDeltaWidget,
  MapOverlay,
} from '@/components/vigia-widgets';

type Tab = 'answer' | 'sources' | 'maps';

export interface TabbedResultsProps {
  auditFinding: string;
  contradictionVerified: boolean;
  evidenceImages?: Array<{ url: string; severity: string; label: string }>;
  budgetData?: { allocated: number; disbursed: number; currency: string; percentDisbursed: number };
  spatialMarkers?: Array<{ lat: number; lng: number; label: string; severity: string }>;
  totalLatencyMs: number;
  nodeCount: number;
}

export function TabbedResults({
  auditFinding,
  contradictionVerified,
  evidenceImages,
  budgetData,
  spatialMarkers,
  totalLatencyMs,
  nodeCount,
}: TabbedResultsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('answer');

  const hasSources = !!(evidenceImages?.length || budgetData);
  const hasMaps = !!spatialMarkers?.length;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex gap-2 border-b border-border pb-2">
        {(['answer', 'sources', 'maps'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shell-chip capitalize ${
              activeTab === tab
                ? 'shell-chip-active'
                : 'shell-chip-inactive'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'answer' && (
        <div className="space-y-4">
          {contradictionVerified && <ContradictionBanner />}
          <div className="shell-bubble-assistant whitespace-pre-wrap">
            {auditFinding}
          </div>
        </div>
      )}

      {activeTab === 'sources' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {evidenceImages?.map((img, i) => (
            <SeverityBadge key={i} severity={img.severity} findings={[img.label]} imageUrl={img.url} />
          ))}
          {budgetData && (
            <BudgetDeltaWidget
              allocated={budgetData.allocated}
              disbursed={budgetData.disbursed}
              currency={budgetData.currency}
              percentDisbursed={budgetData.percentDisbursed}
            />
          )}
          {!hasSources && (
            <div className="py-4 text-sm text-text-muted">No source data available for this query.</div>
          )}
        </div>
      )}

      {activeTab === 'maps' && (
        <div className="space-y-3">
          {spatialMarkers?.map((marker, i) => (
            <MapOverlay key={i} lat={marker.lat} lng={marker.lng} label={marker.label} severity={marker.severity} />
          ))}
          {!hasMaps && (
            <div className="py-4 text-sm text-text-muted">No location data available. Toggle location to include GPS.</div>
          )}
        </div>
      )}

      <div className="border-t border-border pt-2 text-xs text-text-muted">
        Pipeline completed in {totalLatencyMs}ms • {nodeCount} nodes executed
        {contradictionVerified && ' • Contradiction verified'}
      </div>
    </div>
  );
}
