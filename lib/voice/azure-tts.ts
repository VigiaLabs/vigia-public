import { getAzureTtsConfig } from '@/lib/voice/config';
import { resolveVoiceLocale } from '@/lib/voice/locale';
import { buildSsml } from '@/lib/voice/ssml';
import type { VoiceLocale } from '@/types/voice';

const AZURE_OUTPUT_FORMAT = 'audio-16khz-128kbitrate-mono-mp3';

export type AzureTtsResult =
  | { ok: true; audio: ArrayBuffer }
  | { ok: false; status: number; message: string };

async function requestAzureTts(
  text: string,
  locale: VoiceLocale,
  config: { apiKey: string; region: string }
): Promise<ArrayBuffer> {
  const ssml = buildSsml(text, locale);
  const endpoint = `https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': AZURE_OUTPUT_FORMAT,
    },
    body: ssml,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Azure TTS REST error:', response.status, detail);
    throw new Error(`Azure TTS failed (${response.status})`);
  }

  return response.arrayBuffer();
}

export async function synthesizeAzureSpeech(
  text: string,
  locale: VoiceLocale
): Promise<AzureTtsResult> {
  const config = getAzureTtsConfig();
  if (!config) {
    return { ok: false, status: 500, message: 'Azure Text-to-Speech is not configured' };
  }

  const scriptLocale = resolveVoiceLocale({ text });
  const candidates = [scriptLocale, locale].filter(
    (value, index, array) => array.indexOf(value) === index
  );

  try {
    for (const candidate of candidates) {
      const audio = await requestAzureTts(text, candidate, config);
      if (audio.byteLength > 0) {
        return { ok: true, audio };
      }
    }

    return { ok: false, status: 502, message: 'Synthesis returned no audio' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to synthesize speech';
    if (message.startsWith('Azure TTS failed')) {
      return { ok: false, status: 500, message: 'Failed to synthesize speech' };
    }
    return { ok: false, status: 500, message };
  }
}
