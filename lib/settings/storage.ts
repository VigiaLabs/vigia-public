import { DEFAULT_PREFERENCES } from './defaults';
import type { AppPreferences } from './types';

const STORAGE_KEY = 'vigia-preferences';

export function loadPreferences(): AppPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    const parsed = JSON.parse(raw) as Partial<AppPreferences> & { theme?: unknown };
    const { theme: _ignoredTheme, ...rest } = parsed;
    return { ...DEFAULT_PREFERENCES, ...rest };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: AppPreferences): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
