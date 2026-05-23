import { generateObject } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { z } from 'zod';
import type { NormalizedEvidence, Payload, VigiaState } from '../state';
import { getRoadInfoByCoordinates } from '../../tools/gati-shakti';
import { getRTIAuthority } from '../../tools/rti-lookup';
import { getComplaintAuthority } from '../../tools/complaint-routing';
import { resolveCountry, queryInternational } from '../../tools/global-engine';

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
        // Unified semantic search across all data (pgvector → FTS5 fallback)
        const { searchUnified, getSourceLabel, getTrustLevel } = await import('../../tools/search-unified');
        const results = await searchUnified(text, 8);

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

        // Cross-validation: if a road number was extracted, verify geographic consistency
        const findings = results.map(r => r.chunkText);
        let crossValidationWarning = '';

        if (roadNumber) {
          // Hard check: does the road number actually appear in ANY retrieved chunk?
          const roadInEvidence = results.some(r =>
            r.chunkText.toLowerCase().includes(roadNumber!.toLowerCase().replace('-', '')) ||
            r.chunkText.toLowerCase().includes(roadNumber!.toLowerCase())
          );

          if (!roadInEvidence) {
            // Road number NOT in any chunk — this is a retrieval miss, not a match
            return {
              agentId: 'admin',
              status: 'completed',
              confidence: 0.1,
              findings: [
                `The VIGIA index does not currently contain specific data for ${roadNumber}. This road has not yet been ingested into our database.`,
                `To get data for ${roadNumber} indexed, the road's contract PDFs need to be added to the Track A ingestion pipeline.`,
              ],
              citations: [],
              metadata: { roadNumber, reason: 'road-not-in-evidence' },
              latencyMs: Date.now() - start,
            };
          }

          // Geographic cross-validation for low-similarity results
          if (topSimilarity < 0.65) {
            const { getStatesForRoad } = await import('../../tools/gati-shakti');
            const roadStates = await getStatesForRoad(roadNumber);

            if (roadStates.length > 0) {
              const resultStates = results.map(r => r.state).filter(Boolean) as string[];
              const hasMatch = resultStates.some(rs => roadStates.some(roadSt => roadSt.toLowerCase().includes(rs.toLowerCase()) || rs.toLowerCase().includes(roadSt.toLowerCase())));

              if (!hasMatch) {
                crossValidationWarning = `⚠️ GEOGRAPHIC MISMATCH: ${roadNumber} passes through [${roadStates.join(', ')}] according to OpenStreetMap. The retrieved evidence is about [${[...new Set(resultStates)].join(', ')}], which does NOT match. The data below is likely NOT relevant to ${roadNumber}.`;
                findings.unshift(crossValidationWarning);
              }
            }
          }
        }

        if (!crossValidationWarning && topSimilarity < 0.55) {
          findings.unshift(`⚠️ LOW RELEVANCE WARNING: The retrieved evidence has low similarity (${topSimilarity.toFixed(2)}) to the query. The data below may NOT be about the specific road/project the user asked about. Verify relevance before presenting as an answer.`);
        }

        return {
          agentId: 'admin',
          status: 'completed',
          confidence: topSimilarity > 0.8 ? 0.9 : topSimilarity > 0.6 ? 0.7 : topSimilarity > 0.5 ? 0.5 : 0.2,
          findings,
          citations: results.map((r, i) => ({
            sourceId: `${r.sourceType}-${i}`,
            label: getSourceLabel(r.sourceType),
            url: (r.metadata as any)?.source_url ?? undefined,
            trustLevel: getTrustLevel(r.sourceType),
          })),
          metadata: { resultCount: results.length, topSimilarity },
          latencyMs: Date.now() - start,
        };
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
