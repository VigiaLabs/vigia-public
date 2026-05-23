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
  sources?: Array<{ id: string; label: string; trustLevel: string; url?: string }>;
  totalLatencyMs: number;
  nodeCount: number;
}

export function TabbedResults({
  auditFinding,
  contradictionVerified,
  evidenceImages,
  budgetData,
  spatialMarkers,
  sources,
  totalLatencyMs,
  nodeCount,
}: TabbedResultsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('answer');

  const hasSources = !!(evidenceImages?.length || budgetData || sources?.length);
  const hasMaps = !!spatialMarkers?.length;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2 rounded-full border border-border bg-white p-1 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
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
          <div>
            <div className="shell-answer-body whitespace-pre-wrap">{auditFinding}</div>
          </div>
        </div>
      )}

      {activeTab === 'sources' && (
        <div className="space-y-3">
          {sources && sources.length > 0 && (
            <div className="space-y-2">
              {sources.map((src, i) => (
                <div key={src.id || i} className="flex items-start gap-3 rounded-lg border border-border/60 bg-white/60 px-3 py-2.5">
                  <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                    src.trustLevel === 'legally-binding' ? 'bg-emerald-500' :
                    src.trustLevel === 'official-portal' ? 'bg-blue-500' :
                    src.trustLevel === 'verified-spatial' ? 'bg-amber-500' : 'bg-gray-400'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary truncate">{src.label}</div>
                    {src.url && (
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline truncate block"
                      >
                        {src.url}
                      </a>
                    )}
                    <span className="text-[10px] uppercase tracking-wider text-text-muted">{src.trustLevel?.replace('-', ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
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
          </div>
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

      <div className="border-t border-border/70 pt-2 text-xs text-text-muted">
        Pipeline completed in {totalLatencyMs}ms • {nodeCount} nodes executed
        {contradictionVerified && ' • Contradiction verified'}
      </div>
    </div>
  );
}
