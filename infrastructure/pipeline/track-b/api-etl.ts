/**
 * Lambda: api-etl
 * Track B, Step 1 — Ingests structured JSON/CSV data from Data.gov.in,
 * NHAI dashboard, and PMGSY OMMAS. Outputs normalized JSONL to S3.
 *
 * Runtime: Node.js 22.x | Memory: 256 MB | Timeout: 3 min
 * Trigger: EventBridge CRON (daily 03:00 UTC)
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config, API_SOURCES, INDIAN_STATES } from '../shared/config';
import type { NormalizedProjectRecord, ETLResult } from '../shared/types';

const s3 = new S3Client({});

export async function handler(): Promise<ETLResult[]> {
  const results: ETLResult[] = [];
  const date = new Date().toISOString().split('T')[0];

  for (const source of API_SOURCES) {
    const result: ETLResult = { source: source.id, recordsIngested: 0, errors: [] };

    try {
      let records: NormalizedProjectRecord[] = [];

      switch (source.id) {
        case 'data-gov-roads':
          records = await fetchDataGovIn();
          break;
        case 'nhai-projects':
          records = await fetchNhaiProjects();
          break;
        case 'pmgsy-ommas':
          records = await fetchPmgsyData();
          break;
      }

      if (records.length > 0) {
        // Write JSONL to S3
        const jsonl = records.map(r => JSON.stringify(r)).join('\n');
        await s3.send(new PutObjectCommand({
          Bucket: config.structuredBucket,
          Key: `${source.id}/${date}.jsonl`,
          Body: jsonl,
          ContentType: 'application/x-ndjson',
        }));
        result.recordsIngested = records.length;
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : 'Unknown error');
    }

    results.push(result);
  }

  console.log('ETL results:', JSON.stringify(results, null, 2));
  return results;
}

/** Fetch from Data.gov.in Bharatmala Pariyojana dataset */
async function fetchDataGovIn(): Promise<NormalizedProjectRecord[]> {
  const apiKey = process.env.DATA_GOV_API_KEY;
  if (!apiKey) {
    console.warn('DATA_GOV_API_KEY not set — skipping Data.gov.in');
    return [];
  }

  // Data.gov.in API for road project data
  const url = `https://api.data.gov.in/resource/9d2dee25-79a6-4f13-a6c0-e5e4a0a0d742?api-key=${apiKey}&format=json&limit=500&filters[sector]=Road Transport`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'VIGIA-Pipeline/1.0' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Data.gov.in API returned ${res.status}`);
  }

  const data = await res.json() as { records?: Array<Record<string, string>> };
  if (!data.records?.length) return [];

  return data.records.map((r): NormalizedProjectRecord => ({
    roadNumber: normalizeRoadNumber(r.road_number ?? r.nh_no ?? ''),
    projectName: r.project_name ?? r.name_of_work ?? '',
    concessionaire: r.concessionaire ?? r.contractor ?? '',
    contractMode: normalizeContractMode(r.mode ?? r.contract_mode ?? ''),
    sanctionedAmountCrore: parseFloat(r.sanctioned_cost ?? r.estimated_cost ?? '') || null,
    expenditureAmountCrore: parseFloat(r.expenditure ?? r.amount_spent ?? '') || null,
    awardDate: r.award_date ?? r.date_of_award ?? null,
    completionDate: r.completion_date ?? r.scheduled_completion ?? null,
    state: r.state ?? '',
    districtsCovered: (r.districts ?? '').split(',').map(d => d.trim()).filter(Boolean),
    lengthKm: parseFloat(r.length_km ?? r.total_length ?? '') || null,
    sourceUrl: 'https://data.gov.in/resource/9d2dee25-79a6-4f13-a6c0-e5e4a0a0d742',
    ingestedAt: new Date().toISOString(),
  }));
}

/** Fetch NHAI project data from public PDF (parsed as structured data) */
async function fetchNhaiProjects(): Promise<NormalizedProjectRecord[]> {
  // NHAI doesn't have a JSON API — we download the PDF and extract tabular data.
  const pdfUrl = 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_22_23_0.pdf';

  try {
    const res = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'VIGIA-Pipeline/1.0' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return [];

    const buffer = Buffer.from(await res.arrayBuffer());
    // Extract text from PDF stream objects (lightweight, no pdf-parse dependency)
    const text = extractTextFromPdfBuffer(buffer);
    if (!text) return [];

    return parseNhaiPdfText(text);
  } catch (err) {
    console.error('NHAI PDF fetch failed:', err);
    return [];
  }
}

/** Lightweight PDF text extraction from raw buffer (stream object decoding) */
function extractTextFromPdfBuffer(buffer: Buffer): string {
  // Extract readable ASCII strings from the PDF binary (covers uncompressed text streams)
  const raw = buffer.toString('latin1');
  const textChunks: string[] = [];

  // Match BT...ET text blocks (PDF text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(raw)) !== null) {
    // Extract text from Tj and TJ operators
    const block = match[1];
    const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g);
    if (tjMatches) {
      for (const tj of tjMatches) {
        const text = tj.match(/\(([^)]*)\)/)?.[1];
        if (text) textChunks.push(text);
      }
    }
  }

  // Fallback: extract any readable lines with NH patterns
  if (textChunks.length === 0) {
    const lines = raw.split('\n').filter(l => /NH[-\s]?\d+/i.test(l) && l.length < 500);
    textChunks.push(...lines);
  }

  return textChunks.join('\n');
}

/** Parse NHAI PDF tabular text into structured records */
function parseNhaiPdfText(text: string): NormalizedProjectRecord[] {
  const records: NormalizedProjectRecord[] = [];
  const lines = text.split('\n').filter(l => l.trim().length > 20);

  for (const line of lines) {
    const nhMatch = line.match(/\b(NH[-\s]?\d+[A-Z]?)\b/i);
    if (!nhMatch) continue;

    const roadNumber = nhMatch[1].replace(/\s/g, '-').toUpperCase();
    const mode = extractMode(line);
    const concessionaire = extractConcessionaireFromLine(line);
    const state = extractStateFromLine(line);
    const length = extractLength(line);

    records.push({
      roadNumber,
      projectName: line.slice(0, 100).trim(),
      concessionaire,
      contractMode: mode,
      sanctionedAmountCrore: null,
      expenditureAmountCrore: null,
      awardDate: extractDate(line),
      completionDate: null,
      state,
      districtsCovered: [],
      lengthKm: length,
      sourceUrl: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_22_23_0.pdf',
      ingestedAt: new Date().toISOString(),
    });
  }

  return records;
}

/** Fetch PMGSY OMMAS rural road data */
async function fetchPmgsyData(): Promise<NormalizedProjectRecord[]> {
  try {
    const res = await fetch('https://omms.nic.in/Home/GetStateWiseAbstractData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'VIGIA-Pipeline/1.0',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return [];

    const data = await res.json() as Array<Record<string, string | number>>;
    if (!Array.isArray(data)) return [];

    return data.map((r): NormalizedProjectRecord => ({
      roadNumber: `PMGSY-${r.state_code ?? ''}`,
      projectName: `PMGSY ${r.state_name ?? ''} Rural Roads`,
      concessionaire: 'State Rural Roads Agency',
      contractMode: 'EPC',
      sanctionedAmountCrore: typeof r.sanctioned_cost === 'number' ? r.sanctioned_cost : null,
      expenditureAmountCrore: typeof r.expenditure === 'number' ? r.expenditure : null,
      awardDate: null,
      completionDate: null,
      state: String(r.state_name ?? ''),
      districtsCovered: [],
      lengthKm: typeof r.total_length === 'number' ? r.total_length : null,
      sourceUrl: 'https://omms.nic.in',
      ingestedAt: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function normalizeRoadNumber(raw: string): string {
  const cleaned = raw.replace(/\s+/g, '-').toUpperCase();
  if (/^NH/.test(cleaned)) return cleaned;
  if (/^SH/.test(cleaned)) return cleaned;
  if (/^\d+$/.test(cleaned)) return `NH-${cleaned}`;
  return cleaned || 'UNKNOWN';
}

function normalizeContractMode(raw: string): NormalizedProjectRecord['contractMode'] {
  const upper = raw.toUpperCase();
  if (upper.includes('HAM')) return 'HAM';
  if (upper.includes('EPC')) return 'EPC';
  if (upper.includes('BOT')) return 'BOT';
  if (upper.includes('DBFOT')) return 'DBFOT';
  return 'Unknown';
}

function extractMode(text: string): NormalizedProjectRecord['contractMode'] {
  if (/\bHAM\b/.test(text)) return 'HAM';
  if (/\bEPC\b/.test(text)) return 'EPC';
  if (/\bBOT\b/.test(text)) return 'BOT';
  if (/\bDBFOT\b/.test(text)) return 'DBFOT';
  return 'EPC';
}

function extractConcessionaireFromLine(text: string): string {
  const match = text.match(/([A-Z][a-zA-Z\s]+(?:Pvt\.?\s*Ltd\.?|Limited|JV|LLP))/);
  return match ? match[1].trim() : 'Not available';
}

function extractStateFromLine(text: string): string {
  for (const state of INDIAN_STATES) {
    if (text.includes(state)) return state;
  }
  return 'Unknown';
}

function extractLength(text: string): number | null {
  const match = text.match(/(\d+\.?\d*)\s*[Kk][Mm]/);
  return match ? parseFloat(match[1]) : null;
}

function extractDate(text: string): string | null {
  const match = text.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}
