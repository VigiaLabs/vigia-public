import { NextRequest, NextResponse } from 'next/server';
import { DeepgramClient } from '@deepgram/sdk';
import { transcribeWithAzure, isAzureSttConfigured } from '@/lib/voice/azure-stt';
import { transcribeWithSarvam } from '@/lib/voice/sarvam-stt';
import { getDeepgramApiKey } from '@/lib/voice/config';
import {
  DEFAULT_VOICE_LOCALE,
  normalizeLanguageCode,
  resolveResponseLanguage,
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
  const sttLocale = normalizeLanguageCode(detectedLanguage)?.code ?? detectedLanguage ?? null;
  return (
    resolveResponseLanguage({
      text: transcript,
      sttLocale,
    })?.code ?? DEFAULT_VOICE_LOCALE
  );
}

async function transcribeWithDeepgram(audioBuffer: Buffer): Promise<TranscriptionResponse> {
  const apiKey = getDeepgramApiKey();
  if (!apiKey) {
    throw new Error(
      'Deepgram API key is not configured. Set DEEPGRAM_API_KEY or DEEPGRAM_KEY in .env.local'
    );
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
    throw new Error('Transcription is processing asynchronously; sync response expected.');
  }

  const channel = extractChannel(result);
  const text = extractTranscript(channel);

  if (!text) {
    throw new Error('No speech detected in audio');
  }

  const locale = resolveTranscriptionLocale(text, channel?.detected_language);
  const confidence =
    typeof channel?.language_confidence === 'number'
      ? channel.language_confidence
      : undefined;

  return {
    text,
    locale,
    ...(confidence !== undefined ? { confidence } : {}),
  };
}

export async function transcribeAudioRequest(request: NextRequest) {
  try {
    const body = (await request.json()) as { audio?: unknown; mimeType?: unknown };
    const audioBase64 = typeof body.audio === 'string' ? body.audio.trim() : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'audio/webm';

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

    let payload: TranscriptionResponse;

    try {
      payload = await transcribeWithSarvam(audioBuffer, mimeType);
    } catch (sarvamError) {
      console.error('Sarvam transcription failed; using configured fallback:', sarvamError);
      if (isAzureSttConfigured()) {
        const azureResult = await transcribeWithAzure(audioBuffer, mimeType);
        payload = {
          text: azureResult.text,
          locale: azureResult.locale,
          ...(azureResult.confidence !== undefined ? { confidence: azureResult.confidence } : {}),
        };
      } else {
        payload = await transcribeWithDeepgram(audioBuffer);
      }
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Transcription error:', error);

    const message =
      error instanceof Error ? error.message : 'Failed to transcribe audio';

    const status =
      message.includes('No speech detected') ? 422 :
      message.includes('not configured') ? 500 :
      500;

    return NextResponse.json({ error: message }, { status });
  }
}
