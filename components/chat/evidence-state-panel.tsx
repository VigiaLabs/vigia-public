'use client';

import { useState } from 'react';
import { ChevronDown, Database, ShieldCheck } from 'lucide-react';
import type { EvidenceClaimView, OfflineEvidenceState } from '@/types/evidence';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<EvidenceClaimView['status'], string> = {
  verified: 'Verified',
  derived: 'Derived',
  inferred: 'Inferred',
  unavailable: 'Unavailable',
  conflicted: 'Conflicting evidence',
};

const STATUS_STYLES: Record<EvidenceClaimView['status'], string> = {
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  derived: 'border-blue-200 bg-blue-50 text-blue-800',
  inferred: 'border-amber-200 bg-amber-50 text-amber-900',
  unavailable: 'border-neutral-200 bg-neutral-50 text-neutral-700',
  conflicted: 'border-red-200 bg-red-50 text-red-800',
};

function formatClaimValue(claim: EvidenceClaimView): string {
  if (claim.value === undefined) return 'No value published';
  if (typeof claim.value === 'number') {
    return `${claim.value.toLocaleString()}${claim.unit ? ` ${claim.unit}` : ''}`;
  }
  return `${String(claim.value)}${claim.unit ? ` ${claim.unit}` : ''}`;
}

export function EvidenceStatePanel({
  claims = [],
  offline,
}: {
  claims?: EvidenceClaimView[];
  offline?: OfflineEvidenceState;
}) {
  const [open, setOpen] = useState(false);
  if (claims.length === 0 && !offline) return null;

  const statuses = [...new Set(claims.map((claim) => claim.status))];

  return (
    <section className="rounded-xl border border-border/70 bg-[#fcfcfb]" aria-label="Evidence states">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden />
        <span className="text-xs font-semibold text-text-secondary">Evidence state</span>
        <span className="flex flex-1 flex-wrap gap-1.5">
          {statuses.map((status) => (
            <span key={status} className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLES[status])}>
              {STATUS_LABELS[status]}
            </span>
          ))}
          {offline?.mode === 'offline' && (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
              Cached offline
            </span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="space-y-2 border-t border-border/60 px-3 py-3">
          {offline && (
            <div className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs text-text-secondary">
              <Database className="mt-0.5 h-3.5 w-3.5" aria-hidden />
              <span>
                {offline.mode === 'offline' ? 'Offline cache' : 'Network evidence'}
                {offline.packVersion ? ` · pack ${offline.packVersion}` : ''}
                {offline.cacheAgeHours !== undefined ? ` · ${offline.cacheAgeHours}h old` : ''}
                {offline.stale ? ' · stale data warning' : ''}
              </span>
            </div>
          )}
          {claims.map((claim, index) => (
            <article key={`${claim.sourceId}-${claim.predicate}-${index}`} className="rounded-lg border border-border/60 bg-white p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', STATUS_STYLES[claim.status])}>
                  {STATUS_LABELS[claim.status]}
                </span>
                <span className="font-semibold text-text-primary">{claim.predicate}</span>
                {claim.financialType && <span className="text-text-muted">{claim.financialType}</span>}
                {claim.role && <span className="text-text-muted">{claim.role}</span>}
                {claim.maintenanceType && <span className="text-text-muted">{claim.maintenanceType}</span>}
              </div>
              <p className="mt-1.5 text-text-secondary">{formatClaimValue(claim)}</p>
              <p className="mt-1 break-words text-[11px] text-text-muted">
                Source field: {claim.sourceLocator ?? claim.sourceId} · retrieved {new Date(claim.retrievedAt).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
