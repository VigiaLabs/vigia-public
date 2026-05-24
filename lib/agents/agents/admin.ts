import { generateObject } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { z } from 'zod';
import type { NormalizedEvidence, Payload, VigiaState } from '../state';
import { getRoadInfoByCoordinates } from '../../tools/gati-shakti';
import { getRTIAuthority } from '../../tools/rti-lookup';
import { getComplaintAuthority } from '../../tools/complaint-routing';
import { resolveCountry, queryInternational } from '../../tools/global-engine';

const DEFAULT_SOURCE_URLS: Record<string, string> = {
  nhai_contract: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_22_23_0.pdf',
  pmgsy_road: 'https://omms.nic.in',
  pwd_contact: 'https://tg-roadcutting.cgg.gov.in/ContactUs',
  authority: 'https://pgportal.gov.in',
};

function getDefaultSourceUrl(sourceType: string): string {
  return DEFAULT_SOURCE_URLS[sourceType] ?? 'https://nhai.gov.in';
}

function buildCitationLabel(r: { sourceType: string; state?: string | null; district?: string | null; concessionaire?: string | null }, index: number): string {
  if (r.sourceType === 'nhai_contract') {
    if (r.concessionaire) return `NHAI Contract — ${r.concessionaire}`;
    if (r.state) return `NHAI Project — ${r.state}`;
    return `NHAI Awarded Projects PDF [${index + 1}]`;
  }
  if (r.sourceType === 'pmgsy_road') {
    return r.district ? `PMGSY — ${r.district}, ${r.state}` : 'PMGSY OMMAS Portal';
  }
  if (r.sourceType === 'pwd_contact') {
    return r.district ? `PWD Directory — ${r.district}` : 'State PWD Directory';
  }
  return 'VIGIA Index';
}

const RoadExtractSchema = z.object({
  roadNumber: z.string().nullable(),
  state: z.string().nullable(),
});

async function extractRoadContext(text: string): Promise<{ roadNumber: string | null; state: string | null }> {
  try {
    const { object } = await generateObject({
      model: bedrock('amazon.nova-lite-v1:0'),
      schema: RoadExtractSchema,
      prompt: `Extract the road number (e.g., NH-44, SH-15) and Indian state name from:\n"${text}"\nReturn null if not found.`,
    });
    return { roadNumber: object.roadNumber ?? null, state: object.state ?? null };
  } catch {
    return { roadNumber: null, state: null };
  }
}

