'use client';

import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  isRetrying?: boolean;
  lastError?: string | null;
  onRetry: () => void;
};

export function PendingQueryRetryCard({ isRetrying, lastError, onRetry }: Props) {
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-sm text-amber-950">
          {isRetrying ? (
            <span className="inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
              Running live search now…
            </span>
          ) : (
            <>
              This question is saved and will be answered when connectivity allows.
              {lastError ? ' The last attempt failed — try again.' : ' If it stays here, retry manually.'}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className={cn(
            'shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-950 transition-colors',
            'hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          {isRetrying ? 'Searching…' : 'Retry search now'}
        </button>
      </div>
      {lastError && !isRetrying && (
        <p className="mt-2 text-xs text-red-700">{lastError}</p>
      )}
    </div>
  );
}
