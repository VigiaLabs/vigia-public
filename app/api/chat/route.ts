import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/rate-limit';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_CHARS = 2000;
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

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 415, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'Payload too large' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = JSON.parse(rawBody || '{}') as { message?: unknown };
    const message =
      typeof body?.message === 'string' ? body.message.trim() : '';

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: `Message too long. Maximum ${MAX_MESSAGE_CHARS} characters.` },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json({
      reply: `Received: ${message}`,
      sources: [],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}