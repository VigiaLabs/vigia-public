import { generateObject } from 'ai';
import { bedrock } from '@/lib/agents/bedrock-provider';
import { z } from 'zod';

export const PlanStepSchema = z.object({
  id: z.string(),
  tool: z.enum(['searchNHAI', 'searchPWD', 'searchPMGSY', 'searchAll']),
  query: z.string(),
  extract: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  injectFrom: z.record(z.string(), z.string()).optional(),
});

export const PlanSchema = z.object({
  steps: z.array(PlanStepSchema).min(1).max(4),
  reasoning: z.string().default('Model-generated retrieval plan.'),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;

export async function generatePlan(
  query: string,
  intent: string | undefined,
  hasGps: boolean
): Promise<Plan> {
  const roadMatch = query.match(/\b(NH|SH|MDR)[-\s]?(\d+[A-Z]?)\b/i);
  const canonicalRoad = roadMatch ? `${roadMatch[1].toUpperCase()}-${roadMatch[2].toUpperCase()}` : null;

  if (canonicalRoad?.startsWith('NH-') && !/\bPMGSY\b/i.test(query)) {
    return {
      steps: [{
        id: 'nhai_exact_road',
        tool: 'searchNHAI',
        query: canonicalRoad,
      }],
      reasoning: `Exact national-highway lookup for ${canonicalRoad}.`,
    };
  }

  const { object } = await generateObject({
    model: bedrock('amazon.nova-lite-v1:0'),
    schema: PlanSchema,
    prompt: `You are a retrieval planner for VIGIA, an Indian infrastructure database with 3 data sources:
- searchNHAI: Contract data (road numbers, concessionaires, costs, districts, states, project modes EPC/HAM/BOT)
- searchPWD: Personnel directory (executive engineers, phone numbers, emails, divisions, states)
- searchPMGSY: Rural road data (road names, contractors, costs, districts, states, schemes)

Given a user query, output a COMPLETE execution plan with ALL steps needed to fully answer the query. Rules:
1. If the query needs data from multiple sources, create separate steps for each.
2. If Step B needs information from Step A's results (e.g., need district from NHAI to find PWD contact), set dependsOn and injectFrom.
3. Steps WITHOUT dependencies run in PARALLEL.
4. Use "extract" to specify entities to pull from results: "district", "state", "concessionaire", "roadNumber".
5. Maximum 4 steps. Most queries need 1-2.
6. For a State Highway personnel query, use both steps:
   - Step 1: searchNHAI to find the road's district (extract: ["district"])
   - Step 2: searchPWD with dependsOn Step 1 and injectFrom district
   For a National Highway personnel query, search NHAI project records only. State PWD officers must not be presented as the project-specific NHAI official.
7. For PMGSY queries, use searchPMGSY directly.
8. If the query asks about multiple unrelated things, create independent parallel steps.
9. ALWAYS include geographic terms (city, state, district names) from the user query in your search queries. Never drop location context.

USER QUERY: "${query}"
INTENT: ${intent ?? 'unknown'}
HAS GPS: ${hasGps}`,
  });

  const isPersonnelQuery = /\b(engineer|EE|phone|contact|officer|official|responsible|authority|personnel|in charge|who manages)\b/i.test(query);
  const isNationalHighwayPersonnel = isPersonnelQuery && canonicalRoad?.startsWith('NH-');

  if (isNationalHighwayPersonnel) {
    object.steps = object.steps.filter((step) => step.tool !== 'searchPWD');
    const nhaiStep = object.steps.find((step) => step.tool === 'searchNHAI');
    if (nhaiStep) {
      nhaiStep.query = canonicalRoad ?? nhaiStep.query;
      nhaiStep.extract = [...new Set([...(nhaiStep.extract ?? []), 'district', 'state', 'roadNumber'])];
    } else {
      object.steps.push({
        id: 'nhai_personnel_auto',
        tool: 'searchNHAI',
        query: canonicalRoad ?? query.slice(0, 60),
        extract: ['district', 'state', 'roadNumber'],
      });
    }
  }

  // Deterministic fix: State Highway personnel queries need PWD district injection.
  const hasNhaiExtract = object.steps.some(s => s.tool === 'searchNHAI' && s.extract?.includes('district'));
  const hasPwdWithDep = object.steps.some(s => s.tool === 'searchPWD' && s.dependsOn?.length && s.injectFrom);

  if (isPersonnelQuery && !isNationalHighwayPersonnel && hasNhaiExtract && !hasPwdWithDep) {
    // Remove any PWD steps without proper dependency injection
    object.steps = object.steps.filter(s => !(s.tool === 'searchPWD' && !s.injectFrom));
    const nhaiStep = object.steps.find(s => s.tool === 'searchNHAI' && s.extract?.includes('district'))!;
    const stateMatch = query.match(/\b(Telangana|Maharashtra|Kerala|Karnataka|Tamil Nadu|Andhra Pradesh|Rajasthan|Gujarat|Punjab|Haryana|Uttar Pradesh|Bihar|Odisha|West Bengal)\b/i);
    object.steps.push({
      id: `${nhaiStep.id}_pwd`,
      tool: 'searchPWD',
      query: `Executive Engineer ${stateMatch?.[1] ?? ''}`.trim(),
      dependsOn: [nhaiStep.id],
      injectFrom: { district: `${nhaiStep.id}.district` },
    });
  }

  // Deterministic fix: multi-query coverage
  // If query mentions PMGSY/rural but no searchPMGSY step exists, add one
  const mentionsPmgsy = /\b(PMGSY|rural road|gram sadak)\b/i.test(query);
  const hasPmgsyStep = object.steps.some(s => s.tool === 'searchPMGSY');
  if (mentionsPmgsy && !hasPmgsyStep) {
    const locMatch = query.match(/\b(Pune|Nagpur|Mumbai|Chennai|Kolkata|Bengaluru|Hyderabad|[A-Z][a-z]+\s+(?:District|district))\b/);
    object.steps.push({
      id: 'pmgsy_auto',
      tool: 'searchPMGSY',
      query: `PMGSY rural road ${locMatch?.[1] ?? ''} contractor`.trim(),
    });
  }

  // If query mentions NH/SH road but no searchNHAI step exists, add one
  const mentionsNhai = /\b(?:NH|SH|MDR)[-\s]?\d+[A-Z]?\b|national highway|budget|contract|tender/i.test(query);
  const hasNhaiStep = object.steps.some(s => s.tool === 'searchNHAI');
  if (mentionsNhai && !hasNhaiStep) {
    object.steps.push({
      id: 'nhai_auto',
      tool: 'searchNHAI',
      query: canonicalRoad ?? query.slice(0, 60),
      extract: ['district', 'state'],
    });
  }

  return object;
}
