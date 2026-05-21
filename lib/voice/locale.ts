import type { VoiceLocale, VoiceProfile } from '@/types/voice';

export const DEFAULT_VOICE_LOCALE: VoiceLocale = 'en-IN';

export const VOICE_PROFILES: Record<VoiceLocale, VoiceProfile> = {
  'en-IN': {
    locale: 'en-IN',
    langCode: 'en-IN',
    voiceName: 'en-IN-NeerjaNeural',
    label: 'English (India)',
  },
  'hi-IN': {
    locale: 'hi-IN',
    langCode: 'hi-IN',
    voiceName: 'hi-IN-SwaraNeural',
    label: 'Hindi',
  },
  'ta-IN': {
    locale: 'ta-IN',
    langCode: 'ta-IN',
    voiceName: 'ta-IN-PallaviNeural',
    label: 'Tamil',
  },
};

const DEVANAGARI = /[\u0900-\u097F]/;
const TAMIL = /[\u0B80-\u0BFF]/;

/** Map Deepgram / BCP-47 codes to a supported voice locale. */
export function normalizeLanguageCode(code: string | undefined | null): VoiceLocale | null {
  if (!code) return null;

  const normalized = code.trim().toLowerCase().replace('_', '-');
  if (normalized.startsWith('hi')) return 'hi-IN';
  if (normalized.startsWith('ta')) return 'ta-IN';
  if (normalized.startsWith('en')) return 'en-IN';

  return null;
}

/** Infer locale from Unicode script in text (Devanagari → Hindi, Tamil block → Tamil). */
export function detectLocaleFromScript(text: string): VoiceLocale | null {
  if (DEVANAGARI.test(text)) return 'hi-IN';
  if (TAMIL.test(text)) return 'ta-IN';
  return null;
}

export type ResolveVoiceLocaleInput = {
  text: string;
  /** Locale from STT (e.g. Deepgram detected_language). */
  sttLocale?: VoiceLocale | null;
  /** Locale pinned for the current voice turn (passed from client). */
  preferredLocale?: VoiceLocale | null;
};

/**
 * Resolve TTS/chat locale: preferred turn locale → native script in text → STT → default.
 */
export function resolveVoiceLocale(input: ResolveVoiceLocaleInput): VoiceLocale {
  if (input.preferredLocale && isVoiceLocale(input.preferredLocale)) {
    return input.preferredLocale;
  }

  const scriptLocale = detectLocaleFromScript(input.text);
  if (scriptLocale) return scriptLocale;

  if (input.sttLocale && isVoiceLocale(input.sttLocale)) {
    return input.sttLocale;
  }

  return DEFAULT_VOICE_LOCALE;
}

export function isVoiceLocale(value: string): value is VoiceLocale {
  return value === 'en-IN' || value === 'hi-IN' || value === 'ta-IN';
}

export function getVoiceProfile(locale: VoiceLocale): VoiceProfile {
  return VOICE_PROFILES[locale];
}

const LOCALE_SYSTEM_HINTS: Record<VoiceLocale, string> = {
  'en-IN':
    'Respond in Indian English. Use clear, concise sentences suitable for text-to-speech.',
  'hi-IN':
    'Respond in Hindi (हिन्दी). Prefer Devanagari script. Keep sentences concise for text-to-speech.',
  'ta-IN':
    'Respond in Tamil (தமிழ்). Prefer Tamil script. Keep sentences concise for text-to-speech.',
};

export function buildMultilingualSystemPrompt(basePrompt: string, locale: VoiceLocale): string {
  return `${basePrompt}\n\n${LOCALE_SYSTEM_HINTS[locale]}`;
}
