import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  buildMultilingualSystemPrompt,
  isVoiceLocale,
} from '@/lib/voice/locale';
import { VIGIA_BASE_SYSTEM_PROMPT } from '@/lib/voice/chat-prompt';
import type { VoiceLocale } from '@/types/voice';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT = {
  windowMs: 60_000,
  limit: 30,
};

function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  return req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || 'unknown';
}

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;

  const host = req.headers.get('host');
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function resolveChatLocale(
  voiceLocale: VoiceLocale | null,
  messages: UIMessage[]
): VoiceLocale | null {
  if (voiceLocale) return voiceLocale;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;

    const text = msg.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');

    if (!text) continue;

    if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN';
    break;
  }

  return null;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`chat:${ip}`, RATE_LIMIT);

  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rate.retryAfterSeconds),
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  try {
    if (!isSameOrigin(req)) {
      return NextResponse.json(
        { error: 'Origin not allowed' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const parsed = JSON.parse(rawBody || '{}') as {
      messages?: UIMessage[];
      voiceLocale?: unknown;
    };

    const { messages } = parsed;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const requestVoiceLocale =
      typeof parsed.voiceLocale === 'string' && isVoiceLocale(parsed.voiceLocale)
        ? parsed.voiceLocale
        : null;

    const chatLocale = resolveChatLocale(requestVoiceLocale, messages);
    const system = chatLocale
      ? buildMultilingualSystemPrompt(VIGIA_BASE_SYSTEM_PROMPT, chatLocale)
      : VIGIA_BASE_SYSTEM_PROMPT;

    const result = streamText({
      model: bedrock('amazon.nova-lite-v1:0'),
      system,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse({
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Chat stream error:', error);

    const message =
      error instanceof Error ? error.message : 'Failed to generate response';

    return NextResponse.json(
      { error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
