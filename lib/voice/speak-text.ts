import type { VoiceLocale } from '@/types/voice';

const PLAYBACK_RATE = 1.25;
const MAX_SPEAK_CHARS = 2000;

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
let currentAbort: AbortController | null = null;

export type SpeakTextOptions = {
  /** Locale from STT or the active voice turn; keeps TTS aligned when the reply is romanized. */
  locale?: VoiceLocale;
};

export function stopSpeaking(): void {
  currentAbort?.abort();
  currentAbort = null;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

export function isSpeakingActive(): boolean {
  return currentAbort !== null || currentAudio !== null;
}

/**
 * Synthesize speech via /api/voice/speak and play the returned MPEG stream.
 */
export async function speakText(text: string, options?: SpeakTextOptions): Promise<void> {
  stopSpeaking();

  const trimmed = text.length > MAX_SPEAK_CHARS ? `${text.slice(0, MAX_SPEAK_CHARS)}…` : text;
  const abort = new AbortController();
  currentAbort = abort;

  let response: Response;
  try {
    response = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: trimmed,
        ...(options?.locale ? { locale: options.locale } : {}),
      }),
      signal: abort.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return;
    throw error;
  } finally {
    if (currentAbort === abort) currentAbort = null;
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? response.statusText);
  }

  const blob = await response.blob();
  currentObjectUrl = URL.createObjectURL(blob);
  currentAudio = new Audio(currentObjectUrl);
  currentAudio.playbackRate = PLAYBACK_RATE;

  await new Promise<void>((resolve, reject) => {
    if (!currentAudio) {
      reject(new Error('Audio playback failed to initialize'));
      return;
    }

    currentAudio.onended = () => {
      stopSpeaking();
      resolve();
    };
    currentAudio.onerror = () => {
      stopSpeaking();
      reject(new Error('Audio playback failed'));
    };

    void currentAudio.play().catch(reject);
  });
}
