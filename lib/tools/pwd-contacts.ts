'use server';

import { existsSync } from 'fs';
import { join } from 'path';

export interface PwdContact {
  name: string;
  designation: string;
  division: string;
  state: string;
  phone: string;
  email: string;
  office_address: string;
  source_url: string;
}

export async function queryPwdContacts(roadNumber: string, state: string, queryText?: string): Promise<PwdContact[]> {
  try {
    const Database = (await import('better-sqlite3') as any).default ?? (await import('better-sqlite3'));
    const dbPath = join(process.cwd(), 'data', 'nhai_mock.db');
    if (!existsSync(dbPath)) return [];

    const db = new Database(dbPath, { readonly: true });

    // Check if pwd_contacts table exists
    const tableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='pwd_contacts'`
    ).get();
    if (!tableExists) { db.close(); return []; }

    // Build search terms — try multiple strategies
    const terms: string[] = [];
    if (state && state !== 'Unknown') terms.push(state);
    if (queryText) {
      // Extract city/district names from query text
      const cities = queryText.match(/\b(Khammam|Warangal|Adilabad|Hyderabad|Pune|Mumbai|Nagpur|Kolhapur|Satara|Solapur|Nashik|Aurangabad|Siddipet|Medchal|Nirmal|Kothagudem|Sangareddy|Peddapalli|Wanaparthy|Vikarabad|Gajwel)\b/i);
      if (cities) terms.push(cities[1]);
    }
    // Fallback: use state from road number prefix
    if (!terms.length && roadNumber) {
      terms.push(roadNumber.replace(/[-]/g, ' '));
    }

    if (!terms.length) { db.close(); return []; }

    const ftsQuery = terms.join(' OR ');
    const rows = db.prepare(
      `SELECT name, designation, division, state, phone, email, office_address, source_url
       FROM pwd_contacts WHERE pwd_contacts MATCH ? ORDER BY rank LIMIT 5`
    ).all(ftsQuery) as PwdContact[];

    db.close();
    return rows.filter(r => r.name && r.name.trim().length > 0);
  } catch {
    return [];
  }
}
