import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { resolveVoiceLocale } from '@/lib/voice/locale';
import type { VoiceLocale } from '@/types/voice';

const SARVAM_TTS_URL =
  process.env.SARVAM_TTS_URL?.trim() ||
  'http://vigia-ts-search-204472952.us-east-1.elb.amazonaws.com/sarvam-proxy/tts';
const SARVAM_SECRET_ID = process.env.SARVAM_SECRET_ID?.trim() || 'vigia/sarvam-api-key';
let cachedApiKey: string | null = null;

const SARVAM_SUPPORTED_LOCALES = new Set([
  'bn-IN',
  'en-IN',
  'gu-IN',
  'hi-IN',
  'kn-IN',
  'ml-IN',
  'mr-IN',
  'od-IN',
  'pa-IN',
  'ta-IN',
  'te-IN',
]);

type SarvamTtsResponse = {
  audios?: string[];
  error?: { message?: string } | string;
};

export type SarvamTtsResult =
  | { ok: true; audio: ArrayBuffer; contentType: string }
  | { ok: false; status: number; message: string };

function extractSecretValue(secret: string): string {
  const trimmed = secret.trim();
  if (!trimmed.startsWith('{')) return trimmed;

  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  for (const key of ['api_key', 'apiKey', 'SARVAM_API_KEY', 'key']) {
    if (typeof parsed[key] === 'string' && parsed[key].trim()) return parsed[key].trim();
  }
  throw new Error('Sarvam secret does not contain an API key');
}

async function getSarvamApiKey(): Promise<string> {
  const environmentKey = process.env.SARVAM_API_KEY?.trim();
  if (environmentKey) return environmentKey;
  if (cachedApiKey) return cachedApiKey;

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
  const response = await client.send(new GetSecretValueCommand({ SecretId: SARVAM_SECRET_ID }));
  const secret = response.SecretString;
  if (!secret) throw new Error('Sarvam API key is not configured');
  cachedApiKey = extractSecretValue(secret);
  return cachedApiKey;
}

function toSarvamLanguageCode(locale: VoiceLocale): string {
  if (locale === 'or-IN') return 'od-IN';
  if (SARVAM_SUPPORTED_LOCALES.has(locale)) return locale;
  return 'en-IN';
}

function extractErrorMessage(payload: SarvamTtsResponse): string | undefined {
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message;
}

async function requestSarvamTts(text: string, targetLanguageCode: string): Promise<ArrayBuffer> {
  const directSarvamRequest = SARVAM_TTS_URL.startsWith('https://api.sarvam.ai/');
  const response = await fetch(SARVAM_TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(directSarvamRequest ? { 'api-subscription-key': await getSarvamApiKey() } : {}),
    },
    body: JSON.stringify({
      text,
      target_language_code: targetLanguageCode,
      model: 'bulbul:v3',
      speaker: 'shubh',
      output_audio_codec: 'mp3',
      speech_sample_rate: '24000',
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const payload = (await response.json()) as SarvamTtsResponse;
  if (!response.ok) {
    const detail = extractErrorMessage(payload);
    throw new Error(`Sarvam TTS failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  const audioBase64 = payload.audios?.[0];
  if (!audioBase64) throw new Error('Sarvam TTS returned no audio');

  const buffer = Buffer.from(audioBase64, 'base64');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export async function synthesizeSarvamSpeech(
  text: string,
  locale: VoiceLocale
): Promise<SarvamTtsResult> {
  const scriptLocale = resolveVoiceLocale({ text });
  const candidates = [scriptLocale, locale]
    .map(toSarvamLanguageCode)
    .filter((value, index, array) => array.indexOf(value) === index);

  try {
    for (const candidate of candidates) {
      const audio = await requestSarvamTts(text, candidate);
      if (audio.byteLength > 0) {
        return { ok: true, audio, contentType: 'audio/mpeg' };
      }
    }

    return { ok: false, status: 502, message: 'Synthesis returned no audio' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to synthesize speech';
    if (message.startsWith('Sarvam TTS failed')) {
      return { ok: false, status: 500, message: 'Failed to synthesize speech' };
    }
    if (message.includes('not configured') || message.includes('unavailable')) {
      return { ok: false, status: 500, message: 'Text-to-speech is not configured' };
    }
    return { ok: false, status: 500, message };
  }
}
