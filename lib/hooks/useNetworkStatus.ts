'use client';

import { useState, useEffect, useCallback } from 'react';

export type NetworkMode = 'online' | 'degraded' | 'offline';

export interface NetworkStatus {
  mode: NetworkMode;
  latencyMs: number | null;
  lastChecked: number;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    mode: 'online',
    latencyMs: null,
    lastChecked: Date.now(),
  });

  const probe = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus({ mode: 'offline', latencyMs: null, lastChecked: Date.now() });
      return;
    }

    try {
      const start = performance.now();
      const res = await fetch('/api/health', {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      const latency = performance.now() - start;

      if (!res.ok || latency > 2000) {
        setStatus({ mode: 'degraded', latencyMs: latency, lastChecked: Date.now() });
      } else {
        setStatus({ mode: 'online', latencyMs: latency, lastChecked: Date.now() });
      }
    } catch {
      setStatus({ mode: 'offline', latencyMs: null, lastChecked: Date.now() });
    }
  }, []);

  useEffect(() => {
    probe();
    const interval = setInterval(probe, 15_000);
    window.addEventListener('online', probe);
    window.addEventListener('offline', probe);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', probe);
      window.removeEventListener('offline', probe);
    };
  }, [probe]);

  return status;
}
