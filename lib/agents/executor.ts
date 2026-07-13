import { generateObject } from 'ai';
import { bedrock } from '@/lib/agents/bedrock-provider';
import { z } from 'zod';
import type { Plan, PlanStep } from './planner';
import type { UnifiedResult } from '../tools/search-unified';
import type { Payload } from './state';
import { searchNHAI, searchPWD, searchPMGSY, searchAll } from '../tools/search-federated';
import type { IndiaGeo } from '../tools/geo-resolve';

// ─── Types ──────────────────────────────────────────────────────────

export interface StepResult {
  stepId: string;
  tool: string;
  query: string;
  chunks: UnifiedResult[];
  extracted: Record<string, string>;
}

// ─── Topological Sort ───────────────────────────────────────────────

function topologicalSort(steps: PlanStep[]): PlanStep[][] {
  const phases: PlanStep[][] = [];
  const completed = new Set<string>();

  let remaining = [...steps];
  while (remaining.length > 0) {
    const phase = remaining.filter(s =>
      !s.dependsOn?.length || s.dependsOn.every(d => completed.has(d))
    );
    if (phase.length === 0) {
      // Circular dependency — dump remaining into final phase
      phases.push(remaining);
      break;
    }
    phases.push(phase);
    for (const s of phase) completed.add(s.id);
    remaining = remaining.filter(s => !completed.has(s.id));
  }
  return phases;
}

// ─── Tool Dispatch ──────────────────────────────────────────────────

function executeTool(tool: string, query: string, geo?: IndiaGeo): Promise<UnifiedResult[]> {
  switch (tool) {
    case 'searchNHAI': return searchNHAI(query);
    case 'searchPWD': return searchPWD(query, 8, geo);
    case 'searchPMGSY': return searchPMGSY(query);
    default: return searchAll(query);
  }
}

// ─── Entity Extraction (Two-Tiered: Metadata → LLM Fallback) ────────

async function extractEntities(
  chunks: UnifiedResult[],
  fields: string[]
): Promise<Record<string, string>> {
  if (!chunks.length || !fields.length) return {};

  const extracted: Record<string, string> = {};

  // Tier 1: Structured metadata (instant, no LLM) — scan all chunks
  for (const field of fields) {
    for (const chunk of chunks) {
      if (extracted[field]) break;
      switch (field) {
        case 'district':
          if (chunk.district && !chunk.district.startsWith('R&B') && !chunk.district.startsWith('ENC')) {
            extracted.district = chunk.district; break;
          }
          if ((chunk.metadata as any)?.district) { extracted.district = (chunk.metadata as any).district; break; }
          // NHAI PDF format: "TelanganaKhammam4L" or "Telangana\nKhammam"
          const distMatch = chunk.chunkText.match(/(?:Telangana|Maharashtra|Kerala|Karnataka|Tamil Nadu|Andhra Pradesh|Rajasthan|Gujarat|Punjab|Haryana|Uttar Pradesh|Bihar|Odisha)[\n\s]*([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*\d*L/);
          if (distMatch) { extracted.district = distMatch[1]; break; }
          break;
        case 'state':
          if (chunk.state) { extracted.state = chunk.state; break; }
          break;
        case 'concessionaire':
          if (chunk.concessionaire) { extracted.concessionaire = chunk.concessionaire; break; }
          if ((chunk.metadata as any)?.concessionaire) { extracted.concessionaire = (chunk.metadata as any).concessionaire; break; }
          break;
        case 'roadNumber':
          if (chunk.roadNumber) { extracted.roadNumber = chunk.roadNumber; break; }
          break;
      }
    }
  }

  // Check if all fields resolved from metadata
  const missing = fields.filter(f => !extracted[f]);
  if (missing.length === 0) return extracted;

  // Tier 2: Fast LLM extraction for missing fields
  try {
    const schemaShape: Record<string, z.ZodTypeAny> = {};
    for (const f of missing) {
      schemaShape[f] = z.string().nullable().describe(`The ${f} mentioned in the text, or null if not found`);
    }

    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: z.object(schemaShape),
      prompt: `Extract the following fields from this infrastructure database record:\nFields needed: ${missing.join(', ')}\n\nTEXT:\n"${chunks.slice(0, 3).map(c => c.chunkText.slice(0, 300)).join('\n')}"`,
    });

    for (const [key, value] of Object.entries(object)) {
      if (value && typeof value === 'string') extracted[key] = value;
    }
  } catch {
    // LLM extraction failed — continue with what we have
  }

  return extracted;
}

// ─── Main Executor ──────────────────────────────────────────────────

export async function executePlan(plan: Plan, payload: Payload): Promise<StepResult[]> {
  const results = new Map<string, StepResult>();
  const phases = topologicalSort(plan.steps);

  for (const phase of phases) {
    const phaseResults = await Promise.all(
      phase.map(async (step): Promise<StepResult> => {
        // Build query with injected entities from dependencies, and capture the
        // resolved geographic anchor so personnel retrieval can be constrained to the
        // correct jurisdiction (rather than relying on loose text similarity).
        let query = step.query;
        const geo: IndiaGeo = {};
        if (step.injectFrom) {
          for (const [, ref] of Object.entries(step.injectFrom)) {
            const [depId, field] = ref.split('.');
            const depResult = results.get(depId);
            const value = depResult?.extracted?.[field];
            if (value) {
              query = `${query} ${value}`;
              if (field === 'district') geo.district = value;
              if (field === 'state') geo.state = value;
            }
          }
        }

        // Execute tool
        const chunks = await executeTool(step.tool, query, geo);

        // Extract entities if requested
        const extracted = step.extract
          ? await extractEntities(chunks, step.extract)
          : {};

        return { stepId: step.id, tool: step.tool, query, chunks, extracted };
      })
    );

    for (const r of phaseResults) results.set(r.stepId, r);
  }

  return Array.from(results.values());
}
