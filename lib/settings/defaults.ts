import type { AppPreferences } from './types';

export const DEFAULT_PREFERENCES: AppPreferences = {
  defaultLanguage: 'auto',
  autoDetectLanguage: true,
  speakResponses: false,
  reduceMotion: false,
  textSize: 'comfortable',
  retentionDays: 45,
  responseStyle: 'citizen-friendly',
  offlineAlerts: true,
};
