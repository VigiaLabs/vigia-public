'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { pruneOldThreads } from '@/lib/db';
import {
  getPreferencesSnapshot,
  getServerPreferencesSnapshot,
  initPreferencesStore,
  resetPreferences as resetStorePreferences,
  setPreferences as setStorePreferences,
  subscribePreferences,
} from '@/lib/settings/store';
import type { AppPreferences } from '@/lib/settings/types';

type SettingsContextValue = {
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
  resetPreferences: () => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const preferences = useSyncExternalStore(
    subscribePreferences,
    getPreferencesSnapshot,
    getServerPreferencesSnapshot
  );

  useEffect(() => {
    initPreferencesStore();

    const retentionDays = getPreferencesSnapshot().retentionDays;
    void pruneOldThreads(retentionDays).then((deleted) => {
      if (deleted > 0) {
        window.dispatchEvent(new Event('vigia:threads-updated'));
      }
    });
  }, []);

  const updatePreferences = useCallback((patch: Partial<AppPreferences>) => {
    setStorePreferences(patch);
  }, []);

  const resetPreferences = useCallback(() => {
    resetStorePreferences();
  }, []);

  const value = useMemo(
    () => ({ preferences, updatePreferences, resetPreferences }),
    [preferences, updatePreferences, resetPreferences]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}
