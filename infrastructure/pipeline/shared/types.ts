/**
 * Shared types for the VIGIA Daily Ingestion Pipeline.
 * Used across all Lambda handlers in Track A and Track B.
 */

export interface DocumentHash {
  sha256: string;
  source: string;
  ingestedAt: number;
  s3Key: string;
}

export interface NormalizedProjectRecord {
  roadNumber: string;
  projectName: string;
  concessionaire: string;
  contractMode: 'HAM' | 'EPC' | 'BOT' | 'DBFOT' | 'Unknown';
  sanctionedAmountCrore: number | null;
  expenditureAmountCrore: number | null;
  awardDate: string | null;
  completionDate: string | null;
  state: string;
  districtsCovered: string[];
  lengthKm: number | null;
  sourceUrl: string;
  ingestedAt: string;
}

export interface ParsedSection {
  sectionTitle: string;
  pageNumber: number;
  content: string;
  roadNumber: string | null;
  concessionaire: string | null;
  contractMode: string | null;
  state: string | null;
}

export interface PipelineEvent {
  source: 'scheduled' | 'manual';
  tracks: ('A' | 'B')[];
  dryRun?: boolean;
}

export interface ScraperResult {
  source: string;
  newDocuments: number;
  skippedDuplicates: number;
  errors: string[];
}

export interface ETLResult {
  source: string;
  recordsIngested: number;
  errors: string[];
}
