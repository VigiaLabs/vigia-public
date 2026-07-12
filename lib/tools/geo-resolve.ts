/**
 * Geographic resolution utilities shared across the Admin agent and retrieval layer.
 *
 * Two jobs:
 *  1. Extract an Indian geographic anchor (state / district) from free text — used to
 *     constrain PWD personnel retrieval so we never return an officer from the wrong
 *     jurisdiction, and to gate personnel queries that have no anchor at all.
 *  2. Detect a *foreign* country named in free text (country name or a distinctive major
 *     city) so global queries typed without GPS still route to the international engine.
 *
 * All matching is deliberately conservative: country/city tokens that collide with Indian
 * places (or are ambiguous, e.g. "Georgia") are excluded to avoid false positives.
 */

// ─── Indian states (28) + major UTs ─────────────────────────────────
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Puducherry',
];

// Districts for the states we actually hold PWD personnel data for (Telangana, Maharashtra),
// plus a broad set of common district names. Used only for anchor extraction — a miss here
// simply means "no district anchor", never a wrong answer.
const KNOWN_DISTRICTS = [
  // Telangana
  'Khammam', 'Warangal', 'Adilabad', 'Hyderabad', 'Siddipet', 'Medchal', 'Nirmal',
  'Kothagudem', 'Sangareddy', 'Peddapalli', 'Wanaparthy', 'Vikarabad', 'Gajwel',
  'Nalgonda', 'Karimnagar', 'Nizamabad', 'Mahbubnagar', 'Rangareddy', 'Suryapet',
  'Jagtial', 'Bhadradri', 'Mancherial', 'Jangaon',
  // Maharashtra
  'Pune', 'Mumbai', 'Nagpur', 'Kolhapur', 'Satara', 'Solapur', 'Nashik',
  'Aurangabad', 'Chhatrapati Sambhajinagar', 'Thane', 'Nanded', 'Amravati', 'Akola',
  'Ahmednagar', 'Sangli', 'Jalgaon', 'Latur', 'Ratnagiri', 'Sindhudurg', 'Raigad',
  'Beed', 'Osmanabad', 'Wardha', 'Chandrapur', 'Gadchiroli', 'Yavatmal',
];

export interface IndiaGeo {
  state?: string;
  district?: string;
}

function wordMatch(text: string, needle: string): boolean {
  const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(text);
}

/** Extracts an Indian state and/or district mentioned in the text. */
export function extractIndiaGeo(text: string): IndiaGeo {
  if (!text) return {};
  const state = INDIAN_STATES.find((s) => wordMatch(text, s));
  const district = KNOWN_DISTRICTS.find((d) => wordMatch(text, d));
  return { state, district };
}

/** True when the text carries any Indian geographic anchor (state or district). */
export function hasIndiaAnchor(text: string): boolean {
  const g = extractIndiaGeo(text);
  return Boolean(g.state || g.district);
}

// ─── Foreign country detection (text-based, GPS-free) ───────────────
// Maps a distinctive country name OR major city → ISO 3166-1 alpha-2.
// Deliberately excludes ambiguous tokens (e.g. "Georgia", "Jordan", "Turkey" as names
// only) and anything that collides with Indian place names.
interface ForeignHit { code: string; name: string; }

