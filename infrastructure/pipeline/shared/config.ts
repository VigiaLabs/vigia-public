/**
 * Pipeline configuration — source URLs, bucket names, table names.
 * All values read from environment variables with sensible defaults.
 */

export const config = {
  // S3
  rawBucket: process.env.RAW_BUCKET ?? 'vigia-raw-documents',
  structuredBucket: process.env.STRUCTURED_BUCKET ?? 'vigia-structured-data',
  fts5Bucket: process.env.FTS5_BUCKET ?? 'vigia-fts5-db',

  // DynamoDB
  hashTable: process.env.HASH_TABLE ?? 'vigia-document-hashes',

  // RDS pgvector
  pgHost: process.env.PG_HOST ?? '',
  pgPort: parseInt(process.env.PG_PORT ?? '5432'),
  pgDatabase: process.env.PG_DATABASE ?? 'vigia',
  pgUser: process.env.PG_USER ?? 'vigia_pipeline',
  pgSecretArn: process.env.PG_SECRET_ARN ?? '',

  // Bedrock
  embedModel: 'amazon.titan-embed-text-v2:0',
  embedDimensions: 1024,

  // Timeouts
  scraperTimeoutMs: 300_000,  // 5 min
  parserTimeoutMs: 600_000,   // 10 min
  etlTimeoutMs: 180_000,      // 3 min
} as const;

/** Track A: PDF sources to scrape */
export const PDF_SOURCES = [
  // ─── NHAI All-India Project PDFs ──────────────────────────────────
  {
    id: 'nhai-awarded-22-23',
    label: 'NHAI Awarded Projects 2022-23',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_22_23_0.pdf',
    frequency: 'weekly',
  },
  {
    id: 'nhai-bids',
    label: 'NHAI Projects Under Bidding',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/Status_of_Projects_where_Bids.pdf',
    frequency: 'weekly',
  },
  {
    id: 'nhai-awarded-23-24',
    label: 'NHAI Awarded Projects 2023-24',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_23_24.pdf',
    frequency: 'weekly',
  },
  {
    id: 'nhai-awarded-24-25',
    label: 'NHAI Awarded Projects 2024-25',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_24_25.pdf',
    frequency: 'weekly',
  },
  {
    id: 'nhai-under-implementation',
    label: 'NHAI Projects Under Implementation',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/Projects_Under_Implementation.pdf',
    frequency: 'weekly',
  },
  {
    id: 'nhai-completed',
    label: 'NHAI Completed Projects',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/Completed_Projects.pdf',
    frequency: 'monthly',
  },
  {
    id: 'nhai-bharatmala',
    label: 'Bharatmala Pariyojana Status',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/Bharatmala.pdf',
    frequency: 'monthly',
  },
  {
    id: 'nhai-tot-bundles',
    label: 'NHAI TOT Monetization Bundles',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/TOT_Bundles.pdf',
    frequency: 'monthly',
  },
  // ─── MoRTH Annual Reports (state-wise data) ──────────────────────
  {
    id: 'morth-annual-report',
    label: 'MoRTH Annual Report 2023-24',
    url: 'https://morth.nic.in/sites/default/files/Annual_Report_2023_24_English.pdf',
    frequency: 'monthly',
  },
  {
    id: 'morth-road-statistics',
    label: 'MoRTH Basic Road Statistics of India',
    url: 'https://morth.nic.in/sites/default/files/Basic_Road_Statistics_of_India.pdf',
    frequency: 'monthly',
  },
] as const;

/** Track B: Structured API sources */
export const API_SOURCES = [
  {
    id: 'data-gov-roads',
    label: 'Data.gov.in Road Statistics',
    url: 'https://data.gov.in/resource/details-road-projects-awarded-nhai-under-bharatmala-pariyojana',
    format: 'json' as const,
    apiKeyEnv: 'DATA_GOV_API_KEY',
  },
  {
    id: 'nhai-projects',
    label: 'NHAI Project Monitoring',
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_22_23_0.pdf',
    format: 'pdf-table' as const,
    apiKeyEnv: null,
  },
  {
    id: 'pmgsy-ommas',
    label: 'PMGSY OMMAS Rural Roads',
    url: 'https://omms.nic.in/Home/GetStateWiseAbstractData',
    format: 'json' as const,
    apiKeyEnv: null,
  },
] as const;

/** Indian states for extraction */
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal',
] as const;
