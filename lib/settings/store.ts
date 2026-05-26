import { applyPreferencesToDocument } from './apply';
import { DEFAULT_PREFERENCES } from './defaults';
import { loadPreferences, savePreferences } from './storage';
import type { AppPreferences } from './types';

type Listener = () => void;

const listeners = new Set<Listener>();

let preferences: AppPreferences = DEFAULT_PREFERENCES;
let initialized = false;

function notify() {
  listeners.forEach((listener) => listener());
}

export function getPreferencesSnapshot(): AppPreferences {
  return preferences;
}

export function getServerPreferencesSnapshot(): AppPreferences {
  return DEFAULT_PREFERENCES;
}

export function subscribePreferences(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPreferences(patch: Partial<AppPreferences>): void {
  preferences = { ...preferences, ...patch };
  savePreferences(preferences);
  applyPreferencesToDocument(preferences);
  notify();
}

export function resetPreferences(): void {
  preferences = { ...DEFAULT_PREFERENCES };
  savePreferences(preferences);
  applyPreferencesToDocument(preferences);
  notify();
}

export function initPreferencesStore(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  preferences = loadPreferences();
  applyPreferencesToDocument(preferences);
}
