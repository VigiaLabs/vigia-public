import { NextRequest, NextResponse } from 'next/server';
import { synthesizeSarvamSpeech } from '@/lib/voice/sarvam-tts';
import { isVoiceLocale, resolveVoiceLocale } from '@/lib/voice/locale';
import type { SpeakRequest, VoiceLocale } from '@/types/voice';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

const MAX_TEXT_CHARS = 5000;
// P-SEC-5: this route drives a billable TTS provider — rate-limit anonymous callers.
const RATE_LIMIT = { windowMs: 60_000, limit: 20 };

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(`voice-speak:${clientIp(req)}`, RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds), 'Cache-Control': 'no-store' } },
    );
  }
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

    const result = await synthesizeSarvamSpeech(content, locale);

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }

    return new NextResponse(result.audio, {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'no-store',
        'X-Voice-Locale': locale,
      },
    });
  } catch (error) {
    console.error('Sarvam TTS error:', error);

    const message =
      error instanceof Error ? error.message : 'Failed to synthesize speech';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
