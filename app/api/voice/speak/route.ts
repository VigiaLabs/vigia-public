import { NextRequest, NextResponse } from 'next/server';
import { synthesizeAzureSpeech } from '@/lib/voice/azure-tts';
import { isVoiceLocale, resolveVoiceLocale } from '@/lib/voice/locale';
import type { SpeakRequest, VoiceLocale } from '@/types/voice';

export const runtime = 'nodejs';

const MAX_TEXT_CHARS = 5000;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SpeakRequest;
    const content = typeof body.text === 'string' ? body.text.trim() : '';

    if (!content) {
      return NextResponse.json(
        { error: 'Text is required in the JSON body' },
        { status: 400 }
      );
    }

    if (content.length > MAX_TEXT_CHARS) {
      return NextResponse.json(
        { error: `Text too long. Maximum ${MAX_TEXT_CHARS} characters.` },
        { status: 400 }
      );
    }

    const preferredLocale =
      body.locale && isVoiceLocale(body.locale) ? body.locale : null;

    const locale: VoiceLocale = resolveVoiceLocale({
      text: content,
      preferredLocale,
    });

    const result = await synthesizeAzureSpeech(content, locale);

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }

    return new NextResponse(result.audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Voice-Locale': locale,
      },
    });
  } catch (error) {
    console.error('Azure TTS error:', error);

    const message =
      error instanceof Error ? error.message : 'Failed to synthesize speech';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