const COUNTRY_NAMES: Array<[RegExp, ForeignHit]> = [
  [/\bkenya\b/i,            { code: 'KE', name: 'Kenya' }],
  [/\bnigeria\b/i,          { code: 'NG', name: 'Nigeria' }],
  [/\bsouth africa\b/i,     { code: 'ZA', name: 'South Africa' }],
  [/\buganda\b/i,           { code: 'UG', name: 'Uganda' }],
  [/\bghana\b/i,            { code: 'GH', name: 'Ghana' }],
  [/\btanzania\b/i,         { code: 'TZ', name: 'Tanzania' }],
  [/\bethiopia\b/i,         { code: 'ET', name: 'Ethiopia' }],
  [/\begypt\b/i,            { code: 'EG', name: 'Egypt' }],
  [/\bunited kingdom\b|\bengland\b|\bu\.?k\.?\b/i, { code: 'GB', name: 'United Kingdom' }],
  [/\bunited states\b|\bu\.?s\.?a\.?\b/i, { code: 'US', name: 'United States' }],
  [/\bcanada\b/i,           { code: 'CA', name: 'Canada' }],
  [/\bmexico\b/i,           { code: 'MX', name: 'Mexico' }],
  [/\bcolombia\b/i,         { code: 'CO', name: 'Colombia' }],
  [/\bbrazil\b/i,           { code: 'BR', name: 'Brazil' }],
  [/\bargentina\b/i,        { code: 'AR', name: 'Argentina' }],
  [/\bparaguay\b/i,         { code: 'PY', name: 'Paraguay' }],
  [/\bchile\b/i,            { code: 'CL', name: 'Chile' }],
  [/\bphilippines\b/i,      { code: 'PH', name: 'Philippines' }],
  [/\bindonesia\b/i,        { code: 'ID', name: 'Indonesia' }],
  [/\bvietnam\b/i,          { code: 'VN', name: 'Vietnam' }],
  [/\bthailand\b/i,         { code: 'TH', name: 'Thailand' }],
  [/\bmalaysia\b/i,         { code: 'MY', name: 'Malaysia' }],
  [/\bukraine\b/i,          { code: 'UA', name: 'Ukraine' }],
  [/\bbangladesh\b/i,       { code: 'BD', name: 'Bangladesh' }],
  [/\bnepal\b/i,            { code: 'NP', name: 'Nepal' }],
  [/\bsri lanka\b/i,        { code: 'LK', name: 'Sri Lanka' }],
  [/\bpakistan\b/i,         { code: 'PK', name: 'Pakistan' }],
  [/\bunited arab emirates\b|\buae\b/i, { code: 'AE', name: 'United Arab Emirates' }],
  [/\bsaudi arabia\b/i,     { code: 'SA', name: 'Saudi Arabia' }],
  [/\baustralia\b/i,        { code: 'AU', name: 'Australia' }],
];

// Distinctive foreign cities (no collision with Indian places).
const CITY_NAMES: Array<[RegExp, ForeignHit]> = [
  [/\bnairobi\b/i,     { code: 'KE', name: 'Kenya' }],
  [/\bmombasa\b/i,     { code: 'KE', name: 'Kenya' }],
  [/\blagos\b/i,       { code: 'NG', name: 'Nigeria' }],
  [/\babuja\b/i,       { code: 'NG', name: 'Nigeria' }],
  [/\bjohannesburg\b/i,{ code: 'ZA', name: 'South Africa' }],
  [/\bcape town\b/i,   { code: 'ZA', name: 'South Africa' }],
  [/\bkampala\b/i,     { code: 'UG', name: 'Uganda' }],
  [/\baccra\b/i,       { code: 'GH', name: 'Ghana' }],
  [/\bnairobi\b/i,     { code: 'KE', name: 'Kenya' }],
  [/\blondon\b/i,      { code: 'GB', name: 'United Kingdom' }],
  [/\bmanchester\b/i,  { code: 'GB', name: 'United Kingdom' }],
  [/\bbogota\b|\bbogotá\b/i, { code: 'CO', name: 'Colombia' }],
  [/\bmanila\b/i,      { code: 'PH', name: 'Philippines' }],
  [/\bkyiv\b|\bkiev\b/i, { code: 'UA', name: 'Ukraine' }],
  [/\bdubai\b|\babu dhabi\b/i, { code: 'AE', name: 'United Arab Emirates' }],
  [/\bdhaka\b/i,       { code: 'BD', name: 'Bangladesh' }],
  [/\bkathmandu\b/i,   { code: 'NP', name: 'Nepal' }],
  [/\bcolombo\b/i,     { code: 'LK', name: 'Sri Lanka' }],
  [/\bnew york\b|\bchicago\b|\blos angeles\b/i, { code: 'US', name: 'United States' }],
];

/**
 * Detects a foreign country referenced in the text. Returns null when the text is
 * India-centric or no confident foreign match is found. If an Indian state/district is
 * present, we treat the query as domestic and return null (India wins ties).
 */
export function detectForeignCountry(text: string): ForeignHit | null {
  if (!text) return null;
  if (hasIndiaAnchor(text)) return null;
  // Explicit "India" mention → domestic.
  if (/\bindia\b|\bindian\b|\bnhai\b|\bpwd\b|\bpmgsy\b/i.test(text)) return null;

  for (const [re, hit] of COUNTRY_NAMES) if (re.test(text)) return hit;
  for (const [re, hit] of CITY_NAMES) if (re.test(text)) return hit;
  return null;
}
