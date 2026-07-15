/**
 * Push NH-44 structured data into live pgvector via retrieval-proxy Lambda.
 * Run: npx tsx scripts/push-nh44-to-pgvector.ts
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { readFileSync } from 'fs';
import { join } from 'path';

const lambda = new LambdaClient({ region: 'us-east-1' });
const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' });

async function embedText(text: string): Promise<number[]> {
  const res = await bedrock.send(new InvokeModelCommand({
    modelId: 'amazon.titan-embed-text-v2:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({ inputText: text.slice(0, 8000), dimensions: 1024, normalize: true }),
  }));
  return JSON.parse(new TextDecoder().decode(res.body)).embedding;
}

async function initSchema() {
  const payload = { body: JSON.stringify({ action: 'init-unified' }) };
  const res = await lambda.send(new InvokeCommand({
    FunctionName: 'vigia-retrieval-proxy',
    Payload: Buffer.from(JSON.stringify(payload)),
  }));
  const result = JSON.parse(new TextDecoder().decode(res.Payload));
  console.log('Schema init:', JSON.parse(result.body ?? '{}').message ?? result);
}

async function storeChunks(chunks: Array<{ chunkText: string; embedding: number[]; sourceType: string; state: string | null; district: string | null; metadata: Record<string, unknown> }>) {
  const payload = {
    body: JSON.stringify({
      action: 'store',
      chunks: chunks.map(c => ({
        chunkText: c.chunkText,
        embedding: c.embedding,
        sourceType: c.sourceType,
        state: c.state,
        district: c.district,
        metadata: c.metadata,
      })),
    }),
  };
  const res = await lambda.send(new InvokeCommand({
    FunctionName: 'vigia-retrieval-proxy',
    Payload: Buffer.from(JSON.stringify(payload)),
  }));
  const result = JSON.parse(new TextDecoder().decode(res.Payload));
  return result.statusCode === 200;
}

async function main() {
  console.log('Pushing NH-44 data to pgvector...\n');

  // Step 1: Skip schema init (already done by embed-unified)
  // Note: Do NOT call init-unified here as it clears non-NHAI entries (PWD, PMGSY)

  // Step 2: Load NH-44 sections
  const sections = JSON.parse(readFileSync(join(process.cwd(), 'data', 'nh44-sections.json'), 'utf-8'));
  console.log(`Loaded ${sections.length} NH-44 sections`);

  // Step 3: Format and embed each section
  let stored = 0;
  for (let i = 0; i < sections.length; i += 3) {
    const batch = sections.slice(i, i + 3);
    const chunks = await Promise.all(batch.map(async (s: any) => {
      const text = [
        `${s.section_name} (${s.road_number}).`,
        `Road Type: ${s.road_type_classification} (${s.lanes} lanes).`,
        s.state ? `State: ${s.state}.` : null,
        s.concessionaire ? `Contractor: ${s.concessionaire}.` : null,
        s.contract_mode ? `Mode: ${s.contract_mode}.` : null,
        s.sanctioned_cost_crore ? `Sanctioned Cost: ₹${s.sanctioned_cost_crore} Crore.` : null,
        s.tot_concession_award_value_crore ? `TOT Concession Award Value: ₹${s.tot_concession_award_value_crore} Crore.` : null,
        s.expenditure_cost_crore ? `Expenditure: ₹${s.expenditure_cost_crore} Crore.` : null,
        s.last_maintenance_date ? `Last Maintenance/O&M Start: ${s.last_maintenance_date}.` : null,
        `Status: ${s.status}.`,
        s.condition_notes ? s.condition_notes : null,
        s.source ? `Source: ${s.source}.` : null,
      ].filter(Boolean).join(' ');

      const embedding = await embedText(text);
      return {
        chunkText: text,
        embedding,
        sourceType: 'nhai_contract',
        state: s.state?.split('/')[0] ?? null,
        district: null,
        metadata: {
          source_url: s.source_url,
          road_type: s.road_type_classification,
          road_number: s.road_number,
          sanctioned_cost_crore: s.sanctioned_cost_crore,
          tot_concession_award_value_crore: s.tot_concession_award_value_crore,
          financial_type: s.tot_concession_award_value_crore ? 'tot-concession-award' : undefined,
          expenditure_cost_crore: s.expenditure_cost_crore,
          last_maintenance_date: s.last_maintenance_date,
          concessionaire: s.concessionaire,
          section_name: s.section_name,
        },
      };
    }));

    const ok = await storeChunks(chunks);
    if (ok) {
      stored += chunks.length;
      console.log(`  Stored ${stored}/${sections.length}`);
    } else {
      console.error(`  Failed batch at index ${i}`);
    }
  }

  console.log(`\n✓ Pushed ${stored} NH-44 chunks to pgvector`);
  console.log('The engine will now return this data for NH-44 queries.');
}

main().catch(console.error);
