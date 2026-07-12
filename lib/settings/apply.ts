import type { AppPreferences } from './types';

export function applyPreferencesToDocument(preferences: AppPreferences): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.dataset.textSize = preferences.textSize;
  root.dataset.reduceMotion = preferences.reduceMotion ? 'true' : 'false';
  delete root.dataset.theme;
  root.style.colorScheme = 'light';
}
