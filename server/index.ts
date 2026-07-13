/**
 * VIGIA Search — standalone Express SSE server.
 * Runs the full TypeScript LangGraph pipeline and streams results
 * as Server-Sent Events for the Android app.
 *
 * POST /v1/search          → SSE stream
 * GET  /health             → 200 { status: "ok" }
 */

import express from 'express';
import { streamText } from 'ai';
import { bedrock } from '../lib/agents/bedrock-provider';
import { routerNode, ingestNode, guardrailNode, uiHookNode } from '../lib/agents/graph';
import { extractUIPayload } from '../lib/agents/ui-hook';
import { scoreFaithfulness } from '../lib/agents/faithfulness';
import { VIGIA_BASE_SYSTEM_PROMPT } from '../lib/voice/chat-prompt';
import type { Payload, VigiaState } from '../lib/agents/state';

const app = express();
app.use(express.json({ limit: '256kb' }));

// ─── Health check ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

// ─── SSE Search endpoint ───────────────────────────────────────────
app.post('/v1/search', async (req, res) => {
  const body = req.body as {
    query?: string;
    threadId?: string;
    gps?: { lat: number; lng: number };
    imageUrl?: string;
    history?: Array<{ role: string; content: string }>;
  };

  if (!body.query || typeof body.query !== 'string') {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  // SSE headers — ALB idle timeout must be ≥300s
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function send(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function emitStep(step: string) {
    send('step', { step, ts: Date.now() });
  }

  const pipelinePayload: Payload = {
    text: body.query,
    threadId: body.threadId ?? crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    gps: body.gps,
    imageUrl: body.imageUrl,
    history: body.history,
  };

  try {
    // ── Node 1: Router ───────────────────────────────────────────
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

    // Short-circuit: conversational query
    if (state.pipelineStatus === 'complete') {
      send('text', {
        delta: state.auditFinding ??
          "Hello! I'm VIGIA. I can help you file complaints, look up RTI authorities, check road conditions, or search tender data.",
      });
      send('done', {});
      res.end();
      return;
    }

    // ── Node 2: Ingest ───────────────────────────────────────────
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
      for (const step of reasoningTrace) emitStep(step);
    }

    // ── Node 3: Guardrail ────────────────────────────────────────
    emitStep('Verifying evidence...');
    const guardrailResult = await guardrailNode(state);
    state = {
      ...state,
      ...guardrailResult,
      debugTrace: [...state.debugTrace, ...(guardrailResult.debugTrace ?? [])],
    };

    // ── Retry loop ───────────────────────────────────────────────
    if (state.pipelineStatus === ('retrying' as string)) {
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

      if (state.pipelineStatus === 'complete') {
        emitStep('Routing to authority contacts...');
      }
    }

    // ── Node 4: UI Hook ──────────────────────────────────────────
    const hookResult = uiHookNode(state);
    state = {
      ...state,
      ...hookResult,
      debugTrace: [...state.debugTrace, ...(hookResult.debugTrace ?? [])],
    };

    const uiPayload = extractUIPayload(state);

    // ── Node 5: Answer Generation ────────────────────────────────
    // Mirrors the Next.js chat route: build an evidence context with
    // strict anti-hallucination rules and stream the answer through the
    // LLM. We deliberately do NOT use synthesizer.ts here — its
    // "context expansion directive" encourages reporting every retrieved
    // chunk, which causes off-target hallucinations (e.g. answering an
    // NH 77 query with Adilabad personnel that merely scored similar).
    emitStep('Generating response...');
    const queryText = body.query;
    const retrievedChunks: string[] = [];
    let pipelineContext = '';

    if (state.auditFinding) {
      // Authority fallback (or guardrail warning) already produced a finding.
      pipelineContext = '\n\n## VIGIA Pipeline Evidence (use this to answer):\n';
      pipelineContext += `\n### Authority Fallback:\n${state.auditFinding.split('\n').map(l => `- ${l}`).join('\n')}\n`;
      pipelineContext += '\nIMPORTANT: Output the EXACT portal URLs, helpline numbers, and authority names shown above. Do NOT replace them with generic advice.';
    }

    if (state.evidence.length > 0) {
      if (!pipelineContext) pipelineContext = '\n\n## VIGIA Pipeline Evidence (use this to answer):\n';

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

      pipelineContext += '\n\nIMPORTANT: Answer using ONLY the evidence above. Cite sources with [Source: Document Name]. If the evidence contains project metadata (budget, mode, timeline, km stretch), include it in a **Project Overview** section even if the user did not ask for it.\n\nSTRICT ANTI-HALLUCINATION RULES:\n- NEVER invent names, phone numbers, email addresses, or costs. If a phone number or name is not LITERALLY written in the evidence above, do NOT include one.\n- If the evidence does not contain the answer, say "This specific data is not available in the VIGIA index" — do NOT fill in the gap with made-up data.\n- The road/highway number in the user\'s question MUST match the road number in the evidence. If the user asks about NH 77 but the evidence is about a different road (e.g. NH 340C, NH 44), the evidence does NOT answer the question — say the data is not available for the requested road.\n- DO NOT enumerate unrelated results as a consolation. If the requested road/project is not in the evidence, give ONLY the brief "data not available" statement plus any authority-fallback contact info. Never list officers, contractors, or projects for OTHER roads/districts that the user did not ask about. A short refusal is the correct, complete answer.\n- Every name, number, email, and cost you output MUST appear verbatim in the evidence chunks above. If you cannot point to the exact line, do not include it.\n\nCRITICAL CONTACT INFORMATION RULE:\n- For personnel queries: ONLY use names, phone numbers, and emails that appear EXACTLY in the evidence bullets above.\n- The ONLY valid contact details are those preceded by "Phone:", "Email:", or that appear as part of a person\'s title line in the evidence.\n- If you output a phone number that is NOT in the evidence, you are hallucinating.\n- COPY-PASTE the name and number from the evidence. Do not paraphrase or substitute.';
    }

    // Personnel queries use Nova Pro to reduce contact-detail hallucination.
    const isPersonnelIntent = /\b(engineer|officer|contact|phone|who is|name|complaint)\b/i.test(queryText);
    const chatModel = isPersonnelIntent ? bedrock('amazon.nova-pro-v1:0') : bedrock('amazon.nova-lite-v1:0');

    const historyMessages = (body.history ?? [])
      .slice(-6)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content }));

    const result = streamText({
      model: chatModel,
      system: VIGIA_BASE_SYSTEM_PROMPT + pipelineContext,
      messages: [...historyMessages, { role: 'user', content: queryText }],
    });

    let synthesizedText = '';
    for await (const delta of result.textStream) {
      synthesizedText += delta;
      send('text', { delta });
    }

    // Faithfulness score — checks synthesized answer against raw chunks
    let faithfulnessScore: number | undefined;
    let flaggedClaims: string[] | undefined;
    if (retrievedChunks.length > 0 && synthesizedText.length > 0) {
      try {
        const faith = await scoreFaithfulness(synthesizedText, retrievedChunks);
        faithfulnessScore = faith.score;
        flaggedClaims = faith.flagged;
      } catch {
        // non-critical
      }
    }

    // ── Metadata event ────────────────────────────────────────────
    send('metadata', {
      sources: uiPayload.sources,
      debugTrace: uiPayload.debugTrace,
      totalLatencyMs: uiPayload.totalLatencyMs,
      contradictionVerified: uiPayload.contradictionVerified,
      budgetData: uiPayload.budgetData,
      spatialMarkers: uiPayload.spatialMarkers,
      pendingAction: uiPayload.pendingAction,
      faithfulnessScore,
      flaggedClaims,
    });

  } catch (err) {
    console.error('Pipeline error:', err);
    send('error', { message: err instanceof Error ? err.message : 'Pipeline failed' });
  }

  send('done', {});
  res.end();
});

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, () => {
  console.log(`VIGIA Search server listening on :${PORT}`);
});
