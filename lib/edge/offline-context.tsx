'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ensureDbReady, getPendingSubmissionCount, getPendingQueryCount, syncPendingSubmissions } from '@/lib/db';
import { useNetworkStatus, type NetworkMode } from '@/lib/hooks/useNetworkStatus';
import { getEdgePackMetadata, syncEdgeDatabase } from './sync';
import {
  getPendingQuerySyncState,
  syncPendingQueries,
  type PendingQuerySyncState,
} from './pending-query-sync';

type OfflineRuntimeState = {
  mode: NetworkMode;
  lastSyncAt: number;
  packVersion: string | null;
  verifiedAt: string | null;
  stale: boolean;
  pendingCount: number;
  pendingQueryCount: number;
  querySync: PendingQuerySyncState;
  refreshPendingCount: () => Promise<void>;
  retryQueuedQueries: (threadId?: string) => Promise<void>;
};

const OfflineRuntimeContext = createContext<OfflineRuntimeState | null>(null);
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const QUERY_SYNC_POLL_MS = 5_000;

function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ lat: 0, lng: 0 });
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve({ lat: 0, lng: 0 }),
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 }
    );
  });
}

export function OfflineRuntimeProvider({ children }: { children: React.ReactNode }) {
  const network = useNetworkStatus();
  const [metadata, setMetadata] = useState({ lastSyncAt: 0, version: null as string | null, verifiedAt: null as string | null, checkedAt: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingQueryCount, setPendingQueryCount] = useState(0);
  const [querySync, setQuerySync] = useState<PendingQuerySyncState>(getPendingQuerySyncState);

  const refreshPendingCount = useCallback(async () => {
    const [submissions, queries] = await Promise.all([
      getPendingSubmissionCount(),
      getPendingQueryCount(),
    ]);
    setPendingCount(submissions);
    setPendingQueryCount(queries);
  }, []);

  const replayQueuedWork = useCallback(async (threadId?: string) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    await ensureDbReady();
    await Promise.allSettled([syncPendingSubmissions(), syncPendingQueries(threadId)]);
    await refreshPendingCount();
  }, [refreshPendingCount]);

  const retryQueuedQueries = useCallback(async (threadId?: string) => {
    await replayQueuedWork(threadId);
  }, [replayQueuedWork]);

  // Initial DB init + first replay pass.
  useEffect(() => {
    void ensureDbReady().then(() => replayQueuedWork());
  }, [replayQueuedWork]);

  // Replay whenever connectivity mode changes and browser reports online.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    void replayQueuedWork();
  }, [network.mode, replayQueuedWork]);

  // navigator.onLine flips before /api/health probe completes.
  useEffect(() => {
    const onOnline = () => { void replayQueuedWork(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [replayQueuedWork]);

  // Keep probing while work is queued. In weak coverage navigator.onLine can
  // remain true while health checks fail, so network.mode must not stop retries.
  useEffect(() => {
    if (pendingCount === 0 && pendingQueryCount === 0) return;

    const id = setInterval(() => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      void replayQueuedWork();
    }, QUERY_SYNC_POLL_MS);

    return () => clearInterval(id);
  }, [pendingCount, pendingQueryCount, replayQueuedWork]);

  useEffect(() => {
    const onSyncState = (event: Event) => {
      setQuerySync((event as CustomEvent<PendingQuerySyncState>).detail);
    };
    window.addEventListener('vigia:pending-query-sync-state', onSyncState);
    return () => window.removeEventListener('vigia:pending-query-sync-state', onSyncState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const position = await getPosition();
      await syncEdgeDatabase(position.lat, position.lng);
      const [pack, count, queryCount] = await Promise.all([
        getEdgePackMetadata(),
        getPendingSubmissionCount(),
        getPendingQueryCount(),
      ]);
      if (!cancelled) {
        setMetadata({ lastSyncAt: pack.lastSyncAt, version: pack.version, verifiedAt: pack.verifiedAt, checkedAt: Date.now() });
        setPendingCount(count);
        setPendingQueryCount(queryCount);
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, [network.mode]);

  useEffect(() => {
    const onCountChanged = () => { void refreshPendingCount(); };
    window.addEventListener('vigia:pending-count-changed', onCountChanged);
    return () => window.removeEventListener('vigia:pending-count-changed', onCountChanged);
  }, [refreshPendingCount]);

  const value = useMemo<OfflineRuntimeState>(() => ({
    mode: network.mode,
    lastSyncAt: metadata.lastSyncAt,
    packVersion: metadata.version,
    verifiedAt: metadata.verifiedAt,
    stale: metadata.lastSyncAt === 0 || metadata.checkedAt - metadata.lastSyncAt > STALE_AFTER_MS,
    pendingCount,
    pendingQueryCount,
    querySync,
    refreshPendingCount,
    retryQueuedQueries,
  }), [metadata, network.mode, pendingCount, pendingQueryCount, querySync, refreshPendingCount, retryQueuedQueries]);

  return <OfflineRuntimeContext.Provider value={value}>{children}</OfflineRuntimeContext.Provider>;
}

export function useOfflineRuntime(): OfflineRuntimeState {
  const value = useContext(OfflineRuntimeContext);
  if (!value) throw new Error('useOfflineRuntime must be used inside OfflineRuntimeProvider');
  return value;
}
