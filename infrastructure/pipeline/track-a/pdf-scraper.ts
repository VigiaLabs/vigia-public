/**
 * Lambda: pdf-scraper
 * Track A, Step 1 — Downloads PDFs from CPPP/NHAI/MoRTH, deduplicates via SHA-256,
 * and stores new documents in S3. S3 PutObject event triggers pdf-parser.
 *
 * Runtime: Node.js 22.x | Memory: 512 MB | Timeout: 5 min
 * Trigger: EventBridge CRON (daily 02:00 UTC)
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'crypto';
import { config, PDF_SOURCES } from '../shared/config';
import type { PipelineEvent, ScraperResult, DocumentHash } from '../shared/types';

const s3 = new S3Client({});
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function handler(event: PipelineEvent): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];

  for (const source of PDF_SOURCES) {
    const result: ScraperResult = {
      source: source.id,
      newDocuments: 0,
      skippedDuplicates: 0,
      errors: [],
    };

    try {
      const urls = await resolvePdfUrls(source);

      for (const url of urls) {
        try {
          const pdfBuffer = await downloadPdf(url);
          if (!pdfBuffer) {
            result.errors.push(`Failed to download: ${url}`);
            continue;
          }

          const sha256 = createHash('sha256').update(pdfBuffer).digest('hex');

          // Idempotency check against DynamoDB
          const existing = await dynamo.send(new GetCommand({
            TableName: config.hashTable,
            Key: { sha256, source: source.id },
          }));

          if (existing.Item) {
            result.skippedDuplicates++;
            continue;
          }

          // New document — store in S3
          const date = new Date().toISOString().split('T')[0];
          const s3Key = `${source.id}/${date}/${sha256}.pdf`;

          if (!event.dryRun) {
            await s3.send(new PutObjectCommand({
              Bucket: config.rawBucket,
              Key: s3Key,
              Body: pdfBuffer,
              ContentType: 'application/pdf',
              Metadata: {
                source: source.id,
                sourceUrl: url,
                sha256,
              },
            }));

            // Record hash for idempotency
            const hashRecord: DocumentHash = {
              sha256,
              source: source.id,
              ingestedAt: Date.now(),
              s3Key,
            };
            await dynamo.send(new PutCommand({
              TableName: config.hashTable,
              Item: hashRecord,
            }));
          }

          result.newDocuments++;
        } catch (err) {
          result.errors.push(`${url}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    } catch (err) {
      result.errors.push(`Source ${source.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    results.push(result);
  }

  console.log('Scraper results:', JSON.stringify(results, null, 2));
  return results;
}

/** Resolve actual PDF URLs from a source config */
async function resolvePdfUrls(source: typeof PDF_SOURCES[number]): Promise<string[]> {
  if ('url' in source && source.url) {
    return [source.url];
  }
  return [];
}

/** Download a PDF with timeout and size limit (50MB max) */
async function downloadPdf(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VIGIA-Pipeline/1.0' },
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) return null;

    const contentLength = parseInt(res.headers.get('content-length') ?? '0');
    if (contentLength > 50 * 1024 * 1024) return null; // Skip files > 50MB

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}
