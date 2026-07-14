'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import { useOfflineRuntime } from '@/lib/edge/offline-context';

export function NetworkStatusBanner() {
  const runtime = useOfflineRuntime();
  if (runtime.mode === 'online' && !runtime.stale && runtime.pendingCount === 0) return null;

  const lastSync = runtime.lastSyncAt ? new Date(runtime.lastSyncAt).toLocaleString() : 'not available';
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-950" role="status">
      {runtime.mode === 'offline' ? <CloudOff className="h-3.5 w-3.5" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
      <span>
        {runtime.mode === 'offline' ? 'Offline: source-linked cached contacts remain available.' : 'Connectivity is degraded.'}
        {' '}Pack {runtime.packVersion ?? 'not loaded'} · last sync {lastSync}
        {runtime.stale ? ' · stale-data warning' : ''}
        {runtime.pendingCount > 0 ? ` · ${runtime.pendingCount} queued report${runtime.pendingCount === 1 ? '' : 's'}` : ''}
      </span>
    </div>
  );
}
