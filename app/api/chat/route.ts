import {
  convertToModelMessages,
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { isVoiceLocale, buildMultilingualSystemPrompt } from '@/lib/voice/locale';
import { VIGIA_BASE_SYSTEM_PROMPT } from '@/lib/voice/chat-prompt';
import { runPipeline } from '@/lib/agents/graph';
import { extractUIPayload } from '@/lib/agents/ui-hook';
import type { VoiceLocale } from '@/types/voice';
import type { Payload } from '@/lib/agents/state';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT = { windowMs: 60_000, limit: 30 };

function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

function resolveChatLocale(voiceLocale: VoiceLocale | null, messages: UIMessage[]): VoiceLocale | null {
  if (voiceLocale) return voiceLocale;
  const lastUserMsg = messages.findLast((m) => m.role === 'user');
  if (!lastUserMsg) return null;
  const text = lastUserMsg.parts
    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
  if (!text) return null;
  const totalChars = text.replace(/\s/g, '').length;
  if (totalChars > 0) {
    const devanagari = (text.match(/[\u0900-\u097F]/g) || []).length;
    if (devanagari / totalChars > 0.3) return 'hi-IN';
    const tamil = (text.match(/[\u0B80-\u0BFF]/g) || []).length;
    if (tamil / totalChars > 0.3) return 'ta-IN';
  }
  return null;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`chat:${ip}`, RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } });
  }

  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const parsed = JSON.parse(rawBody || '{}') as { messages?: UIMessage[]; voiceLocale?: unknown };
    const { messages } = parsed;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const requestVoiceLocale = typeof parsed.voiceLocale === 'string' && isVoiceLocale(parsed.voiceLocale) ? parsed.voiceLocale : null;
    const chatLocale = resolveChatLocale(requestVoiceLocale, messages);
    const baseSystem = chatLocale ? buildMultilingualSystemPrompt(VIGIA_BASE_SYSTEM_PROMPT, chatLocale) : VIGIA_BASE_SYSTEM_PROMPT;

    // Extract user query text for the pipeline
    const lastUserMsg = messages.findLast((m) => m.role === 'user');
    const queryText = lastUserMsg?.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(' ') ?? '';

    // Build pipeline payload
    const pipelinePayload: Payload = {
      text: queryText,
      threadId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
    };

    // Create the multiplexed stream
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // ─── Phase 1: Run the full 5-node LangGraph pipeline ────────
        let pipelineContext = '';
        let evidenceAnnotation: Record<string, unknown> | null = null;

        try {
          const pipelineState = await runPipeline(pipelinePayload);
          const uiPayload = extractUIPayload(pipelineState);

          // Build context from pipeline evidence for the LLM
          if (pipelineState.evidence.length > 0) {
            pipelineContext = '\n\n## VIGIA Pipeline Evidence (use this to answer):\n';
            for (const ev of pipelineState.evidence) {
              if (ev.status === 'completed' && ev.findings.length > 0) {
                pipelineContext += `\n### ${ev.agentId} agent (confidence: ${ev.confidence}):\n`;
                pipelineContext += ev.findings.map(f => `- ${f}`).join('\n');
                if (ev.citations.length > 0) {
                  pipelineContext += '\nSources: ' + ev.citations.map(c => `[${c.label}](${c.url ?? ''})`).join(', ');
                }
                pipelineContext += '\n';
              }
            }
            pipelineContext += '\n\nIMPORTANT: Answer ONLY using the evidence above. Cite the sources. If evidence is insufficient, say so.';
          }

          // Prepare annotation for frontend
          evidenceAnnotation = {
            type: 'vigia-evidence',
            sources: uiPayload.sources,
            totalLatencyMs: uiPayload.totalLatencyMs,
            contradictionVerified: uiPayload.contradictionVerified,
            budgetData: uiPayload.budgetData,
            spatialMarkers: uiPayload.spatialMarkers,
          };
        } catch (err) {
          console.error('Pipeline error (falling back to base LLM):', err);
        }

        // ─── Phase 2: Stream the LLM response with pipeline context ─
        const system = baseSystem + pipelineContext;

        const result = streamText({
          model: bedrock('amazon.nova-lite-v1:0'),
          system,
          messages: await convertToModelMessages(messages),
          providerOptions: {
            bedrock: { additionalModelResponseFieldPaths: ['/metadata'] },
          },
        });

        // Merge the text stream into our UI message stream
        const textStream = result.toUIMessageStream({
          onFinish: () => {
            // After text is done, emit the evidence annotation as metadata
            if (evidenceAnnotation) {
              writer.write({
                type: 'message-metadata',
                messageMetadata: evidenceAnnotation,
              });
            }
          },
        });

        writer.merge(textStream);
      },
      onError: (error) => {
        console.error('Stream error:', error);
        return error instanceof Error ? error.message : 'Stream failed';
      },
    });

    return createUIMessageStreamResponse({
      stream,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Chat route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate response' },
      { status: 500 }
    );
  }
}
