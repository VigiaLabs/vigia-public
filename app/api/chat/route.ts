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
import { scoreFaithfulness } from '@/lib/agents/faithfulness';
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
        let retrievedChunks: string[] = [];

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

          // Emit reasoning trace from Plan-and-Execute sub-graph
          const adminEvidence = state.evidence.findLast(e => e.agentId === 'admin');
          const reasoningTrace = (adminEvidence?.metadata as any)?.reasoningTrace as string[] | undefined;
          if (reasoningTrace) {
            for (const step of reasoningTrace) {
              emitStep(step);
            }
          }

          // Node 3: Guardrail
          emitStep('Verifying evidence...');
          const guardrailResult = await guardrailNode(state);
          state = {
            ...state,
            ...guardrailResult,
            debugTrace: [...state.debugTrace, ...(guardrailResult.debugTrace ?? [])],
          };

          // Handle retry loop
          if (state.pipelineStatus === 'retrying' as string) {
            // Emit contextual step based on what triggered the retry
            const retryReason = state.contradictionDetected
              ? 'Contradiction found — rewriting query...'
              : 'Low confidence — broadening search...';
            emitStep(retryReason);

            const retryResult = await ingestNode(state);
            emitStep('Re-searching with refined query...');
            state = {
              ...state,
              ...retryResult,
              evidence: [...state.evidence, ...(retryResult.evidence ?? [])],
              debugTrace: [...state.debugTrace, ...(retryResult.debugTrace ?? [])],
            };
            emitStep('Validating new evidence...');
            const guardrail2 = await guardrailNode(state);
            state = {
              ...state,
              ...guardrail2,
              debugTrace: [...state.debugTrace, ...(guardrail2.debugTrace ?? [])],
            };

            // If authority fallback was triggered
            if (state.pipelineStatus === 'complete') {
              emitStep('Routing to authority contacts...');
            }
          }

          // Node 4: UI Hook
          const hookResult = uiHookNode(state);
          state = { ...state, ...hookResult, debugTrace: [...state.debugTrace, ...(hookResult.debugTrace ?? [])] };

          const uiPayload = extractUIPayload(state);

          // Build context from evidence
          if (state.evidence.length > 0) {
            pipelineContext = '\n\n## VIGIA Pipeline Evidence (use this to answer):\n';

            // Detect if this is a personnel/contact query
            const isPersonnelQuery = state.intent === 'personnel' || /\b(engineer|officer|contact|phone|who is|name|complaint)\b/i.test(queryText);

            for (const ev of state.evidence) {
              if (ev.status === 'completed' && ev.findings.length > 0) {
                pipelineContext += `\n### ${ev.agentId} agent (confidence: ${ev.confidence}):\n`;
                pipelineContext += ev.findings.map(f => `- ${f}`).join('\n');
                retrievedChunks.push(...ev.findings);
                if (ev.citations.length > 0) {
                  pipelineContext += '\nSources: ' + ev.citations.map(c => `[${c.label}](${c.url ?? ''})`).join(', ');
                }
                pipelineContext += '\n';
              }
            }

            // For personnel queries, extract and present contact details in a copy-paste format
            if (isPersonnelQuery) {
              const allText = state.evidence.flatMap(e => e.findings).join('\n');
              const phoneMatches = allText.match(/Phone:\s*([0-9\-+() ]+)/g);
              const emailMatches = allText.match(/Email:\s*([^\s.]+@[^\s.]+\.[^\s.]+)/g);
              const nameMatches = allText.match(/^([A-Z][a-z]+\.?\s+[A-Z][\w\s.]+),\s*(Executive|Superintending|Chief)\s*Engineer/gm)
                || allText.match(/((?:Shri|Smt|Dr|Sri)\.?\s+[A-Z][\w\s.]+),\s*(?:Executive|Superintending|Chief)/gm);

              pipelineContext += '\n\n═══ VERIFIED CONTACT DETAILS (COPY EXACTLY) ═══\n';
              if (nameMatches) pipelineContext += 'VERIFIED NAME: ' + nameMatches[0] + '\n';
              if (phoneMatches) pipelineContext += 'VERIFIED PHONE: ' + phoneMatches[0].replace('Phone: ', '') + '\n';
              if (emailMatches) pipelineContext += 'VERIFIED EMAIL: ' + emailMatches[0].replace('Email: ', '') + '\n';
              pipelineContext += '═══ USE ONLY THESE DETAILS. DO NOT SUBSTITUTE. ═══\n';
            }
            pipelineContext += '\n\nIMPORTANT: Answer using ONLY the evidence above. Cite sources with [Source: Document Name]. If the evidence contains project metadata (budget, mode, timeline, km stretch), include it in a **Project Overview** section even if the user did not ask for it.\n\nSTRICT ANTI-HALLUCINATION RULES:\n- NEVER invent names, phone numbers, email addresses, or costs. If a phone number or name is not LITERALLY written in the evidence above, do NOT include one.\n- If the evidence does not contain the answer, say "This specific data is not available in the VIGIA index" — do NOT fill in the gap with made-up data.\n- Every name, number, email, and cost you output MUST appear verbatim in the evidence chunks above. If you cannot point to the exact line, do not include it.\n\nCRITICAL CONTACT INFORMATION RULE:\n- For personnel queries: ONLY use names, phone numbers, and emails that appear EXACTLY in the evidence bullets above.\n- The ONLY valid contact details are those preceded by "Phone:", "Email:", or that appear as part of a person\'s title line in the evidence.\n- If you output a phone number like 98XXXXXXXX that is NOT in the evidence, you are hallucinating. Use ONLY landline numbers (like 020-XXXXXXXX) or mobile numbers that appear verbatim above.\n- COPY-PASTE the name and number from the evidence. Do not paraphrase or substitute.';
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

        // Prevent chat history contamination: only include recent messages,
        // and instruct the model to prioritize fresh evidence over prior responses
        const allModelMessages = await convertToModelMessages(messages);
        // Keep only last 6 messages for context, prioritize current turn
        const recentMessages = allModelMessages.slice(-6);
        // Bedrock requires: starts with user message, no empty content
        const cleanMessages = recentMessages.filter(m => 
          m.content && (typeof m.content === 'string' ? m.content.length > 0 : Array.isArray(m.content) && m.content.length > 0)
        );
        const firstUserIdx = cleanMessages.findIndex(m => m.role === 'user');
        const validMessages = firstUserIdx > 0 ? cleanMessages.slice(firstUserIdx) : cleanMessages;
        const modelMessages = augmentModelMessagesForLanguage(validMessages, responseLanguage);

        // Use Nova Pro for personnel queries to reduce hallucination of contact details
        const isPersonnelIntent = /\b(engineer|officer|contact|phone|who is|name|complaint)\b/i.test(queryText);
        const chatModel = isPersonnelIntent ? bedrock('amazon.nova-pro-v1:0') : bedrock('amazon.nova-lite-v1:0');

        const result = streamText({
          model: chatModel,
          system: system + '\n\nCHAT HISTORY RULE: Your previous responses in this conversation may contain outdated or incorrect information. ALWAYS prioritize the fresh VIGIA Pipeline Evidence above over anything you said in earlier turns. If the evidence contradicts your prior response, the evidence is correct.',
          messages: modelMessages,
        });

        let fullText = '';
        const textStream = result.toUIMessageStream({
          onFinish: () => {
            if (evidenceAnnotation) {
              // Run faithfulness scoring asynchronously (non-blocking)
              if (retrievedChunks.length > 0 && fullText.length > 0) {
                void scoreFaithfulness(fullText, retrievedChunks).then(({ score, flagged }) => {
                  (evidenceAnnotation as any).faithfulnessScore = score;
                  (evidenceAnnotation as any).flaggedClaims = flagged;
                });
              }
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
