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
import {
  augmentModelMessagesForLanguage,
  buildMultilingualSystemPrompt,
  buildResponseLanguageContext,
  isVoiceLocale,
  resolveChatResponseLanguage,
} from '@/lib/voice/locale';
import { VIGIA_BASE_SYSTEM_PROMPT } from '@/lib/voice/chat-prompt';
import { routerNode, ingestNode, guardrailNode, uiHookNode } from '@/lib/agents/graph';
import { extractUIPayload } from '@/lib/agents/ui-hook';
import type { Payload, VigiaState } from '@/lib/agents/state';
import { getCachedResponse, setCachedResponse } from '@/lib/cache/semantic-cache';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT = { windowMs: 60_000, limit: 30 };

function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

function parseRequestLanguage(parsed: {
  responseLanguage?: unknown;
  voiceLocale?: unknown;
}): string | null {
  if (parsed.responseLanguage === null) return null;
  if (typeof parsed.responseLanguage === 'string' && isVoiceLocale(parsed.responseLanguage)) return parsed.responseLanguage;
  if (typeof parsed.voiceLocale === 'string' && isVoiceLocale(parsed.voiceLocale)) return parsed.voiceLocale;
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

    const parsed = JSON.parse(rawBody || '{}') as {
      messages?: UIMessage[];
      responseLanguage?: unknown;
      voiceLocale?: unknown;
    };
    const { messages } = parsed;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const requestLanguage = parseRequestLanguage(parsed);
    const responseLanguage = resolveChatResponseLanguage(requestLanguage, messages);
    const baseSystem = buildMultilingualSystemPrompt(VIGIA_BASE_SYSTEM_PROMPT, responseLanguage);

    // Extract user query text
    const lastUserMsg = messages.findLast((m) => m.role === 'user');
    const queryText = lastUserMsg?.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join(' ') ?? '';

    // ─── Semantic Cache Check ───────────────────────────────────────
    const cached = await getCachedResponse(queryText);
    if (cached) {
      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          writer.write({ type: 'text-delta', delta: cached.text, id: crypto.randomUUID() });
          if (cached.metadata) {
            writer.write({ type: 'message-metadata', messageMetadata: cached.metadata });
          }
        },
      });
      return createUIMessageStreamResponse({ stream, headers: { 'Cache-Control': 'no-store', 'X-Vigia-Cache': 'HIT' } });
    }

    // ─── Pipeline Payload ───────────────────────────────────────────
    const pipelinePayload: Payload = {
      text: queryText,
      threadId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const emitStep = (step: string) => {
          writer.write({ type: 'data-vigia-step' as any, data: [{ vigia_step: step, ts: Date.now() }] } as any);
        };

        // ─── Inline Pipeline Execution with Progress ──────────────
        let pipelineContext = '';
        let evidenceAnnotation: Record<string, unknown> | null = null;

        try {
          // Node 1: Router
          emitStep('Classifying intent...');
          const initialState: VigiaState = {
            traceId: crypto.randomUUID(),
            startedAt: Date.now(),
            payload: pipelinePayload,
            activeAgents: [],
            evidence: [],
            retryCount: 0,
            contradictionDetected: false,
            contradictionVerified: false,
            pipelineStatus: 'routing',
            debugTrace: [],
          };

          const routerResult = await routerNode(initialState);
          let state: VigiaState = {
            ...initialState,
            ...routerResult,
            debugTrace: [...initialState.debugTrace, ...(routerResult.debugTrace ?? [])],
          };

          // Short-circuit for conversational
          if (state.pipelineStatus === 'complete') {
            const system = baseSystem + buildResponseLanguageContext(responseLanguage);
            const modelMessages = augmentModelMessagesForLanguage(
              await convertToModelMessages(messages), responseLanguage
            );
            writer.merge(streamText({ model: bedrock('amazon.nova-lite-v1:0'), system, messages: modelMessages }).toUIMessageStream());
            return;
          }

          // Node 2: Ingest (parallel agents)
          emitStep(`Searching ${state.activeAgents.length} source${state.activeAgents.length !== 1 ? 's' : ''}...`);
          const ingestResult = await ingestNode(state);
          state = {
            ...state,
            ...ingestResult,
            evidence: [...state.evidence, ...(ingestResult.evidence ?? [])],
            debugTrace: [...state.debugTrace, ...(ingestResult.debugTrace ?? [])],
          };

          // Node 3: Guardrail
          emitStep('Verifying evidence...');
          const guardrailResult = guardrailNode(state);
          state = {
            ...state,
            ...guardrailResult,
            debugTrace: [...state.debugTrace, ...(guardrailResult.debugTrace ?? [])],
          };

          // Handle retry loop
          if (state.pipelineStatus === 'retrying' as string) {
            emitStep('Cross-referencing records...');
            const retryResult = await ingestNode(state);
            state = {
              ...state,
              ...retryResult,
              evidence: [...state.evidence, ...(retryResult.evidence ?? [])],
              debugTrace: [...state.debugTrace, ...(retryResult.debugTrace ?? [])],
            };
            const guardrail2 = guardrailNode(state);
            state = {
              ...state,
              ...guardrail2,
              debugTrace: [...state.debugTrace, ...(guardrail2.debugTrace ?? [])],
            };
          }

          // Node 4: UI Hook
          const hookResult = uiHookNode(state);
          state = { ...state, ...hookResult, debugTrace: [...state.debugTrace, ...(hookResult.debugTrace ?? [])] };

          const uiPayload = extractUIPayload(state);

          // Build context from evidence
          if (state.evidence.length > 0) {
            pipelineContext = '\n\n## VIGIA Pipeline Evidence (use this to answer):\n';
            for (const ev of state.evidence) {
              if (ev.status === 'completed' && ev.findings.length > 0) {
                pipelineContext += `\n### ${ev.agentId} agent (confidence: ${ev.confidence}):\n`;
                pipelineContext += ev.findings.map(f => `- ${f}`).join('\n');
                if (ev.citations.length > 0) {
                  pipelineContext += '\nSources: ' + ev.citations.map(c => `[${c.label}](${c.url ?? ''})`).join(', ');
                }
                pipelineContext += '\n';
              }
            }
            pipelineContext += '\n\nIMPORTANT: Answer using the evidence above. Cite sources with [Source: Document Name]. If the evidence contains project metadata (budget, mode, timeline, km stretch), include it in a **Project Overview** section even if the user did not ask for it. Do NOT hallucinate data not present above.';
          }

          evidenceAnnotation = {
            type: 'vigia-evidence',
            sources: uiPayload.sources,
            debugTrace: uiPayload.debugTrace,
            totalLatencyMs: uiPayload.totalLatencyMs,
            contradictionVerified: uiPayload.contradictionVerified,
            budgetData: uiPayload.budgetData,
            spatialMarkers: uiPayload.spatialMarkers,
            pendingAction: uiPayload.pendingAction,
          };
        } catch (err) {
          console.error('Pipeline error (falling back to base LLM):', err);
        }

        // ─── Stream LLM Response ──────────────────────────────────
        emitStep('Generating response...');
        const system = baseSystem + pipelineContext + buildResponseLanguageContext(responseLanguage);
        const modelMessages = augmentModelMessagesForLanguage(
          await convertToModelMessages(messages), responseLanguage
        );

        const result = streamText({
          model: bedrock('amazon.nova-lite-v1:0'),
          system,
          messages: modelMessages,
        });

        let fullText = '';
        const textStream = result.toUIMessageStream({
          onFinish: () => {
            if (evidenceAnnotation) {
              writer.write({ type: 'message-metadata', messageMetadata: evidenceAnnotation });
            }
            // Cache the response
            void setCachedResponse(queryText, { text: fullText, metadata: evidenceAnnotation, cachedAt: Date.now() });
          },
        });

        // Capture text for caching
        const originalStream = textStream;
        writer.merge(originalStream);
      },
      onError: (error) => {
        console.error('Stream error:', error);
        return error instanceof Error ? error.message : 'Stream failed';
      },
    });

    return createUIMessageStreamResponse({ stream, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Chat route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate response' },
      { status: 500 }
    );
  }
}
