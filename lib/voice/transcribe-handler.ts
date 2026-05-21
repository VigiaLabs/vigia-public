import { NextRequest, NextResponse } from 'next/server';
import { DeepgramClient } from '@deepgram/sdk';
import { getDeepgramApiKey } from '@/lib/voice/config';
import {
  DEFAULT_VOICE_LOCALE,
  detectLocaleFromScript,
  normalizeLanguageCode,
} from '@/lib/voice/locale';
import type { TranscriptionResponse, VoiceLocale } from '@/types/voice';

type DeepgramChannel = {
  detected_language?: string;
  language_confidence?: number;
  alternatives?: Array<{ transcript?: string }>;
};

type DeepgramListenResult = {
  results?: {
    channels?: DeepgramChannel[];
  };
};

function extractChannel(result: DeepgramListenResult): DeepgramChannel | undefined {
  return result.results?.channels?.[0];
}

function extractTranscript(channel: DeepgramChannel | undefined): string {
  return channel?.alternatives?.[0]?.transcript?.trim() ?? '';
}

function isListenResponse(body: unknown): body is DeepgramListenResult {
  return (
    typeof body === 'object' &&
    body !== null &&
    'results' in body &&
    typeof (body as DeepgramListenResult).results === 'object'
  );
}

function resolveTranscriptionLocale(
  transcript: string,
  detectedLanguage?: string
): VoiceLocale {
  const scriptLocale = detectLocaleFromScript(transcript);
  if (scriptLocale) return scriptLocale;

  const sttLocale = normalizeLanguageCode(detectedLanguage);
  if (sttLocale) return sttLocale;

  return DEFAULT_VOICE_LOCALE;
}

export async function transcribeAudioRequest(request: NextRequest) {
  try {
    const apiKey = getDeepgramApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Deepgram API key is not configured. Set DEEPGRAM_API_KEY or DEEPGRAM_KEY in .env.local',
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as { audio?: unknown };
    const audioBase64 = typeof body.audio === 'string' ? body.audio.trim() : '';

    if (!audioBase64) {
      return NextResponse.json(
        { error: 'No audio provided. Send JSON with a base64-encoded "audio" field.' },
        { status: 400 }
      );
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    if (audioBuffer.length === 0) {
      return NextResponse.json({ error: 'Audio data is empty' }, { status: 400 });
    }

    const deepgram = new DeepgramClient({ apiKey });

    const result = await deepgram.listen.v1.media.transcribeFile(audioBuffer, {
      model: 'nova-2',
      detect_language: true,
      punctuate: true,
      smart_format: true,
      keywords: [
        'NHAI',
        'Gati Shakti',
        'pothole',
        'tender',
        'infrastructure',
        'rupees',
      ],
    });

    if (!isListenResponse(result)) {
      return NextResponse.json(
        { error: 'Transcription is processing asynchronously; sync response expected.' },
        { status: 502 }
      );
    }

    const channel = extractChannel(result);
    const text = extractTranscript(channel);

    if (!text) {
      return NextResponse.json({ error: 'No speech detected in audio' }, { status: 422 });
    }

    const locale = resolveTranscriptionLocale(text, channel?.detected_language);
    const confidence =
      typeof channel?.language_confidence === 'number'
        ? channel.language_confidence
        : undefined;

    const payload: TranscriptionResponse = {
      text,
      locale: locale ?? DEFAULT_VOICE_LOCALE,
      ...(confidence !== undefined ? { confidence } : {}),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Deepgram transcription error:', error);

    const message =
      error instanceof Error ? error.message : 'Failed to transcribe audio';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
