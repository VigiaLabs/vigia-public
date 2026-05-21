import { generateObject } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { z } from 'zod';
import type { NormalizedEvidence, Payload, VigiaState } from '../state';
import { searchTenderByRoadNumber } from '../../tools/tender-search';
import { getRoadInfoByCoordinates } from '../../tools/gati-shakti';
import { getRTIAuthority } from '../../tools/rti-lookup';
import { getComplaintAuthority } from '../../tools/complaint-routing';
import { getCurrentRoadCondition, getExecutiveEngineer, getHistoricalCondition } from '../../tools/mock-data';
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

      case 'condition': {
        const rn = roadNumber ?? 'Unknown';
        const condition = await getCurrentRoadCondition(rn);
        const history = await getHistoricalCondition(rn);
        const isMock = condition.source === 'MOCK';
        return {
          agentId: 'admin',
          status: 'completed',
          confidence: isMock ? 0.3 : 0.8,
          severity: condition.conditionScore <= 4 ? 'severe' : condition.conditionScore <= 6 ? 'moderate' : 'minor',
          findings: [
            `Road condition: ${condition.conditionLabel} (score: ${condition.conditionScore}/10)`,
            `Last inspected: ${condition.lastInspected}`,
            ...condition.hazards.map((h) => `Hazard: ${h}`),
            `Historical trend: ${history.records.map((r) => `${r.date}: ${r.conditionScore}/10`).join(', ')}`,
          ],
          citations: [{ sourceId: 'road-condition', label: `${condition.source} Data`, trustLevel: 'verified-spatial' }],
          metadata: { ...condition, isMock },
          latencyMs: Date.now() - start,
        };
      }

      case 'personnel': {
        const rn = roadNumber ?? 'Unknown';
        const st = state ?? 'Unknown';
        const ee = await getExecutiveEngineer(rn, st);
        const isMock = ee.source === 'MOCK';
        return {
          agentId: 'admin',
          status: 'completed',
          confidence: isMock ? 0.2 : 0.8,
          findings: [
            `Designation: ${ee.designation}`,
            `Division: ${ee.division}`,
            ee.name !== 'Data not publicly available' ? `Name: ${ee.name}` : 'Name: Not publicly available (file RTI to obtain)',
            ee.phone ? `Phone: ${ee.phone}` : 'Phone: Not publicly available',
            `Office: ${ee.officeAddress}`,
          ],
          citations: [{ sourceId: 'personnel-data', label: ee.source, trustLevel: 'official-portal' }],
          metadata: { ...ee, isMock },
          latencyMs: Date.now() - start,
        };
      }

      case 'tender_search':
      default: {
        if (!roadNumber) {
          return {
            agentId: 'admin',
            status: 'completed',
            confidence: 0.3,
            findings: ['No specific road number identified. Please mention a road like NH-44 or SH-15.'],
            citations: [],
            latencyMs: Date.now() - start,
          };
        }

        const tenders = await searchTenderByRoadNumber(roadNumber);
        const noMatch = !tenders.length || tenders[0].projectName.includes('not found');

        if (noMatch) {
          return {
            agentId: 'admin',
            status: 'completed',
            confidence: 0.5,
            findings: [`No contract records found for ${roadNumber} in indexed NHAI data.`],
            citations: [{ sourceId: 'nhai-search', label: 'NHAI Public Data', url: 'https://nhai.gov.in', trustLevel: 'legally-binding' }],
            latencyMs: Date.now() - start,
          };
        }

        return {
          agentId: 'admin',
          status: 'completed',
          confidence: 0.9,
          findings: tenders.map((t) => `${t.roadNumber}: "${t.projectName}" by ${t.concessionaire} (${t.mode}), ${t.state}`),
          citations: tenders.map((t, i) => ({
            sourceId: `nhai-${t.roadNumber}-${i}`,
            label: t.source,
            url: t.sourceUrl,
            trustLevel: 'legally-binding' as const,
          })),
          metadata: { roadNumber, resultCount: tenders.length },
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
