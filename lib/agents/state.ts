import { z } from 'zod';
import { Annotation } from '@langchain/langgraph';

// ─── Payload (User Input) ───────────────────────────────────────────

export const PayloadSchema = z.object({
  text: z.string().optional(),
  imageUrl: z.string().url().optional(),
  gps: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  threadId: z.string().uuid(),
  messageId: z.string().uuid(),
  history: z
    .array(z.object({ role: z.string(), content: z.string() }))
    .optional(),
});

// ─── Normalized Evidence (Shadow Normalization) ─────────────────────

export const CitationSchema = z.object({
  sourceId: z.string(),
  label: z.string(),
  url: z.string().optional(),
  trustLevel: z.enum(['verified-spatial', 'legally-binding', 'official-portal']),
});

export const NormalizedEvidenceSchema = z.object({
  agentId: z.enum(['vision', 'admin', 'telemetry']),
  status: z.enum(['completed', 'partial', 'error', 'skipped']),
  confidence: z.number().min(0).max(1),
  severity: z
    .enum(['critical', 'severe', 'moderate', 'minor', 'none'])
    .optional(),
  findings: z.array(z.string()),
  citations: z.array(CitationSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
  errorReason: z.string().optional(),
  latencyMs: z.number(),
});

// ─── Synthesized Citation ───────────────────────────────────────────

export const SynthesizedCitationSchema = z.object({
  number: z.number(),
  label: z.string(),
  sourceId: z.string(),
});

// ─── Debug Trace Entry ──────────────────────────────────────────────

export const DebugTraceEntrySchema = z.object({
  node: z.string(),
  timestamp: z.number(),
  decision: z.string(),
});

// ─── Pipeline Status ────────────────────────────────────────────────

export const PipelineStatusSchema = z.enum([
  'routing',
  'ingesting',
  'guardrail',
  'retrying',
  'synthesizing',
  'complete',
  'failed',
]);

// ─── Full Graph State Schema ────────────────────────────────────────

export const VigiaStateSchema = z.object({
  traceId: z.string().uuid(),
  startedAt: z.number(),
  payload: PayloadSchema,
  activeAgents: z.array(z.enum(['vision', 'admin', 'telemetry'])),
  evidence: z.array(NormalizedEvidenceSchema),
  retryCount: z.number().default(0),
  retryQuery: z.string().optional(),
  contradictionDetected: z.boolean().default(false),
  contradictionVerified: z.boolean().default(false),
  auditFinding: z.string().optional(),
  synthesizedCitations: z.array(SynthesizedCitationSchema).optional(),
  pipelineStatus: PipelineStatusSchema,
  errorMessage: z.string().optional(),
  totalLatencyMs: z.number().optional(),
  debugTrace: z.array(DebugTraceEntrySchema).default([]),
});

// ─── Inferred Types ─────────────────────────────────────────────────

export type Payload = z.infer<typeof PayloadSchema>;
export type NormalizedEvidence = z.infer<typeof NormalizedEvidenceSchema>;
export type SynthesizedCitation = z.infer<typeof SynthesizedCitationSchema>;
export type DebugTraceEntry = z.infer<typeof DebugTraceEntrySchema>;
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
export type VigiaState = z.infer<typeof VigiaStateSchema>;

// ─── LangGraph State Annotation ─────────────────────────────────────
// Defines channels with reducers for append-only arrays

export const VigiaStateAnnotation = Annotation.Root({
  traceId: Annotation<string>,
  startedAt: Annotation<number>,
  payload: Annotation<Payload>,
  activeAgents: Annotation<VigiaState['activeAgents']>,
  evidence: Annotation<NormalizedEvidence[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  retryCount: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  retryQuery: Annotation<string | undefined>,
  contradictionDetected: Annotation<boolean>({
    reducer: (_a, b) => b,
    default: () => false,
  }),
  contradictionVerified: Annotation<boolean>({
    reducer: (_a, b) => b,
    default: () => false,
  }),
  auditFinding: Annotation<string | undefined>,
  synthesizedCitations: Annotation<SynthesizedCitation[] | undefined>,
  pipelineStatus: Annotation<PipelineStatus>,
  errorMessage: Annotation<string | undefined>,
  totalLatencyMs: Annotation<number | undefined>,
  debugTrace: Annotation<DebugTraceEntry[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});
