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
import { buildResponseStylePrompt } from '@/lib/settings/prompt';
import type { ResponseStyle } from '@/lib/settings/types';
import { routerNode, ingestNode, guardrailNode, uiHookNode } from '@/lib/agents/graph';
import { extractUIPayload } from '@/lib/agents/ui-hook';
import { scoreFaithfulness } from '@/lib/agents/faithfulness';
import { buildEmargRecordDisclosure } from '@/lib/agents/emarg-disclosure';
import { buildNhaiPersonnelDisclosure } from '@/lib/agents/nhai-personnel-disclosure';
import { PayloadSchema, type Payload, type VigiaState } from '@/lib/agents/state';
import { getCachedResponse, setCachedResponse } from '@/lib/cache/semantic-cache';
import { streamFromEngine } from '@/lib/search-engine/client';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 5 * 1024 * 1024;
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

function parseResponseStyle(value: unknown): ResponseStyle | null {
  if (value === 'concise' || value === 'detailed' || value === 'citizen-friendly') {
    return value;
  }
  return null;
}

function getTextFromMessage(message: UIMessage | undefined): string {
  return message?.parts
    ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join(' ') ?? '';
}

function isContextDependentFollowUp(text: string): boolean {
  return /^(?:are you sure|can you verify(?: that)?|please (?:verify|double-check)(?: that)?|double-check(?: that)?|really)[?.!\s]*$/i.test(text.trim());
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
      responseStyle?: unknown;
      imageUrl?: unknown;
      gps?: unknown;
    };
    const { messages } = parsed;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const requestLanguage = parseRequestLanguage(parsed);
    const responseLanguage = resolveChatResponseLanguage(requestLanguage, messages);
    const responseStyle = parseResponseStyle(parsed.responseStyle);
    const stylePrompt = responseStyle ? buildResponseStylePrompt(responseStyle) : '';
    const baseSystem = buildMultilingualSystemPrompt(VIGIA_BASE_SYSTEM_PROMPT, responseLanguage) + stylePrompt;

    // Extract user query text
    const userMessages = messages.filter((message) => message.role === 'user');
    const lastUserMsg = userMessages.at(-1);
    const previousUserMsg = userMessages.at(-2);
    const queryText = getTextFromMessage(lastUserMsg);
    const contextualFollowUp = isContextDependentFollowUp(queryText) && previousUserMsg !== undefined;
    const retrievalQueryText = contextualFollowUp
      ? `${getTextFromMessage(previousUserMsg)}\nFollow-up verification request: ${queryText}`
      : queryText;
    const attachedImage = lastUserMsg?.parts?.find((part) =>
      part.type === 'file' && part.mediaType.startsWith('image/'));
    const imageUrl = typeof parsed.imageUrl === 'string'
      ? parsed.imageUrl
      : attachedImage?.type === 'file'
        ? attachedImage.url
        : undefined;
    const shouldUseCache = !imageUrl && !contextualFollowUp;

    // ─── Semantic Cache Check ───────────────────────────────────────
    const cached = shouldUseCache ? await getCachedResponse(queryText) : null;
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
    const payloadResult = PayloadSchema.safeParse({
      text: retrievalQueryText,
      imageUrl,
      gps: parsed.gps,
      threadId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
    });
    if (!payloadResult.success) {
      return NextResponse.json({ error: payloadResult.error.issues.map((issue) => issue.message).join(', ') }, { status: 400 });
    }
    const pipelinePayload: Payload = payloadResult.data;

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const emitStep = (step: string) => {
          writer.write({ type: 'data-vigia-step', id: crypto.randomUUID(), data: [{ vigia_step: step, ts: Date.now() }], transient: true } as any);
        };

        // ─── Inline Pipeline Execution with Progress ──────────────
        let pipelineContext = '';
        let evidenceAnnotation: Record<string, unknown> | null = null;
        let retrievedChunks: string[] = [];

        // ─── External Engine Path (Fargate SSE) ──────────────────
        if (process.env.VIGIA_ENGINE_URL && !pipelinePayload.imageUrl) {
          try {
            const history = messages
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .slice(-6)
              .map((m) => ({
                role: m.role as string,
                content: m.parts?.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map((p) => p.text).join(' ') ?? '',
              }));

            // Stream tokens live as they arrive from the engine.
            // text-start / text-end follow the exact ID pattern the AI SDK client expects.
            const TEXT_ID = 'text-1';
            let textStarted = false;

            for await (const event of streamFromEngine({
              query: retrievalQueryText,
              threadId: pipelinePayload.threadId,
              messageId: pipelinePayload.messageId,
              history,
              gps: pipelinePayload.gps,
              imageUrl: pipelinePayload.imageUrl,
              responseLanguage: responseLanguage != null ? String(responseLanguage) : undefined,
              responseStyle: responseStyle ?? undefined,
            })) {
              if (event.type === 'step') {
                emitStep(event.step);
              } else if (event.type === 'text-delta') {
                if (!textStarted) {
                  writer.write({ type: 'text-start', id: TEXT_ID } as any);
                  textStarted = true;
                }
                writer.write({ type: 'text-delta', id: TEXT_ID, delta: event.delta } as any);
              } else if (event.type === 'metadata') {
                if (textStarted) {
                  writer.write({ type: 'text-end', id: TEXT_ID } as any);
                  textStarted = false;
                }
                writer.write({ type: 'message-metadata', messageMetadata: event.payload });
              } else if (event.type === 'error') {
                throw new Error(event.message);
              }
            }

            if (textStarted) writer.write({ type: 'text-end', id: TEXT_ID } as any);
            return;
          } catch (err) {
            console.error('Engine proxy failed, falling back to in-process pipeline:', err);
          }
        }

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
          if (state.auditFinding) {
            // Authority fallback or synthesizer already produced a finding
            pipelineContext = '\n\n## VIGIA Pipeline Evidence (use this to answer):\n';
            pipelineContext += `\n### Authority Fallback:\n${state.auditFinding.split('\n').map(l => `- ${l}`).join('\n')}\n`;
            pipelineContext += '\nIMPORTANT: Output the EXACT portal URLs, helpline numbers, and authority names shown above. Do NOT replace them with generic advice.';
          }
          if (state.evidence.length > 0) {
            if (!pipelineContext) pipelineContext = '\n\n## VIGIA Pipeline Evidence (use this to answer):\n';

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
            pipelineContext += '\n\nIMPORTANT: Answer using ONLY the evidence above. Cite sources with [Source: Document Name]. If the evidence contains project metadata (budget, mode, timeline, km stretch), include it in a **Project Overview** section even if the user did not ask for it.\n\nSTRICT ANTI-HALLUCINATION RULES:\n- NEVER invent names, phone numbers, email addresses, or costs. If a phone number or name is not LITERALLY written in the evidence above, do NOT include one.\n- If the evidence does not contain the answer, say "This specific data is not available in the VIGIA index" — do NOT fill in the gap with made-up data.\n- Every name, number, email, and cost you output MUST appear verbatim in the evidence chunks above. If you cannot point to the exact line, do not include it.\n- NEVER sum costs from separate sections, packages, arbitration cases, or concessions. If the user asks for the total budget of an entire highway and the evidence only contains scoped project amounts, state that no authoritative whole-highway total is available and list each amount with its exact scope.\n- For NH-44 TOT Bundle-16, ₹6661 crore is the scoped TOT concession award/value for the Hyderabad-Nagpur corridor. Never call it the sanctioned construction budget for NH-44.\n- NEVER infer project status, completion, progress, road length, or a date\'s meaning from an LOA/award date or OCR layout. Omit a field unless the evidence explicitly labels it.\n\nCRITICAL CONTACT INFORMATION RULE:\n- For personnel queries: ONLY use names, phone numbers, and emails that appear EXACTLY in the evidence bullets above.\n- The ONLY valid contact details are those preceded by "Phone:", "Email:", or that appear as part of a person\'s title line in the evidence.\n- If you output a phone number like 98XXXXXXXX that is NOT in the evidence, you are hallucinating. Use ONLY landline numbers (like 020-XXXXXXXX) or mobile numbers that appear verbatim above.\n- COPY-PASTE the name and number from the evidence. Do not paraphrase or substitute.';
          }

          evidenceAnnotation = {
            type: 'vigia-evidence',
            sources: uiPayload.sources,
            claims: uiPayload.claims,
            offline: uiPayload.offline,
            debugTrace: uiPayload.debugTrace,
            totalLatencyMs: uiPayload.totalLatencyMs,
            contradictionVerified: uiPayload.contradictionVerified,
            budgetData: uiPayload.budgetData,
            evidenceImages: uiPayload.evidenceImages,
            spatialMarkers: uiPayload.spatialMarkers,
            pendingAction: uiPayload.pendingAction,
          };

          const personnelDisclosure = state.evidence.findLast((item) =>
            item.agentId === 'admin' &&
            item.metadata?.personnelAnchorMissing === true
          );
          const evidenceText = state.evidence.flatMap((item) => item.findings).join('\n');
          const emargDisclosure = buildEmargRecordDisclosure(retrievalQueryText, state.evidence);
          const nhaiPersonnelDisclosure = buildNhaiPersonnelDisclosure(retrievalQueryText, state.evidence);
          const visionEvidence = state.evidence.findLast((item) =>
            item.agentId === 'vision' && item.status === 'completed'
          );
          const visionDisclosure = visionEvidence
              ? [
                '**What I can see in the photo**',
                `- Model assessment: ${visionEvidence.severity ?? 'unclassified'} (${Math.round(visionEvidence.confidence * 100)}% confidence).`,
                ...visionEvidence.findings
                  .filter((finding) => !finding.startsWith('Note:'))
                  .map((finding) => `- ${finding.replace(/^\[CITIZEN CLAIM\]\s*/i, '')}`),
                '',
                '**Recommended next steps**',
                pipelinePayload.gps
                  ? `- Use the attached coordinates (${pipelinePayload.gps.lat.toFixed(5)}, ${pipelinePayload.gps.lng.toFixed(5)}) to identify the responsible road authority.`
                  : '- Attach the location so VIGIA can identify whether NHAI, the State PWD, a municipality, or another road authority is responsible.',
                '- Ask VIGIA to draft a complaint email that includes the observations, location, and this photo.',
                '- Treat this as a citizen photo assessment until an authority verifies the condition on site.',
              ].join('\n')
            : null;
          const isNh44TotQuery = /\bNH[-\s]?44\b/i.test(queryText) &&
            /\b(?:Hyderabad|Nagpur)\b/i.test(queryText) &&
            /\bTOT\b/i.test(queryText) &&
            /\b(?:award|value)\b/i.test(queryText);
          const nh44TotDisclosure = isNh44TotQuery &&
            /\b6L\b|6[- ]lane/i.test(evidenceText) &&
            /Highway Infrastructure Trust/i.test(evidenceText) &&
            /(?:6661|6,661)/.test(evidenceText)
            ? [
                'For the NH-44 Hyderabad-Nagpur corridor:',
                'Road type: 6L (six-lane).',
                'Current O&M concessionaire: Highway Infrastructure Trust (KKR InvIT), under TOT Bundle-16.',
                'Scoped TOT concession award/value: ₹6,661 crore.',
                'This is not the sanctioned construction budget for the entire NH-44 highway.',
              ].join('\n')
            : null;
          const isNh44WholeTotalQuery = /\bNH[-\s]?44\b/i.test(queryText) &&
            /\btotal\b.*\b(?:budget|cost|amount|sanctioned)\b|\b(?:budget|cost|amount|sanctioned)\b.*\btotal\b/i.test(queryText) &&
            !/\b(?:section|stretch|package|corridor|between)\b/i.test(queryText);
          const nh44WholeTotalDisclosure = isNh44WholeTotalQuery
            ? [
                'The current cited evidence does not publish one authoritative sanctioned budget total for the entire NH-44 highway.',
                '₹6,661 crore is a scoped TOT concession award/value for the Hyderabad-Nagpur corridor, not the sanctioned construction budget for all of NH-44.',
                'VIGIA will not sum unrelated sections, packages, arbitration figures, or concessions into a fabricated highway total.',
              ].join('\n')
            : null;
          const deterministicText = emargDisclosure
            ? emargDisclosure
            : nhaiPersonnelDisclosure
            ? nhaiPersonnelDisclosure
            : visionDisclosure
            ? visionDisclosure
            : personnelDisclosure
            ? personnelDisclosure.findings.slice(0, 5).join('\n')
            : nh44TotDisclosure
              ? nh44TotDisclosure
            : nh44WholeTotalDisclosure
              ? nh44WholeTotalDisclosure
            : state.pipelineStatus === 'complete' && state.auditFinding
              ? state.auditFinding
              : null;

          if (deterministicText) {
            const textId = crypto.randomUUID();
            writer.write({ type: 'text-start', id: textId } as any);
            writer.write({ type: 'text-delta', id: textId, delta: deterministicText } as any);
            writer.write({ type: 'text-end', id: textId } as any);
            writer.write({ type: 'message-metadata', messageMetadata: evidenceAnnotation });
            if (shouldUseCache) {
              await setCachedResponse(queryText, {
                text: deterministicText,
                metadata: evidenceAnnotation,
                cachedAt: Date.now(),
              });
            }
            return;
          }
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
            if (shouldUseCache) {
              void setCachedResponse(queryText, { text: fullText, metadata: evidenceAnnotation, cachedAt: Date.now() });
            }
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
