import type { DetectedLanguage, VoiceLocale, VoiceProfile } from '@/types/voice';
import { getLastUserMessageText } from './extract-message-text';

export { getLastUserMessageText, extractMessageText } from './extract-message-text';

export const DEFAULT_VOICE_LOCALE: VoiceLocale = 'en-IN';

const LANGUAGE_METADATA: Record<string, { name: string; nativeName: string }> = {
  'en-IN': { name: 'English', nativeName: 'English' },
  'hi-IN': { name: 'Hindi', nativeName: 'हिन्दी' },
  'ta-IN': { name: 'Tamil', nativeName: 'தமிழ்' },
  'te-IN': { name: 'Telugu', nativeName: 'తెలుగు' },
  'mr-IN': { name: 'Marathi', nativeName: 'मराठी' },
  'bn-IN': { name: 'Bengali', nativeName: 'বাংলা' },
  'gu-IN': { name: 'Gujarati', nativeName: 'ગુજરાતી' },
  'kn-IN': { name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  'ml-IN': { name: 'Malayalam', nativeName: 'മലയാളം' },
  'pa-IN': { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  'or-IN': { name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  'ur-IN': { name: 'Urdu', nativeName: 'اردو' },
  'as-IN': { name: 'Assamese', nativeName: 'অসমীয়া' },
};

/** Indian locales passed to Azure STT language identification. */
export const SUPPORTED_INDIAN_LOCALES: VoiceLocale[] = Object.keys(LANGUAGE_METADATA);

const AZURE_NEURAL_VOICES: Record<string, { voiceName: string; label: string }> = {
  'en-IN': { voiceName: 'en-IN-NeerjaNeural', label: 'English (India)' },
  'hi-IN': { voiceName: 'hi-IN-SwaraNeural', label: 'Hindi' },
  'ta-IN': { voiceName: 'ta-IN-PallaviNeural', label: 'Tamil' },
  'te-IN': { voiceName: 'te-IN-ShrutiNeural', label: 'Telugu' },
  'mr-IN': { voiceName: 'mr-IN-AarohiNeural', label: 'Marathi' },
  'bn-IN': { voiceName: 'bn-IN-TanishaaNeural', label: 'Bengali' },
  'gu-IN': { voiceName: 'gu-IN-DhwaniNeural', label: 'Gujarati' },
  'kn-IN': { voiceName: 'kn-IN-SapnaNeural', label: 'Kannada' },
  'ml-IN': { voiceName: 'ml-IN-SobhanaNeural', label: 'Malayalam' },
  'pa-IN': { voiceName: 'pa-IN-VaaniNeural', label: 'Punjabi' },
  'or-IN': { voiceName: 'or-IN-SubhasiniNeural', label: 'Odia' },
  'ur-IN': { voiceName: 'ur-IN-GulNeural', label: 'Urdu' },
};

/** Map ISO 639-1 prefix to an India BCP-47 locale for STT/TTS. */
const LANG_PREFIX_TO_IN_LOCALE: Record<string, VoiceLocale> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  pa: 'pa-IN',
  or: 'or-IN',
  ur: 'ur-IN',
  as: 'as-IN',
};

const SCRIPT_DETECTORS: Array<{ pattern: RegExp; code: VoiceLocale }> = [
  { pattern: /[\u0900-\u097F]/, code: 'hi-IN' },
  { pattern: /[\u0B80-\u0BFF]/, code: 'ta-IN' },
  { pattern: /[\u0C00-\u0C7F]/, code: 'te-IN' },
  { pattern: /[\u0980-\u09FF]/, code: 'bn-IN' },
  { pattern: /[\u0A80-\u0AFF]/, code: 'gu-IN' },
  { pattern: /[\u0C80-\u0CFF]/, code: 'kn-IN' },
  { pattern: /[\u0D00-\u0D7F]/, code: 'ml-IN' },
  { pattern: /[\u0A00-\u0A7F]/, code: 'pa-IN' },
  { pattern: /[\u0B00-\u0B7F]/, code: 'or-IN' },
  { pattern: /[\u0600-\u06FF]/, code: 'ur-IN' },
];

const BCP47_PATTERN = /^[a-z]{2,3}-[a-z]{2}$/i;
const MIN_NATIVE_SCRIPT_CHARS = 2;
const MIN_NATIVE_SCRIPT_DOMINANCE = 0.4;

/** Common Malayalam words written in Latin script (Manglish). */
const MALAYALAM_ROMAN_WORDS = new Set([
  'alle', 'alla', 'allaa', 'anu', 'aanu', 'aano', 'appol', 'ariyilla', 'ariyo', 'ariyum', 'ariyunnu',
  'ariyunath', 'athu', 'avan', 'aval', 'engane', 'enikku', 'entha', 'enthelum', 'enthina', 'enthanu',
  'eppozha', 'ethra', 'evide', 'evideya', 'illa', 'ingane', 'ippol', 'ipo', 'ithu', 'kollam', 'kurichu',
  'mathi', 'mosam', 'njan', 'njangal', 'njammal', 'nalla', 'nee', 'ningal', 'ningakk', 'okke',
  'paranjhu', 'parayamo', 'parayoo', 'parayu', 'parayuka', 'patti', 'pinne', 'samsarichu', 'stithi',
  'undo', 'venda', 'venam', 'vishayam',
]);

const MALAYALAM_ROMAN_SUFFIX = /(?:kk|nte|ude|il|um|ne|athe|yunna?th?|yunnu|yilla|yum|yathe|yoo)$/i;
const MALAYALAM_ROMAN_DIGRAPH = /\b\w*(?:nj|zh|lh|rr)(?:\w+)\b/i;

/** Common Hindi words written in Latin script (Hinglish). */
const HINDI_ROMAN_WORDS = new Set([
  'aap', 'abhi', 'agar', 'aur', 'bahut', 'bata', 'bataiye', 'batao', 'bataye', 'batata', 'baare', 'bare',
  'chahiye', 'dijiye', 'gaya', 'haal', 'haan', 'hai', 'hain', 'hal', 'hoga', 'hogi', 'hoon', 'hum',
  'jankari', 'ji', 'ka', 'kaise', 'karna', 'karo', 'kar', 'ke', 'kha', 'kharab', 'ki', 'kisi', 'koi',
  'kripya', 'kya', 'kyun', 'kyu', 'lekin', 'magar', 'main', 'mein', 'mera', 'meri', 'mujhe', 'nahi',
  'nahin', 'par', 'phir', 'rasta', 'sadak', 'sakta', 'sakte', 'sakti', 'se', 'stithi', 'unka', 'unki',
  'uska', 'uski', 'woh', 'yeh', 'ye', 'yaha', 'yahan',
]);

const HINDI_ROMAN_SUFFIX = /(?:wala|wali|wale|karke|liya|gaya|gayi|sakte|sakta|sakti|enge|unga|ungi)$/i;

export function isVoiceLocale(value: string): value is VoiceLocale {
  return BCP47_PATTERN.test(value.trim());
}

export function toDetectedLanguage(code: VoiceLocale): DetectedLanguage {
  const normalized = normalizeLocaleCode(code);
  const meta = LANGUAGE_METADATA[normalized];
  if (meta) {
    return { code: normalized, ...meta };
  }

  const lang = normalized.split('-')[0]?.toLowerCase() ?? normalized;
  const name = lang.charAt(0).toUpperCase() + lang.slice(1);
  return { code: normalized, name, nativeName: name };
}

export function normalizeLocaleCode(code: string): VoiceLocale {
  const trimmed = code.trim().replace('_', '-');
  if (!trimmed) return DEFAULT_VOICE_LOCALE;

  const lower = trimmed.toLowerCase();
  if (LANGUAGE_METADATA[lower] || AZURE_NEURAL_VOICES[lower]) {
    return lower;
  }

  const [lang, region] = lower.split('-');
  if (lang && LANG_PREFIX_TO_IN_LOCALE[lang]) {
    return LANG_PREFIX_TO_IN_LOCALE[lang];
  }

  if (lang && region) {
    return `${lang}-${region.toUpperCase()}`;
  }

  if (lang && LANG_PREFIX_TO_IN_LOCALE[lang]) {
    return LANG_PREFIX_TO_IN_LOCALE[lang];
  }

  return DEFAULT_VOICE_LOCALE;
}

/** Map Deepgram / BCP-47 codes to a supported voice locale. */
export function normalizeLanguageCode(code: string | undefined | null): DetectedLanguage | null {
  if (!code?.trim()) return null;

  const normalized = code.trim().toLowerCase().replace('_', '-');
  const lang = normalized.split('-')[0] ?? normalized;

  if (BCP47_PATTERN.test(normalized)) {
    return toDetectedLanguage(normalized);
  }

  const mapped = LANG_PREFIX_TO_IN_LOCALE[lang];
  if (mapped) return toDetectedLanguage(mapped);

  return null;
}

function countScriptChars(text: string, pattern: RegExp): number {
  return (text.match(new RegExp(pattern.source, 'g')) ?? []).length;
}

function tokenizeLatinWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

/** Detect Malayalam written with Latin letters (Manglish). */
export function detectTransliteratedMalayalam(text: string): DetectedLanguage | null {
  const words = tokenizeLatinWords(text);
  if (words.length === 0) return null;

  let score = 0;
  for (const word of words) {
    if (MALAYALAM_ROMAN_WORDS.has(word)) {
      score += 2;
      continue;
    }
    if (MALAYALAM_ROMAN_SUFFIX.test(word)) {
      score += 1;
    }
  }

  if (MALAYALAM_ROMAN_DIGRAPH.test(text)) {
    score += 1;
  }

  const threshold = words.length <= 4 ? 2 : Math.max(2, Math.ceil(words.length * 0.2));
  if (score >= threshold) {
    return toDetectedLanguage('ml-IN');
  }

  return null;
}

/** Detect Hindi written with Latin letters (Hinglish). */
export function detectTransliteratedHindi(text: string): DetectedLanguage | null {
  const words = tokenizeLatinWords(text);
  if (words.length === 0) return null;

  let score = 0;
  for (const word of words) {
    if (HINDI_ROMAN_WORDS.has(word)) {
      score += 2;
      continue;
    }
    if (HINDI_ROMAN_SUFFIX.test(word)) {
      score += 1;
    }
  }

  const threshold = words.length <= 3 ? 2 : Math.max(2, Math.ceil(words.length * 0.2));
  if (score >= threshold) {
    return toDetectedLanguage('hi-IN');
  }

  return null;
}

function hasNativeScript(text: string): boolean {
  return detectLanguageFromNativeScript(text) !== null;
}

/** Detect plain English/Latin input (after ruling out Indian romanized text). */
function detectEnglishFromText(text: string): DetectedLanguage | null {
  if (hasNativeScript(text)) return null;
  if (detectTransliteratedMalayalam(text)) return null;
  if (detectTransliteratedHindi(text)) return null;

  const words = tokenizeLatinWords(text);
  if (words.length === 0) return null;

  const latinLetters = (text.match(/[a-zA-Z]/g) ?? []).length;
  const allLetters = (text.match(/\p{L}/gu) ?? []).length;
  if (allLetters === 0 || latinLetters / allLetters < 0.7) return null;

  return toDetectedLanguage(DEFAULT_VOICE_LOCALE);
}

function detectLanguageFromNativeScript(text: string): DetectedLanguage | null {
  const scores: Array<{ code: VoiceLocale; count: number }> = [];

  for (const { pattern, code } of SCRIPT_DETECTORS) {
    const count = countScriptChars(text, pattern);
    if (count > 0) {
      scores.push({ code, count });
    }
  }

  if (scores.length === 0) return null;

  scores.sort((a, b) => b.count - a.count);
  const best = scores[0];
  const totalNative = scores.reduce((sum, entry) => sum + entry.count, 0);
  const dominance = best.count / totalNative;

  const hasEnoughChars = best.count >= MIN_NATIVE_SCRIPT_CHARS;
  const isSingleScript = scores.length === 1 && best.count >= 1;
  const isDominantScript = dominance >= MIN_NATIVE_SCRIPT_DOMINANCE;

  if (!hasEnoughChars && !isSingleScript && !isDominantScript) {
    return null;
  }

  return toDetectedLanguage(best.code);
}

/** Infer locale from Unicode script in user text. */
export function detectLocaleFromScript(text: string): VoiceLocale | null {
  return detectLanguageFromText(text)?.code ?? null;
}

/** Detect language from native script, romanized Indian text, or English. */
export function detectLanguageFromText(text: string): DetectedLanguage | null {
  if (!text.trim()) return null;

  const fromScript = detectLanguageFromNativeScript(text);
  if (fromScript) return fromScript;

  const manglish = detectTransliteratedMalayalam(text);
  if (manglish) return manglish;

  const hinglish = detectTransliteratedHindi(text);
  if (hinglish) return hinglish;

  return detectEnglishFromText(text);
}

/**
 * Resolve language for a single turn, merging text heuristics with STT/client locale.
 * Regional STT locale wins over the English Latin fallback for romanized voice transcripts.
 */
export function resolveTurnLanguage(
  text: string,
  requestLanguage?: VoiceLocale | null
): DetectedLanguage | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fromText = detectLanguageFromText(trimmed);
  const fromRequest =
    requestLanguage && isVoiceLocale(requestLanguage)
      ? toDetectedLanguage(requestLanguage)
      : null;

  const indianRoman =
    detectTransliteratedHindi(trimmed) ?? detectTransliteratedMalayalam(trimmed);

  // Latest message with a clear Indian language signal always wins (mid-thread switches).
  if (hasNativeScript(trimmed) || indianRoman) {
    return fromText;
  }

  // Voice/STT locale wins over the Latin→English text fallback for romanized transcripts.
  if (fromRequest && fromRequest.code !== DEFAULT_VOICE_LOCALE) {
    return fromRequest;
  }

  if (fromText) return fromText;
  if (fromRequest) return fromRequest;
  return null;
}

export type ResolveResponseLanguageInput = {
  text: string;
  /** Locale from STT (e.g. Deepgram detected_language). */
  sttLocale?: VoiceLocale | null;
  /** Locale from client for the current turn. */
  preferredLocale?: VoiceLocale | null;
};

/**
 * Resolve the response language for chat/TTS on a single turn.
 * Priority: explicit turn locale → text in current message → STT locale → null.
 */
export function resolveResponseLanguage(
  input: ResolveResponseLanguageInput
): DetectedLanguage | null {
  if (input.preferredLocale && isVoiceLocale(input.preferredLocale)) {
    return toDetectedLanguage(input.preferredLocale);
  }

  return resolveTurnLanguage(input.text, input.sttLocale);
}

export type ResolveVoiceLocaleInput = {
  text: string;
  sttLocale?: VoiceLocale | null;
  preferredLocale?: VoiceLocale | null;
};

/**
 * Resolve TTS locale for synthesis.
 * Native script in the text always wins over turn/STT locale so Azure does not return
 * empty audio (e.g. hi-IN voice + Malayalam script).
 */
export function resolveVoiceLocale(input: ResolveVoiceLocaleInput): VoiceLocale {
  const text = input.text.trim();
  if (!text) {
    return input.preferredLocale && isVoiceLocale(input.preferredLocale)
      ? input.preferredLocale
      : DEFAULT_VOICE_LOCALE;
  }

  const fromNative = detectLanguageFromNativeScript(text);
  if (fromNative) return fromNative.code;

  const manglish = detectTransliteratedMalayalam(text);
  if (manglish) return manglish.code;

  const hinglish = detectTransliteratedHindi(text);
  if (hinglish) return hinglish.code;

  const preferred =
    input.preferredLocale && isVoiceLocale(input.preferredLocale)
      ? input.preferredLocale
      : null;

  if (preferred && preferred !== DEFAULT_VOICE_LOCALE) {
    return preferred;
  }

  return detectEnglishFromText(text)?.code ?? preferred ?? DEFAULT_VOICE_LOCALE;
}

export function getVoiceProfile(locale: VoiceLocale): VoiceProfile {
  const normalized = normalizeLocaleCode(locale);
  const voice = AZURE_NEURAL_VOICES[normalized] ?? AZURE_NEURAL_VOICES[DEFAULT_VOICE_LOCALE];
  const resolvedLocale =
    normalized in AZURE_NEURAL_VOICES ? normalized : DEFAULT_VOICE_LOCALE;

  return {
    locale: resolvedLocale,
    langCode: resolvedLocale,
    voiceName: voice.voiceName,
    label: voice.label,
  };
}

export function buildMultilingualSystemPrompt(
  basePrompt: string,
  language: DetectedLanguage | null
): string {
  const languageRule = language
    ? [
        `CRITICAL LANGUAGE RULE: The user's latest message is in ${language.nativeName} (${language.code}).`,
        `You MUST write your ENTIRE response in ${language.nativeName} only.`,
        `Do NOT use any other language — ignore the language of all previous assistant replies in this thread.`,
        `Each turn follows the user's most recent message only.`,
        `Pipeline evidence and source labels may be in English — translate and explain them in ${language.nativeName}.`,
        `If the user mixed languages (e.g. Hinglish or Manglish), mirror that style naturally.`,
        `Keep sentences concise when the reply may be read aloud.`,
      ].join(' ')
    : [
        'CRITICAL LANGUAGE RULE: Match the language of the user\'s most recent message on every turn.',
        'If the user switches language mid-thread, follow the latest message only — ignore earlier turns.',
        'If they write in any Indian language or script, respond in exactly that language.',
        'If they use Manglish (Malayalam in Latin letters), respond in Malayalam script.',
        'If they use Hinglish (Hindi in Latin letters), respond in Hindi script.',
        'Pipeline evidence may be in English — still answer in the user\'s language.',
        'Do NOT default to English when the user wrote in another language.',
        'Ignore the language of earlier assistant replies if the user switched language.',
      ].join(' ');

  return `${basePrompt}\n\n## Language\n${languageRule}`;
}

/** Extra system context so the model does not default to English pipeline evidence. */
export function buildResponseLanguageContext(language: DetectedLanguage | null): string {
  if (!language) return '';

  return [
    '\n\n## Response Language (mandatory)',
    `Write your ENTIRE answer in ${language.nativeName} (${language.code}).`,
    `Follow the user's latest message language only — disregard what language earlier replies used.`,
    `Any English evidence above is reference material only — summarize and cite it in ${language.nativeName}.`,
    `FINAL CHECK: Your response must be entirely in ${language.nativeName}. Do not write in any other language.`,
  ].join('\n');
}

type ModelMessageLike = {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
};

/** Tag the latest user turn so the model follows this turn's language, not thread history. */
export function augmentModelMessagesForLanguage<T extends ModelMessageLike>(
  messages: T[],
  language: DetectedLanguage | null
): T[] {
  if (!language || messages.length === 0) return messages;

  const tag =
    `[Reply in ${language.nativeName} (${language.code}) for THIS message only. ` +
    `Ignore the language of all earlier user and assistant messages in this thread.]`;

  const augmented = messages.map((message) => ({ ...message }));
  for (let index = augmented.length - 1; index >= 0; index -= 1) {
    const message = augmented[index];
    if (message.role !== 'user') continue;

    if (typeof message.content === 'string') {
      augmented[index] = { ...message, content: `${message.content}\n\n${tag}` };
    } else if (Array.isArray(message.content)) {
      augmented[index] = {
        ...message,
        content: [...message.content, { type: 'text', text: tag }],
      };
    }
    break;
  }

  return augmented;
}

export function resolveChatResponseLanguage(
  requestLanguage: VoiceLocale | null,
  messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }>; content?: unknown }>
): DetectedLanguage | null {
  return resolveTurnLanguage(getLastUserMessageText(messages), requestLanguage);
}

export function getSupportedLanguages(): DetectedLanguage[] {
  return SUPPORTED_INDIAN_LOCALES.map((code) => toDetectedLanguage(code));
}