import { getAzureSpeechConfig } from '@/lib/voice/config';
import {
  DEFAULT_VOICE_LOCALE,
  SUPPORTED_INDIAN_LOCALES,
  detectLocaleFromScript,
  isVoiceLocale,
  normalizeLocaleCode,
  resolveTurnLanguage,
} from '@/lib/voice/locale';
import type { VoiceLocale } from '@/types/voice';

const FAST_TRANSCRIBE_API_VERSION = '2024-11-15';
// Order matters: Azure language identification is influenced by locale ordering.
// Place the most frequently spoken languages first so misclassification is less likely.
const PRIMARY_INDIAN_LOCALES: VoiceLocale[] = [
  'hi-IN',
  'en-IN',
  'ta-IN',
  'te-IN',
  'mr-IN',
  'bn-IN',
  'gu-IN',
  'kn-IN',
  'ml-IN',
];

/** Malayalam-first pass when the Hindi-led primary list mis-tags Malayalam audio. */
const MALAYALAM_STT_LOCALES: VoiceLocale[] = ['ml-IN', 'ta-IN', 'en-IN'];

export type AzureSttResult = {
  text: string;
  locale: VoiceLocale;
  confidence?: number;
};

type AzurePhrase = {
  text?: string;
  locale?: string;
  confidence?: number;
};

type AzureTranscribeResponse = {
  combinedPhrases?: Array<{ text?: string }>;
  phrases?: AzurePhrase[];
};

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'mp4';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

function pickDominantLocale(phrases?: AzurePhrase[]): VoiceLocale | null {
  if (!phrases?.length) return null;

  const scores = new Map<string, number>();
  for (const phrase of phrases) {
    if (!phrase.locale) continue;
    const weight = phrase.text?.length ?? 1;
    scores.set(phrase.locale, (scores.get(phrase.locale) ?? 0) + weight);
  }

  let bestLocale: string | null = null;
  let bestScore = 0;
  for (const [locale, score] of scores) {
    if (score > bestScore) {
      bestLocale = locale;
      bestScore = score;
    }
  }

  if (!bestLocale) return null;
  return normalizeLocaleCode(bestLocale);
}

function extractTranscript(data: AzureTranscribeResponse): string {
  return (
    data.combinedPhrases?.[0]?.text?.trim() ??
    data.phrases
      ?.map((phrase) => phrase.text?.trim())
      .filter(Boolean)
      .join(' ')
      .trim() ??
    ''
  );
}

function buildTranscriptionDefinition(locales?: VoiceLocale[]): Record<string, unknown> {
  const definition: Record<string, unknown> = { channels: [0] };
  if (locales?.length) {
    definition.locales = locales;
  }
  return definition;
}

async function requestAzureTranscription(
  audioBuffer: Buffer,
  mimeType: string,
  locales?: VoiceLocale[]
): Promise<AzureTranscribeResponse> {
  const config = getAzureSpeechConfig();
  if (!config) {
    throw new Error('Azure Speech is not configured');
  }

  const endpoint =
    `https://${config.region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe` +
    `?api-version=${FAST_TRANSCRIBE_API_VERSION}`;

  const form = new FormData();
  const ext = extensionForMime(mimeType);
  form.append('audio', new Blob([audioBuffer], { type: mimeType }), `audio.${ext}`);
  form.append('definition', JSON.stringify(buildTranscriptionDefinition(locales)));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.apiKey,
    },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Azure STT failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as AzureTranscribeResponse;
}

function finalizeTranscriptLocale(text: string, phrases?: AzurePhrase[]): VoiceLocale {
  const fromScript = detectLocaleFromScript(text);
  if (fromScript) return fromScript;

  const sttLocale = pickDominantLocale(phrases);
  return resolveTurnLanguage(text, sttLocale)?.code ?? sttLocale ?? DEFAULT_VOICE_LOCALE;
}

function shouldRetryForLocaleMismatch(text: string, locale: VoiceLocale): boolean {
  const scriptLocale = detectLocaleFromScript(text);
  return Boolean(scriptLocale && scriptLocale !== locale);
}

function averageConfidence(phrases: AzurePhrase[] | undefined, locale: VoiceLocale): number | undefined {
  if (!phrases?.length) return undefined;

  const matching = phrases.filter((phrase) => phrase.locale && normalizeLocaleCode(phrase.locale) === locale);
  const confidences = matching
    .map((phrase) => phrase.confidence)
    .filter((value): value is number => typeof value === 'number');

  if (!confidences.length) return undefined;
  return confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
}

export function isAzureSttConfigured(): boolean {
  return getAzureSpeechConfig() !== null;
}

/**
 * Transcribe short audio with Azure fast transcription + Indian language identification.
 * Supports Malayalam, Tamil, Telugu, and other regional languages Deepgram does not handle.
 */
export async function transcribeWithAzure(
  audioBuffer: Buffer,
  mimeType = 'audio/webm'
): Promise<AzureSttResult> {
  const localeStrategies: Array<VoiceLocale[] | undefined> = [
    PRIMARY_INDIAN_LOCALES,
    MALAYALAM_STT_LOCALES,
    SUPPORTED_INDIAN_LOCALES,
    undefined,
  ];

  let lastError: Error | null = null;
  let fallback: AzureSttResult | null = null;

  for (const locales of localeStrategies) {
    try {
      const data = await requestAzureTranscription(audioBuffer, mimeType, locales);
      const text = extractTranscript(data);
      if (!text) continue;

      const locale = finalizeTranscriptLocale(text, data.phrases);
      const confidence = averageConfidence(data.phrases, locale);
      const result: AzureSttResult = {
        text,
        locale: isVoiceLocale(locale) ? locale : DEFAULT_VOICE_LOCALE,
        ...(confidence !== undefined ? { confidence } : {}),
      };

      if (!shouldRetryForLocaleMismatch(text, result.locale)) {
        return result;
      }

      fallback = result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Azure STT failed');
    }
  }

  if (fallback) {
    return fallback;
  }

  throw lastError ?? new Error('No speech detected in audio');
}
