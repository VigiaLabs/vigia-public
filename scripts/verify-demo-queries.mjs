const LIVE_URL = 'https://main.d1y3lme21jz1c7.amplifyapp.com/api/chat';
const LOCAL_URL = 'http://localhost:3000/api/chat';
const endpoint = process.env.VIGIA_DEMO_URL || (process.argv.includes('--live') ? LIVE_URL : LOCAL_URL);

const cases = [
  {
    id: 'nh44-responsibility',
    query: 'Who is responsible for NH 44?',
    required: [/indexed project records for NH-44/i, /NHAI Project Implementation Unit|PIU/i, /1033/],
    forbidden: [/could not find specific data/i, /has not yet been ingested/i],
    minimumSources: 3,
    requireExcerpt: true,
  },
  {
    id: 'nh44-scoped-finance',
    query: 'For the NH-44 Hyderabad-Nagpur corridor, what is the road type, current O&M concessionaire, and TOT award value?',
    required: [/6L|6-lane/i, /Highway Infrastructure Trust/i, /6661|6,661/i, /TOT|Toll Operate and Transfer/i],
    forbidden: [/Sanctioned Cost[^\n]{0,30}(?:6661|6,661)/i, /built (?:all of )?NH-44/i],
    minimumSources: 2,
    requireExcerpt: true,
  },
  {
    id: 'nh163g-complaint',
    query: 'For NH-163G, what verified project records exist and where should I file a pothole complaint? Do not name an officer unless the source explicitly does.',
    required: [/NH-163G/i, /NHAI Project Implementation Unit|PIU/i, /pgportal\.gov\.in/i, /1033/],
    forbidden: [/Executive Engineer of the R&B Division/i, /9440818085/i],
    minimumSources: 3,
    requireExcerpt: true,
  },
  {
    id: 'unknown-road',
    query: 'Who is the executive engineer for NH-9999?',
    required: [/No exact indexed project record was found for NH-9999/i, /NHAI Project Implementation Unit|PIU/i, /1033/],
    forbidden: [/found indexed project records for NH-9999/i, /NH-65|NH-340C|NH-52|NH-44/i],
    minimumSources: 1,
    requireExcerpt: false,
  },
  {
    id: 'emarg-partial-evidence',
    query: 'eMARG roadDetailsId 64984, state whether the record proves a construction contractor or only a maintenance contractor. Give the maintenance start date, sanctioned amount, maintenance expenditure, and last physical relaying date. Do not infer missing values; cite every claim.',
    required: [/MUKTI NATH SONOWAL/i, /maintenance contractor/i, /3 March 2020/i, /₹\s?9,?94,?923|994,923/i, /sanctioned amount[^\n]*(?:not published|unavailable)/i, /physical relaying date[^\n]*(?:not published|unavailable)/i],
    forbidden: [/This specific data is not available in the VIGIA index/i, /construction contractor:\s*\*\*MUKTI NATH SONOWAL/i, /03-03-2020[^\n]*physical relaying/i],
    minimumSources: 1,
    requireExcerpt: true,
  },
  {
    id: 'maintenance-semantics',
    query: 'For NH-44 Hyderabad-Nagpur, what does the maintenance-related date 2024-09-18 represent?',
    required: [/2024-09-18/, /O&M|operation and maintenance/i, /commencement|start/i],
    forbidden: [/physically relaid on 2024-09-18/i, /physical relaying date.*2024-09-18/i],
    minimumSources: 2,
    requireExcerpt: true,
  },
  {
    id: 'whole-road-total',
    query: 'What is the total budget sanctioned for NH44?',
    required: [/no (?:single |one )?authoritative|does not (?:publish|contain|provide)|cannot (?:provide|determine)/i, /6661|6,661/i],
    forbidden: [/₹\s?28,?359/i, /total budget (?:is|of) ₹?\s?6661/i],
    minimumSources: 2,
    requireExcerpt: true,
  },
];

function parseStream(raw) {
  let answer = '';
  let metadata = null;
  const steps = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const event = JSON.parse(line.slice(6));
      if (event.type === 'text-delta') answer += event.delta || '';
      if (event.type === 'message-metadata') metadata = event.messageMetadata;
      if (event.type === 'data-vigia-step') {
        steps.push(...(event.data || []).map((item) => item.vigia_step).filter(Boolean));
      }
    } catch {}
  }
  return { answer, metadata, steps };
}

let failed = 0;
for (const testCase of cases) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ id: testCase.id, role: 'user', parts: [{ type: 'text', text: testCase.query }] }],
    }),
  });
  const result = parseStream(await response.text());
  const sources = result.metadata?.sources ?? [];
  const failures = [];

  if (!response.ok) failures.push(`HTTP ${response.status}`);
  for (const pattern of testCase.required) {
    if (!pattern.test(result.answer)) failures.push(`missing ${pattern}`);
  }
  for (const pattern of testCase.forbidden) {
    if (pattern.test(result.answer)) failures.push(`forbidden ${pattern}`);
  }
  if (sources.length < testCase.minimumSources) failures.push(`only ${sources.length} source(s)`);
  if (sources.some((source) => !/^https:\/\//.test(source.url ?? ''))) failures.push('non-HTTPS source URL');
  if (testCase.requireExcerpt && !sources.some((source) => typeof source.excerpt === 'string' && source.excerpt.trim().length > 40)) {
    failures.push('no cited source excerpt');
  }

  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  console.log(`${status} ${testCase.id} (${result.steps.length} visible steps, ${sources.length} sources)`);
  if (failures.length > 0) {
    failed += 1;
    for (const failure of failures) console.log(`  - ${failure}`);
    console.log(`  Answer: ${result.answer.replace(/\s+/g, ' ').slice(0, 500)}`);
  }
}

if (failed > 0) {
  console.error(`Demo query verification failed: ${failed}/${cases.length} case(s).`);
  process.exit(1);
}
console.log(`Demo query verification passed: ${cases.length}/${cases.length}.`);