export async function runAdminAgent(
  payload: Payload,
  retryQuery?: string,
  intent?: VigiaState['intent']
): Promise<NormalizedEvidence> {
  const start = Date.now();
  const text = retryQuery ? `${payload.text ?? ''} ${retryQuery}`.trim() : (payload.text ?? '').trim();

  if (!text) {
    return { agentId: 'admin', status: 'skipped', confidence: 0, findings: [], citations: [], latencyMs: Date.now() - start };
  }

  // ─── P0: GPS Gate for Personnel Intent ──────────────────────────
  if (intent === 'personnel' && !payload.gps) {
    const hasLocationInText = /\b(telangana|maharashtra|kerala|tamil nadu|karnataka|andhra pradesh|rajasthan|gujarat|madhya pradesh|uttar pradesh|bihar|odisha|punjab|haryana|west bengal|assam|jharkhand|chhattisgarh|goa|himachal|uttarakhand|delhi|mumbai|chennai|kolkata|bengaluru|hyderabad)\b/i.test(text);
    if (!hasLocationInText) {
      return {
        agentId: 'admin',
        status: 'completed',
        confidence: 0.0,
        findings: [
          'Please provide your location (GPS) or specify a geographic area (state/district) to look up personnel directories.',
          'Example: "Who is the executive engineer for NH-44 in Telangana?"',
        ],
        citations: [],
        metadata: { reason: 'personnel-requires-location' },
        latencyMs: Date.now() - start,
      };
    }
  }

  try {
    const { roadNumber, state } = await extractRoadContext(text);

    // Resolve road type from GPS if available
    let roadType: 'NH' | 'SH' | 'MDR' | 'rural' | 'unknown' = 'unknown';
    if (payload.gps) {
      const roadInfo = await getRoadInfoByCoordinates(payload.gps.lat, payload.gps.lng);
      roadType = roadInfo.roadType;
    } else if (roadNumber?.startsWith('NH')) {
      roadType = 'NH';
    } else if (roadNumber?.startsWith('SH')) {
      roadType = 'SH';
    }

    // ─── Country Detection & International Routing ────────────────
    if (payload.gps) {
      const country = await resolveCountry(payload.gps.lat, payload.gps.lng);
      if (!country.isIndia) {
        // P0: Strict abort for personnel — no international personnel data
        if (intent === 'personnel') {
          return {
            agentId: 'admin',
            status: 'completed',
            confidence: 0.95,
            findings: [
              `Current GPS location is in ${country.countryName} (${country.countryCode}), outside Indian jurisdiction.`,
              `VIGIA personnel directories are restricted to Indian infrastructure authorities (NHAI, State PWD, PMGSY).`,
              `For ${country.countryName} road authority contacts, consult your national transport ministry.`,
            ],
            citations: [],
            metadata: { countryCode: country.countryCode, reason: 'out-of-jurisdiction' },
            latencyMs: Date.now() - start,
          };
        }
        // International path — bypass India-specific tools
        const intlData = await queryInternational(country.countryCode, country.countryName, text);
        const findings: string[] = [`Country: ${country.countryName} (${country.countryCode})`];

        for (const wb of intlData.worldBankResults.slice(0, 3)) {
          findings.push(`Project: ${wb.projectName} (${wb.status})`);
          findings.push(`  Agency: ${wb.implementingAgency}, Amount: USD ${(wb.totalAmount / 1e6).toFixed(1)}M`);
        }
        for (const ocds of intlData.ocdsResults.slice(0, 3)) {
          findings.push(`Contract: ${ocds.title}`);
          findings.push(`  Entity: ${ocds.procuringEntity}${ocds.valueAmount ? `, Value: ${ocds.valueCurrency} ${ocds.valueAmount.toLocaleString()}` : ''}`);
        }

        if (findings.length === 1) {
          findings.push('No infrastructure project data found for this location. OpenStreetMap road data is still available.');
        }

        const citations = [
          ...intlData.worldBankResults.slice(0, 3).map(wb => ({
            sourceId: `worldbank-${wb.projectId}`, label: 'World Bank Projects', url: wb.sourceUrl, trustLevel: 'official-portal' as const,
          })),
          ...intlData.ocdsResults.slice(0, 3).map(ocds => ({
            sourceId: `ocds-${ocds.ocid}`, label: 'OCDS', url: ocds.sourceUrl, trustLevel: 'official-portal' as const,
          })),
        ];

        return {
          agentId: 'admin',
          status: 'completed',
          confidence: intlData.dataQualityTier === 'tier2-good' ? 0.8 : intlData.dataQualityTier === 'tier3-basic' ? 0.6 : 0.4,
          findings,
          citations,
          metadata: { countryCode: country.countryCode, dataQualityTier: intlData.dataQualityTier, source: 'global-engine' },
          latencyMs: Date.now() - start,
        };
      }
    }

    switch (intent) {
      case 'complaint': {
        const result = await getComplaintAuthority(roadType, state);
        return {
          agentId: 'admin',
          status: 'completed',
          confidence: 0.95,
          findings: [
            `Complaint authority: ${result.name}`,
            `Jurisdiction: ${result.jurisdiction}`,
            `Portal: ${result.complaintPortal}`,
            result.phone ? `Helpline: ${result.phone}` : null,
            `Escalation: ${result.escalationAuthority}`,
          ].filter(Boolean) as string[],
          citations: [{ sourceId: 'complaint-authority', label: result.source, url: result.sourceUrl, trustLevel: 'official-portal' }],
          metadata: { ...result } as unknown as Record<string, unknown>,
          latencyMs: Date.now() - start,
        };
      }

      case 'rti': {
        const result = await getRTIAuthority(roadType, state);
        return {
          agentId: 'admin',
          status: 'completed',
          confidence: 0.95,
          findings: [
            `RTI Authority: ${result.authority.name} (${result.authority.designation})`,
            `Organization: ${result.authority.organization}`,
            `Filing URL: ${result.authority.filingUrl}`,
            `Expected response: ${result.expectedResponseDays} days`,
            ...result.suggestedQuestions.slice(0, 3).map((q) => `Suggested question: "${q}"`),
          ],
          citations: [{ sourceId: 'rti-authority', label: result.source, url: result.sourceUrl, trustLevel: 'official-portal' }],
          metadata: { ...result } as unknown as Record<string, unknown>,
          latencyMs: Date.now() - start,
        };
      }

      case 'condition':
      case 'personnel':
      case 'tender_search':
      default: {
        // ─── Plan-and-Execute Sub-Graph (ReWOO Pattern) ───────────
        const { generatePlan } = await import('../planner');
        const { executePlan } = await import('../executor');
        const { getTrustLevel } = await import('../../tools/search-unified');

        try {
          const plan = await generatePlan(text, intent, !!payload.gps);
          const stepResults = await executePlan(plan, payload);

          // Merge all chunks from all steps
          const allChunks = stepResults.flatMap(r => r.chunks);
          if (allChunks.length === 0) {
            return {
              agentId: 'admin',
              status: 'completed',
              confidence: 0.1,
              findings: ['No relevant data found in VIGIA index for this query.'],
              citations: [],
              metadata: { planSteps: plan.steps.length, crossReferenced: plan.steps.some(s => s.dependsOn?.length) },
              latencyMs: Date.now() - start,
            };
          }

          // Deduplicate by chunk text prefix
          const seen = new Set<string>();
          const deduped = allChunks.filter(r => {
            const key = r.chunkText.slice(0, 80);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          const topSimilarity = Math.max(...deduped.map(r => r.similarity));

          // Boost confidence if cross-referencing successfully found targeted results
          const crossRefSuccess = plan.steps.some(s => s.dependsOn?.length) && deduped.some(r => r.sourceType === 'pwd_contact');
          const confidence = crossRefSuccess ? 0.85 : (topSimilarity > 0.8 ? 0.9 : topSimilarity > 0.6 ? 0.7 : topSimilarity > 0.5 ? 0.5 : 0.2);
          const findings: string[] = [];

          // Collect extracted entities for metadata
          const extractedEntities: Record<string, string> = {};
          for (const r of stepResults) {
            Object.assign(extractedEntities, r.extracted);
          }

          // Add cross-reference reasoning annotation so the LLM connects the dots
          if (plan.steps.some(s => s.dependsOn?.length) && Object.keys(extractedEntities).length > 0) {
            const entityStr = Object.entries(extractedEntities).map(([k, v]) => `${k}="${v}"`).join(', ');
            // Find the top PWD result to highlight the answer explicitly
            const topPwd = deduped.find(r => r.sourceType === 'pwd_contact');
            const pwdPhone = (topPwd?.metadata as any)?.phone;
            const pwdName = (topPwd?.metadata as any)?.name ?? topPwd?.chunkText.split('.')[0];
            const answerHint = topPwd
              ? ` The answer is: ${pwdName}, Phone: ${pwdPhone}.`
              : '';
            findings.push(`[CROSS-REFERENCE]: The system identified ${entityStr} from contract data and used it to find the relevant personnel.${answerHint} The personnel results below are specifically for this jurisdiction.`);
          }

          findings.push(...deduped.map(r => r.chunkText));

          return {
            agentId: 'admin',
            status: 'completed',
            confidence,
            findings,
            citations: deduped.map((r, i) => ({
              sourceId: `${r.sourceType}-${i}`,
              label: buildCitationLabel(r, i),
              url: (r.metadata as any)?.source_url ?? getDefaultSourceUrl(r.sourceType),
              trustLevel: getTrustLevel(r.sourceType),
            })),
            metadata: {
              planSteps: plan.steps.length,
              crossReferenced: plan.steps.some(s => s.dependsOn?.length),
              extractedEntities,
              topSimilarity,
              reasoning: plan.reasoning,
              reasoningTrace: [
                `Planning retrieval strategy (${plan.steps.length} steps)`,
                ...plan.steps.map(s => s.dependsOn?.length
                  ? `Cross-referencing: ${s.tool}(${Object.values(s.injectFrom ?? {}).join(', ')})`
                  : `Searching ${s.tool.replace('search', '')} for "${s.query.slice(0, 40)}"`
                ),
                ...(Object.keys(extractedEntities).length > 0
                  ? [`Extracted: ${Object.entries(extractedEntities).map(([k,v]) => `${k}="${v}"`).join(', ')}`]
                  : []),
              ],
            },
            latencyMs: Date.now() - start,
          };
        } catch {
          // ─── Fallback: single-shot searchUnified (existing behavior) ─
          const { searchUnified, getTrustLevel: getTrust, lastSearchMode } = await import('../../tools/search-unified');
          const rawResults = await searchUnified(text, 8);

          const degradedNotice = lastSearchMode === 'fts5-fallback'
            ? '⚠️ Primary database (pgvector) is currently unreachable. Results are from local fallback index.'
            : null;

          const results = rawResults.filter(r => r.similarity >= 0.4);

          if (results.length === 0) {
            return {
              agentId: 'admin',
              status: 'completed',
              confidence: 0.1,
              findings: ['No relevant data found in VIGIA index for this query.'],
              citations: [],
              latencyMs: Date.now() - start,
            };
          }

          const topSimilarity = results[0].similarity;
          const findings = results.map(r => r.chunkText);
          if (degradedNotice) findings.unshift(degradedNotice);

          return {
            agentId: 'admin',
            status: 'completed',
            confidence: topSimilarity > 0.8 ? 0.9 : topSimilarity > 0.6 ? 0.7 : topSimilarity > 0.5 ? 0.5 : 0.2,
            findings,
            citations: results.map((r, i) => ({
              sourceId: `${r.sourceType}-${i}`,
              label: buildCitationLabel(r, i),
              url: (r.metadata as any)?.source_url ?? getDefaultSourceUrl(r.sourceType),
              trustLevel: getTrust(r.sourceType),
            })),
            metadata: { resultCount: results.length, topSimilarity, fallback: true },
            latencyMs: Date.now() - start,
          };
        }
      }
    }
  } catch (err: unknown) {
    return {
      agentId: 'admin',
      status: 'error',
      confidence: 0,
      findings: [],
      citations: [],
      errorReason: err instanceof Error ? err.message : 'Admin agent failed',
      latencyMs: Date.now() - start,
    };
  }
}
