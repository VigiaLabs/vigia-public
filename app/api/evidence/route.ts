import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { PayloadSchema } from '@/lib/agents/state';
import { runPipeline } from '@/lib/agents/graph';
import { extractUIPayload } from '@/lib/agents/ui-hook';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT = {
  windowMs: 60_000,
  limit: 20,
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
  const rate = checkRateLimit(`evidence:${ip}`, RATE_LIMIT);

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

    const parsedBody = JSON.parse(rawBody || '{}');
    const parsed = PayloadSchema.safeParse(parsedBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!parsed.data.text) {
      return NextResponse.json(
        { error: 'Text is required for evidence extraction.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const finalState = await runPipeline(parsed.data);
    const uiPayload = extractUIPayload(finalState);

    return NextResponse.json(uiPayload, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Evidence request failed';
    console.error('Evidence API error:', error);

    return NextResponse.json(
      { error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
