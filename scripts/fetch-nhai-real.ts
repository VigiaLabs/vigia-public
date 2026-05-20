/**
 * Fetches real NHAI project data from public PDFs and indexes into nhai_mock.db
 * Run: npx tsx scripts/fetch-nhai-real.ts
 * 
 * Sources (all publicly accessible, no auth needed):
 * - NHAI projects under implementation PDF
 * - NHAI awarded projects PDF
 */

import path from 'node:path';
import Database from 'better-sqlite3';
import fs from 'node:fs';

const DB_PATH = path.join(process.cwd(), 'data', 'nhai_mock.db');
const TMP_DIR = path.join(process.cwd(), 'data', 'tmp');

// Real public NHAI PDF URLs
const NHAI_PDFS = [
  {
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/awarded_year_22_23_0.pdf',
    label: 'NHAI Awarded Projects 2022-23',
  },
  {
    url: 'https://nhai.gov.in/nhai/sites/default/files/mix_file/Status_of_Projects_where_Bids.pdf',
    label: 'NHAI Projects Status',
  },
];

interface ParsedSection {
  section_title: string;
  page_number: number;
  content: string;
}

async function downloadPDF(url: string, destPath: string): Promise<boolean> {
  try {
    console.log(`Downloading: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to download ${url}: ${response.status}`);
      return false;
    }
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buffer));
    console.log(`Saved to ${destPath}`);
    return true;
  } catch (error) {
    console.error(`Download error for ${url}:`, error);
    return false;
  }
}

async function extractTextFromPDF(pdfPath: string): Promise<string> {
  try {
    // Use pdf-parse for text extraction
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('PDF parse error:', error);
    return '';
  }
}

function parseNHAIText(text: string, label: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // NHAI PDFs have rows like:
  // "120 Delhi-Amritsar-Katra Expressway NH-152 HAM 37.67 23/05/2022 CDS Infra Projects Limited Haryana"
  // We chunk every 5 lines into a searchable section

  const chunkSize = 5;
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize).join(' ');
    if (chunk.length < 20) continue;

    // Try to extract a meaningful title from the chunk
    const nhMatch = chunk.match(/NH[-\s]?\d+/i);
    const shMatch = chunk.match(/SH[-\s]?\d+/i);
    const roadRef = nhMatch?.[0] || shMatch?.[0] || 'Road Project';

    sections.push({
      section_title: `${label} — ${roadRef} (Row ${Math.floor(i / chunkSize) + 1})`,
      page_number: Math.floor(i / 50) + 1,
      content: chunk,
    });
  }

  return sections;
}

function buildDB(sections: ParsedSection[]) {
  const db = new Database(DB_PATH);

  db.exec('DROP TABLE IF EXISTS nhai_sections');
  db.exec(`
    CREATE VIRTUAL TABLE nhai_sections USING fts5(
      content,
      section_title,
      page_number UNINDEXED
    )
  `);

  const insert = db.prepare(
    'INSERT INTO nhai_sections (content, section_title, page_number) VALUES (?, ?, ?)'
  );

  const tx = db.transaction(() => {
    for (const s of sections) {
      insert.run(s.content, s.section_title, s.page_number);
    }
  });

  tx();
  db.close();
  console.log(`\nIndexed ${sections.length} sections into ${DB_PATH}`);
}

async function main() {
  // Check pdf-parse is installed
  try {
    await import('pdf-parse');
  } catch {
    console.error('Missing dependency. Run: npm install pdf-parse');
    console.error('Then run this script again.');
    process.exit(1);
  }

  // Create tmp dir
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }

  const allSections: ParsedSection[] = [];

  for (const pdf of NHAI_PDFS) {
    const filename = pdf.url.split('/').pop() || 'nhai.pdf';
    const destPath = path.join(TMP_DIR, filename);

    // Skip download if already cached
    if (!fs.existsSync(destPath)) {
      const ok = await downloadPDF(pdf.url, destPath);
      if (!ok) {
        console.warn(`Skipping ${pdf.label} — download failed`);
        continue;
      }
    } else {
      console.log(`Using cached: ${destPath}`);
    }

    console.log(`Extracting text from ${filename}...`);
    const text = await extractTextFromPDF(destPath);

    if (!text) {
      console.warn(`No text extracted from ${filename}`);
      continue;
    }

    const sections = parseNHAIText(text, pdf.label);
    console.log(`Parsed ${sections.length} sections from ${pdf.label}`);
    allSections.push(...sections);
  }

  if (allSections.length === 0) {
    console.error('No sections extracted. Check PDF URLs are accessible from your network.');
    process.exit(1);
  }

  buildDB(allSections);
  console.log('\nDone. Real NHAI data is now indexed.');
  console.log('Run: npm run dev to test.');
}

main();