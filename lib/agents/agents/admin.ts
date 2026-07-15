import { generateObject } from 'ai';
import { bedrock } from '@/lib/agents/bedrock-provider';
import { z } from 'zod';
import type { NormalizedEvidence, Payload, VigiaState } from '../state';
import { getRoadInfoByCoordinates } from '../../tools/gati-shakti';
import { getRTIAuthority } from '../../tools/rti-lookup';
import { getComplaintAuthority } from '../../tools/complaint-routing';
import { resolveCountry, queryInternational } from '../../tools/global-engine';
import { detectForeignCountry } from '../../tools/geo-resolve';
import { getEmargSnapshotMetadata, parseEmargDate, queryEmargRoads } from '../../tools/emarg';
import type { UnifiedResult } from '../../tools/search-unified';

const DEFAULT_SOURCE_URLS: Record<string, string> = {
  nhai_contract: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_22_23_0.pdf',
  pmgsy_road: 'https://omms.nic.in',
  pwd_contact: 'https://tg-roadcutting.cgg.gov.in/ContactUs',
  authority: 'https://pgportal.gov.in',
};

function getDefaultSourceUrl(sourceType: string): string {
  return DEFAULT_SOURCE_URLS[sourceType] ?? 'https://nhai.gov.in';
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function metadataPositiveInteger(
  metadata: Record<string, unknown> | null | undefined,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = metadata?.[key];
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function metadataNonnegativeInteger(
  metadata: Record<string, unknown> | null | undefined,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = metadata?.[key];
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function buildCitationProvenance(result: UnifiedResult) {
  const metadata = result.metadata;
  return {
    documentTitle: metadataString(metadata, 'document_title') ?? metadataString(metadata, 'documentTitle'),
    excerpt: result.chunkText,
    sourceLocator: metadataString(metadata, 'source_locator') ?? metadataString(metadata, 'sourceLocator') ?? metadataString(metadata, 'locator'),
    pageNumber: metadataPositiveInteger(metadata, 'page_number', 'pageNumber', 'page'),
    paragraphNumber: metadataPositiveInteger(metadata, 'paragraph_number', 'paragraphNumber', 'paragraph'),
    sectionTitle: metadataString(metadata, 'section_title') ?? metadataString(metadata, 'sectionTitle'),
    chunkIndex: metadataNonnegativeInteger(metadata, 'chunk_index', 'chunkIndex'),
  };
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

/**
 * Builds evidence for a non-India query via the international engine (World Bank + OCDS).
 * Shared by the GPS-based path and the text-based (typed country) path so both behave
 * identically. Personnel queries hard-abort with a jurisdiction notice.
 */
async function buildInternationalEvidence(
  countryCode: string,
  countryName: string,
  text: string,
  intent: VigiaState['intent'] | undefined,
  start: number,
): Promise<NormalizedEvidence> {
  if (intent === 'personnel') {
    return {
      agentId: 'admin',
      status: 'completed',
      confidence: 0.95,
      findings: [
        `Location resolves to ${countryName} (${countryCode}), outside Indian jurisdiction.`,
        `VIGIA personnel directories are restricted to Indian infrastructure authorities (NHAI, State PWD, PMGSY).`,
        `For ${countryName} road authority contacts, consult your national transport ministry.`,
      ],
      citations: [],
      metadata: { countryCode, reason: 'out-of-jurisdiction' },
      latencyMs: Date.now() - start,
    };
  }

  const intlData = await queryInternational(countryCode, countryName, text);
  const findings: string[] = [`Country: ${countryName} (${countryCode})`];
  const retrievedAt = new Date().toISOString();
  const claims: NonNullable<NormalizedEvidence['claims']> = [];

  for (const wb of intlData.worldBankResults.slice(0, 3)) {
    findings.push(`Project: ${wb.projectName} (${wb.status})`);
    findings.push(`  Implementing agency: ${wb.implementingAgency}, World Bank project financing: USD ${wb.totalAmount.toLocaleString()}`);
    claims.push({
      category: 'international-project',
      status: 'verified',
      subject: wb.projectId,
      predicate: 'project-name',
      value: wb.projectName,
      sourceId: `worldbank-${wb.projectId}`,
      sourceQuote: wb.projectName,
      sourceLocator: 'projects[projectId].project_name',
      retrievedAt,
    });
    claims.push({
      category: 'financial',
      status: 'verified',
      subject: wb.projectId,
      predicate: 'project-financing',
      value: wb.totalAmount,
      unit: wb.currency,
      financialType: 'project-financing',
      sourceId: `worldbank-${wb.projectId}`,
      sourceQuote: wb.totalAmountRaw,
      sourceLocator: 'projects[projectId].totalamt',
      retrievedAt,
    });
  }
  for (const ocds of intlData.ocdsResults.slice(0, 3)) {
    findings.push(`Contract: ${ocds.title}`);
    findings.push(`  Procuring entity: ${ocds.procuringEntity}${ocds.valueAmount !== null && ocds.valueType ? `, ${ocds.valueType}: ${ocds.valueCurrency ?? ''} ${ocds.valueAmount.toLocaleString()}` : ''}`);
    claims.push({
      category: 'international-project',
      status: 'verified',
      subject: ocds.ocid,
      predicate: 'tender-title',
      value: ocds.title,
      sourceId: `ocds-${ocds.ocid}`,
      sourceQuote: ocds.title,
      sourceLocator: 'tender.title',
      retrievedAt,
    });
    if (ocds.valueAmount !== null && ocds.valueType && ocds.valueSourceField) {
      claims.push({
        category: 'financial',
        status: 'verified',
        subject: ocds.ocid,
        predicate: ocds.valueType,
        value: ocds.valueAmount,
        unit: ocds.valueCurrency ?? undefined,
        financialType: ocds.valueType === 'tender-estimate' ? 'estimate' : ocds.valueType,
        sourceId: `ocds-${ocds.ocid}`,
        sourceQuote: String(ocds.valueAmount),
        sourceLocator: ocds.valueSourceField,
        retrievedAt,
      });
    }
  }

  if (findings.length === 1) {
    findings.push(`No infrastructure project data found for ${countryName} in the OCDS or World Bank sources. OpenStreetMap road geometry is still available for this region.`);
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
    claims,
    metadata: { countryCode, dataQualityTier: intlData.dataQualityTier, source: 'global-engine' },
    latencyMs: Date.now() - start,
  };
}

async function buildEmargEvidence(text: string, start: number): Promise<NormalizedEvidence | null> {
  if (!/\b(pmgsy|emarg|rural road|maintenance expenditure|maintenance contractor)\b/i.test(text)) return null;
  const roads = await queryEmargRoads(text, 5);
  if (roads.length === 0) return null;

  const snapshotMetadata = getEmargSnapshotMetadata();
  const claims: NonNullable<NormalizedEvidence['claims']> = [];
  const findings: string[] = [];

  for (const road of roads) {
    const sourceId = `emarg-road-${road.roadDetailsId}`;
    findings.push(`PMGSY road: ${road.roadName}`);
    findings.push(`  Jurisdiction: ${road.blockName}, ${road.districtName}, ${road.stateName}; package: ${road.packageNumber ?? 'not published'}`);
    if (road.contractorName) findings.push(`  Maintenance contractor: ${road.contractorName}`);
    if (road.consolidatedGrossExpenditureInr !== null) {
      findings.push(`  Maintenance expenditure shown by eMARG: INR ${road.consolidatedGrossExpenditureInr.toLocaleString()}`);
    }
    if (road.maintenanceStartDateRaw) {
      findings.push(`  Maintenance contract start date: ${road.maintenanceStartDateRaw} (not a physical relaying date)`);
    }

    claims.push({
      category: 'road-type',
      status: 'verified',
      subject: String(road.roadDetailsId),
      predicate: 'road-type',
      value: 'rural',
      sourceId,
      sourceQuote: road.roadName,
      sourceLocator: 'road_name',
      retrievedAt: snapshotMetadata.fetchedAt,
    });
    if (road.contractorName) {
      claims.push({
        category: 'contract-role',
        status: 'verified',
        subject: String(road.roadDetailsId),
        predicate: 'maintenance-contractor',
        value: road.contractorName,
        role: 'maintenance-contractor',
        sourceId,
        sourceQuote: road.contractorName,
        sourceLocator: 'contractorName',
        retrievedAt: snapshotMetadata.fetchedAt,
      });
    }
    if (road.consolidatedGrossExpenditureInr !== null) {
      claims.push({
        category: 'financial',
        status: 'verified',
        subject: String(road.roadDetailsId),
        predicate: 'maintenance-expenditure',
        value: road.consolidatedGrossExpenditureInr,
        unit: 'INR',
        financialType: 'expenditure',
        sourceId,
        sourceQuote: String(road.consolidatedGrossExpenditureInr),
        sourceLocator: 'consolidatedGrossExpenditure',
        retrievedAt: snapshotMetadata.fetchedAt,
      });
    }
    const maintenanceStart = parseEmargDate(road.maintenanceStartDateRaw);
    if (maintenanceStart) {
      claims.push({
        category: 'maintenance',
        status: 'verified',
        subject: String(road.roadDetailsId),
        predicate: 'maintenance-contract-start',
        value: road.maintenanceStartDateRaw ?? undefined,
        maintenanceType: 'om-commencement',
        dateKind: 'actual',
        observedAt: maintenanceStart,
        sourceId,
        sourceQuote: road.maintenanceStartDateRaw ?? '',
        sourceLocator: 'strMaintenanceStartDate',
        retrievedAt: snapshotMetadata.fetchedAt,
      });
    }
  }

  return {
    agentId: 'admin',
    status: 'completed',
    confidence: 0.9,
    findings,
    citations: roads.map((road) => ({
      sourceId: `emarg-road-${road.roadDetailsId}`,
      label: `eMARG Know Your Road — ${road.connectionCode ?? road.roadDetailsId}`,
      url: road.sourceUrl,
      trustLevel: 'official-portal',
    })),
    claims,
    metadata: { ...snapshotMetadata, source: 'emarg-public-road-detail' },
    latencyMs: Date.now() - start,
  };
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

  // ─── P0: Personnel queries proceed directly to search ────────────
  // Geographic context is handled by the retrieval layer (pgvector similarity)
  // and by the LLM which can see the user's location from GPS or text.
  // No hard gate needed — low-relevance results will naturally score low confidence.

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
    // (a) GPS-based: authoritative when the device shares coordinates.
    if (payload.gps) {
      const country = await resolveCountry(payload.gps.lat, payload.gps.lng);
      if (!country.isIndia) {
        return buildInternationalEvidence(country.countryCode, country.countryName, text, intent, start);
      }
    } else {
      // (b) Text-based: no GPS, but the user named a foreign country/city in the query
      // (e.g. "road projects near Nairobi, Kenya"). Route to the international engine so
      // global applicability is demonstrable from the text box, not only via GPS.
      const foreign = detectForeignCountry(text);
      if (foreign) {
        return buildInternationalEvidence(foreign.code, foreign.name, text, intent, start);
      }
    }

    const emargEvidence = await buildEmargEvidence(text, start);
    if (emargEvidence && intent !== 'complaint' && intent !== 'rti' && intent !== 'personnel') {
      return emargEvidence;
    }

    switch (intent) {
      case 'complaint': {
        const result = await getComplaintAuthority(roadType, state);
        const findings = [
          `Complaint authority: ${result.name}`,
          `Jurisdiction: ${result.jurisdiction}`,
          `Portal: ${result.complaintPortal}`,
          result.phone ? `Helpline: ${result.phone}` : null,
          `Escalation: ${result.escalationAuthority}`,
        ].filter(Boolean) as string[];
        const citations: NormalizedEvidence['citations'] = [{
          sourceId: 'complaint-authority',
          label: result.source,
          url: result.sourceUrl,
          trustLevel: 'official-portal',
        }];

        const asksForProjectData = /\b(sanctioned|approved|budget|cost|spent|expenditure|contractor|concessionaire)\b/i.test(text);
        if (asksForProjectData) {
          const { searchUnified, getTrustLevel } = await import('../../tools/search-unified');
          const seenProjectEvidence = new Set<string>();
          const projectResults = (await searchUnified(text, 8)).filter((item) => {
            if (item.sourceType === 'pwd_contact' || item.similarity < 0.4) return false;
            const key = item.chunkText.slice(0, 120);
            if (seenProjectEvidence.has(key)) return false;
            seenProjectEvidence.add(key);
            return true;
          });
          findings.push(...projectResults.map((item) => item.chunkText));
          citations.push(...projectResults.map((item, index) => ({
            sourceId: `${item.sourceType}-${index}`,
            label: buildCitationLabel(item, index),
            url: typeof item.metadata?.source_url === 'string'
              ? item.metadata.source_url
              : getDefaultSourceUrl(item.sourceType),
            trustLevel: getTrustLevel(item.sourceType),
          })));
        }

        return {
          agentId: 'admin',
          status: 'completed',
          confidence: 0.95,
          findings,
          citations,
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

          // Personnel guard: if the user asked for an engineer/officer but the
          // jurisdiction-constrained PWD search returned no matching officer, do NOT
          // present road/contract chunks as if they answered the question. Emit a data
          // void so the guardrail routes to the Authority Matrix fallback (correct portal
          // and helpline) instead of a wrong-jurisdiction or unrelated officer.
          if (intent === 'personnel' && !deduped.some(r => r.sourceType === 'pwd_contact')) {
            return {
              agentId: 'admin',
              status: 'completed',
              confidence: 0.1,
              findings: ['No relevant data found for a specific engineer in this jurisdiction within the VIGIA index.'],
              citations: [],
              metadata: { planSteps: plan.steps.length, personnelAnchorMissing: true },
              latencyMs: Date.now() - start,
            };
          }

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
            const pwdPhone = metadataString(topPwd?.metadata, 'phone');
            const pwdName = metadataString(topPwd?.metadata, 'name') ?? topPwd?.chunkText.split('.')[0];
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
              url: metadataString(r.metadata, 'source_url') ?? getDefaultSourceUrl(r.sourceType),
              trustLevel: getTrustLevel(r.sourceType),
              ...buildCitationProvenance(r),
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
              url: metadataString(r.metadata, 'source_url') ?? getDefaultSourceUrl(r.sourceType),
              trustLevel: getTrust(r.sourceType),
              ...buildCitationProvenance(r),
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
