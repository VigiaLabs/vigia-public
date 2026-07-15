'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import { useOfflineRuntime } from '@/lib/edge/offline-context';
import { cn } from '@/lib/utils';

export function NetworkStatusBanner() {
  const runtime = useOfflineRuntime();
  if (
    runtime.mode === 'online' &&
    !runtime.stale &&
    runtime.pendingCount === 0 &&
    runtime.pendingQueryCount === 0
  ) {
    return null;
  }

  const lastSync = runtime.lastSyncAt ? new Date(runtime.lastSyncAt).toLocaleString() : 'not available';
  const queuedSearches =
    runtime.pendingQueryCount > 0
      ? ` · ${runtime.pendingQueryCount} queued search${runtime.pendingQueryCount === 1 ? '' : 'es'}`
      : '';
  const syncing = runtime.querySync.running ? ' · syncing now' : '';
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-950" role="status">
      {runtime.mode === 'offline' ? <CloudOff className="h-3.5 w-3.5" aria-hidden /> : <RefreshCw className={cn('h-3.5 w-3.5', runtime.querySync.running && 'animate-spin')} aria-hidden />}
      <span>
        {runtime.mode === 'offline'
          ? 'Offline: cached contacts remain available. Queued searches retry when you reconnect.'
          : runtime.pendingQueryCount > 0
            ? 'Online — retrying queued searches interrupted by a disconnect.'
            : 'Connectivity is degraded.'}
        {' '}Pack {runtime.packVersion ?? 'not loaded'} · last sync {lastSync}
        {runtime.stale ? ' · stale-data warning' : ''}
        {runtime.pendingCount > 0 ? ` · ${runtime.pendingCount} queued report${runtime.pendingCount === 1 ? '' : 's'}` : ''}
        {queuedSearches}
        {syncing}
      </span>
    </div>
  );
}
