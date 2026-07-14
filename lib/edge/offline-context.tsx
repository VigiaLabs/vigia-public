'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getPendingSubmissionCount, syncPendingSubmissions } from '@/lib/db';
import { useNetworkStatus, type NetworkMode } from '@/lib/hooks/useNetworkStatus';
import { getEdgePackMetadata, syncEdgeDatabase } from './sync';

type OfflineRuntimeState = {
  mode: NetworkMode;
  lastSyncAt: number;
  packVersion: string | null;
  verifiedAt: string | null;
  stale: boolean;
  pendingCount: number;
  refreshPendingCount: () => Promise<void>;
};

const OfflineRuntimeContext = createContext<OfflineRuntimeState | null>(null);
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

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

  const refreshPendingCount = useCallback(async () => setPendingCount(await getPendingSubmissionCount()), []);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const position = await getPosition();
      await syncEdgeDatabase(position.lat, position.lng);
      if (network.mode === 'online') await syncPendingSubmissions();
      const [pack, count] = await Promise.all([getEdgePackMetadata(), getPendingSubmissionCount()]);
      if (!cancelled) {
        setMetadata({ lastSyncAt: pack.lastSyncAt, version: pack.version, verifiedAt: pack.verifiedAt, checkedAt: Date.now() });
        setPendingCount(count);
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, [network.mode]);

  const value = useMemo<OfflineRuntimeState>(() => ({
    mode: network.mode,
    lastSyncAt: metadata.lastSyncAt,
    packVersion: metadata.version,
    verifiedAt: metadata.verifiedAt,
    stale: metadata.lastSyncAt === 0 || metadata.checkedAt - metadata.lastSyncAt > STALE_AFTER_MS,
    pendingCount,
    refreshPendingCount,
  }), [metadata, network.mode, pendingCount, refreshPendingCount]);

  return <OfflineRuntimeContext.Provider value={value}>{children}</OfflineRuntimeContext.Provider>;
}

export function useOfflineRuntime(): OfflineRuntimeState {
  const value = useContext(OfflineRuntimeContext);
  if (!value) throw new Error('useOfflineRuntime must be used inside OfflineRuntimeProvider');
  return value;
}
