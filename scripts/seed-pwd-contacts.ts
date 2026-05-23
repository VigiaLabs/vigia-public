/**
 * scripts/seed-pwd-contacts.ts
 *
 * Seeds the pwd_contacts FTS5 table with verified officer data from:
 * - Telangana R&B: tg-roadcutting.cgg.gov.in/ContactUs
 * - Maharashtra PWD: pwd.maharashtra.gov.in/en/{region}/
 *
 * Run: npx tsx scripts/seed-pwd-contacts.ts
 */

import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'data', 'nhai_mock.db');

interface PwdContact {
  name: string;
  designation: string;
  division: string;
  state: string;
  phone: string | null;
  email: string | null;
  office_address: string | null;
  source_url: string;
}

// ─── Verified Real Data: Telangana R&B Department ───────────────────
// Source: tg-roadcutting.cgg.gov.in/ContactUs (verified 2026-05-23)
const TELANGANA_CONTACTS: PwdContact[] = [
  { name: 'Executive Engineer, Khammam', designation: 'Executive Engineer', division: 'R&B Division, Khammam', state: 'Telangana', phone: '9440818085', email: 'eerb_kmm@yahoo.co.in', office_address: 'R&B Division Office, Khammam', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Executive Engineer, Warangal', designation: 'Executive Engineer', division: 'R&B Division, Warangal', state: 'Telangana', phone: '8333923820', email: 'eerbwglrural@gmail.com', office_address: 'R&B Division Office, Warangal', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Executive Engineer, Adilabad', designation: 'Executive Engineer', division: 'R&B Division, Adilabad', state: 'Telangana', phone: '9492810052', email: 'eerbadilabad@gmail.com', office_address: 'R&B Division Office, Adilabad', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Executive Engineer, Peddapalli', designation: 'Executive Engineer', division: 'R&B Division, Peddapalli', state: 'Telangana', phone: '9440818089', email: 'eerbpdply@gmail.com', office_address: 'R&B Division Office, Peddapalli', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Executive Engineer, Siddipet', designation: 'Executive Engineer', division: 'R&B Division, Siddipet', state: 'Telangana', phone: '9440818096', email: 'eerbsiddipet@gmail.com', office_address: 'R&B Division Office, Siddipet', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Executive Engineer, Kothagudem', designation: 'Executive Engineer', division: 'R&B Division, Kothagudem', state: 'Telangana', phone: '9440818086', email: 'eekothagudem@yahoo.co.in', office_address: 'R&B Division Office, Kothagudem', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Executive Engineer, Sangareddy', designation: 'Executive Engineer', division: 'R&B Division, Sangareddy', state: 'Telangana', phone: '9440818095', email: 'eerbsgd@gmail.com', office_address: 'R&B Division Office, Sangareddy', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Executive Engineer, Medchal', designation: 'Executive Engineer', division: 'R&B Division, Medchal', state: 'Telangana', phone: '9440818104', email: 'ee_crd@yahoo.com', office_address: 'R&B Division Office, Medchal', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Executive Engineer, Wanaparthy', designation: 'Executive Engineer', division: 'R&B Division, Wanaparthy', state: 'Telangana', phone: '9440818101', email: 'eerbwnp777@gmail.com', office_address: 'R&B Division Office, Wanaparthy', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Executive Engineer, Nirmal', designation: 'Executive Engineer', division: 'R&B Division, Nirmal', state: 'Telangana', phone: '9440818091', email: 'executiveengineernirmal@gmail.com', office_address: 'R&B Division Office, Nirmal', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Executive Engineer, Gajwel', designation: 'Executive Engineer', division: 'R&B Division, Gajwel', state: 'Telangana', phone: '9490480679', email: 'eerbgajwel@gmail.com', office_address: 'R&B Division Office, Gajwel', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Executive Engineer, Vikarabad', designation: 'Executive Engineer', division: 'R&B Division, Vikarabad', state: 'Telangana', phone: '9440818103', email: 'eevkb@ymail.com', office_address: 'R&B Division Office, Vikarabad', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  // Engineer-in-Chief level (from indiacustomercare.com verified listing)
  { name: 'Sri Ravinder Rao', designation: 'Engineer-in-Chief, State Roads & CRN', division: 'ENC Office, Hyderabad', state: 'Telangana', phone: '9441855599', email: 'encroadstelangana@gmail.com', office_address: 'R&B Department, Errum Manzil, Hyderabad', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
  { name: 'Sri I. Ganapathi Reddy', designation: 'Engineer-in-Chief, NH, CRF & Buildings', division: 'ENC Office, Hyderabad', state: 'Telangana', phone: '9440818001', email: 'cenhts@gmail.com', office_address: 'R&B Department, Errum Manzil, Hyderabad', source_url: 'https://tg-roadcutting.cgg.gov.in/ContactUs' },
];

// ─── Verified Real Data: Maharashtra PWD ────────────────────────────
// Source: pwd.maharashtra.gov.in/en/pune/ (verified 2026-05-23, last updated Feb 12 2026)
const MAHARASHTRA_CONTACTS: PwdContact[] = [
  // Pune Region
  { name: 'Shri Rajendra Savleram Rahane', designation: 'Chief Engineer', division: 'Pune Region', state: 'Maharashtra', phone: null, email: 'pune.ce@mahapwd.gov.in', office_address: 'Central Building, Post Box No.275, Pune-411001', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  { name: 'Shri B. N. Bahir', designation: 'Superintending Engineer', division: 'P.W. Circle, Pune', state: 'Maharashtra', phone: '020-26124863', email: 'pune.se@mahapwd.gov.in', office_address: 'Central Building (Ground floor), Pune', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  { name: 'Dr. Surendrakumar R Katkar', designation: 'Executive Engineer', division: 'P.W. Division, Pune', state: 'Maharashtra', phone: '020-26122414', email: 'pune.ee@mahapwd.gov.in', office_address: 'Central Building Campus, Pune 411001', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  { name: 'Shri Amol A. Pawar', designation: 'Executive Engineer', division: 'P.W. (East) Division, Pune', state: 'Maharashtra', phone: '020-26122457', email: 'eastpune.ee@mahapwd.gov.in', office_address: 'Central Building Campus B Barac, Pune', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  { name: 'Smt. A R Bhandare', designation: 'Executive Engineer', division: 'P.W. (South) Division, Pune', state: 'Maharashtra', phone: null, email: null, office_address: 'Pune', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  { name: 'Shri M S Barbhai', designation: 'Executive Engineer', division: 'P.W. (North) Division, Pune', state: 'Maharashtra', phone: null, email: null, office_address: 'Pune', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  { name: 'Shri S B Rokde', designation: 'Superintending Engineer', division: 'P.W. Circle, Satara', state: 'Maharashtra', phone: null, email: null, office_address: 'Satara', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  { name: 'Shri S R Jadhav', designation: 'Executive Engineer', division: 'P.W. Division, Satara', state: 'Maharashtra', phone: null, email: null, office_address: 'Satara', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  { name: 'Shri S.P. Kumbhar', designation: 'Superintending Engineer', division: 'P.W. Circle, Solapur', state: 'Maharashtra', phone: null, email: null, office_address: 'Solapur', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  { name: 'Shri M R Thakre', designation: 'Executive Engineer', division: 'Public Works Division No.1, Solapur', state: 'Maharashtra', phone: null, email: null, office_address: 'Solapur', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  { name: 'Shri T A Burud', designation: 'Superintending Engineer', division: 'P.W. Circle, Kolhapur', state: 'Maharashtra', phone: null, email: null, office_address: 'Kolhapur', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  { name: 'Shri R V Tondale', designation: 'Executive Engineer', division: 'P.W. Division, Kolhapur', state: 'Maharashtra', phone: null, email: null, office_address: 'Kolhapur', source_url: 'https://pwd.maharashtra.gov.in/en/pune/' },
  // Mantralaya (HQ)
  { name: 'Shri Milind Mhaiskar (IAS)', designation: 'Additional Chief Secretary', division: 'PWD Mantralaya, Mumbai', state: 'Maharashtra', phone: '022-22026612', email: 'acs.pwd@maharashtra.gov.in', office_address: 'PWD, Mantralaya, Mumbai', source_url: 'https://pwd.maharashtra.gov.in/en/whos-who/' },
  { name: 'Shri Sharad N. Rajbhoj', designation: 'Secretary (Roads)', division: 'PWD Mantralaya, Mumbai', state: 'Maharashtra', phone: '022-22020149', email: 'sec.pwdworks@maharashtra.gov.in', office_address: 'PWD, Mantralaya, Mumbai', source_url: 'https://pwd.maharashtra.gov.in/en/whos-who/' },
];

function seed() {
  const db = new Database(DB_PATH);

  // Create FTS5 table
  db.exec(`DROP TABLE IF EXISTS pwd_contacts`);
  db.exec(`
    CREATE VIRTUAL TABLE pwd_contacts USING fts5(
      name,
      designation,
      division,
      state,
      phone,
      email,
      office_address,
      source_url,
      tokenize='porter'
    )
  `);

  const insert = db.prepare(`
    INSERT INTO pwd_contacts (name, designation, division, state, phone, email, office_address, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const all = [...TELANGANA_CONTACTS, ...MAHARASHTRA_CONTACTS];

  const tx = db.transaction(() => {
    for (const c of all) {
      insert.run(c.name, c.designation, c.division, c.state, c.phone ?? '', c.email ?? '', c.office_address ?? '', c.source_url);
    }
  });

  tx();
  console.log(`✓ Seeded ${all.length} PWD contacts (${TELANGANA_CONTACTS.length} Telangana, ${MAHARASHTRA_CONTACTS.length} Maharashtra)`);
  db.close();
}

seed();
