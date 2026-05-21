'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { UIPayload } from '@/lib/agents/ui-hook';

export type EvidenceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type EvidenceContextValue = {
  payload: UIPayload | null;
  status: EvidenceStatus;
  error: string | null;
  setPayload: (payload: UIPayload | null) => void;
  setStatus: (status: EvidenceStatus) => void;
  setError: (error: string | null) => void;
};

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

export function EvidenceProvider({ children }: { children: React.ReactNode }) {
  const [payload, setPayload] = useState<UIPayload | null>(null);
  const [status, setStatus] = useState<EvidenceStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const value = useMemo(
    () => ({ payload, status, error, setPayload, setStatus, setError }),
    [payload, status, error]
  );

  return <EvidenceContext.Provider value={value}>{children}</EvidenceContext.Provider>;
}

export function useEvidence() {
  const context = useContext(EvidenceContext);
  if (!context) {
    return { payload: null, status: 'idle' as const, error: null, submit: () => {}, reset: () => {} };
  }
  return context;
}
