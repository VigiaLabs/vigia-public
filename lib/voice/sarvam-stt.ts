import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { normalizeLanguageCode, resolveResponseLanguage } from '@/lib/voice/locale';
import type { TranscriptionResponse } from '@/types/voice';

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
const SARVAM_SECRET_ID = process.env.SARVAM_SECRET_ID?.trim() || 'vigia/sarvam-api-key';
let cachedApiKey: string | null = null;

type SarvamSttResponse = {
  transcript?: string;
  language_code?: string | null;
  language_probability?: number | null;
  error?: { message?: string } | string;
};

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

function audioFilename(mimeType: string): string {
  if (mimeType.includes('aiff') || mimeType.includes('aif')) return 'voice.aiff';
  if (mimeType.includes('wav')) return 'voice.wav';
  if (mimeType.includes('ogg')) return 'voice.ogg';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'voice.mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'voice.m4a';
  return 'voice.webm';
}

export async function transcribeWithSarvam(
  audioBuffer: Buffer,
  mimeType: string
): Promise<TranscriptionResponse> {
  const apiKey = await getSarvamApiKey();
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
    audioFilename(mimeType)
  );
  form.append('model', 'saaras:v3');
  form.append('language_code', 'unknown');
  form.append('mode', 'transcribe');
  form.append('with_timestamps', 'false');

  const response = await fetch(SARVAM_STT_URL, {
    method: 'POST',
    headers: { 'api-subscription-key': apiKey },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const responseText = await response.text();
  let payload: SarvamSttResponse;
  try {
    payload = JSON.parse(responseText) as SarvamSttResponse;
  } catch {
    throw new Error(`Sarvam STT returned an invalid response (${response.status})`);
  }
  if (!response.ok) {
    const detail = typeof payload.error === 'string' ? payload.error : payload.error?.message;
    throw new Error(`Sarvam STT failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }

  const text = payload.transcript?.trim() ?? '';
  if (!text) throw new Error('No speech detected in audio');

  const detectedLocale = normalizeLanguageCode(payload.language_code)?.code;
  const locale = detectedLocale ?? resolveResponseLanguage({ text })?.code ?? 'en-IN';
  return {
    text,
    locale,
    ...(typeof payload.language_probability === 'number'
      ? { confidence: payload.language_probability }
      : {}),
  };
}
