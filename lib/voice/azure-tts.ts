import { getAzureTtsConfig } from '@/lib/voice/config';
import { buildSsml } from '@/lib/voice/ssml';
import type { VoiceLocale } from '@/types/voice';

const AZURE_OUTPUT_FORMAT = 'audio-16khz-128kbitrate-mono-mp3';

export type AzureTtsResult =
  | { ok: true; audio: ArrayBuffer }
  | { ok: false; status: number; message: string };

export async function synthesizeAzureSpeech(
  text: string,
  locale: VoiceLocale
): Promise<AzureTtsResult> {
  const config = getAzureTtsConfig();
  if (!config) {
    return { ok: false, status: 500, message: 'Azure Text-to-Speech is not configured' };
  }

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
    return {
      ok: false,
      status: response.status,
      message: 'Failed to synthesize speech',
    };
  }

  const audio = await response.arrayBuffer();
  if (audio.byteLength === 0) {
    return { ok: false, status: 502, message: 'Synthesis returned no audio' };
  }

  return { ok: true, audio };
}
