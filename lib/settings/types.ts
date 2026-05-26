import type { VoiceLocale } from '@/types/voice';

export type ResponseStyle = 'concise' | 'detailed' | 'citizen-friendly';

export type TextSize = 'comfortable' | 'compact';

export type RetentionDays = 7 | 30 | 45 | 90;

export type AppPreferences = {
  defaultLanguage: VoiceLocale | 'auto';
  autoDetectLanguage: boolean;
  speakResponses: boolean;
  reduceMotion: boolean;
  textSize: TextSize;
  retentionDays: RetentionDays;
  responseStyle: ResponseStyle;
  offlineAlerts: boolean;
};

export type SettingsView =
  | 'main'
  | 'general'
  | 'appearance'
  | 'notifications'
  | 'personalization'
  | 'privacy'
  | 'shortcuts'
  | 'help';
