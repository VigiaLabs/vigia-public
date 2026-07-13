export function describeIndexedCoverage(query: string): string {
  if (/\bpmgsy\b|\brural roads?\b/i.test(query)) {
    return 'PMGSY coverage is currently limited to Khammam and Warangal in Telangana, and Pune and Nagpur in Maharashtra.';
  }

  if (/\b(engineer|officer|personnel|contact|phone|email)\b/i.test(query)) {
    return 'PWD personnel coverage is currently limited to verified directories for Telangana and Maharashtra.';
  }

  if (/\bnh\s*-?\d+\b|\bnhai\b|\bcontractor\b|\bconcessionaire\b|\bsanctioned\b|\bbudget\b|\bcost\b/i.test(query)) {
    return 'NHAI coverage is limited to the contract documents and award years currently ingested into the VIGIA index.';
  }

  return 'This data source or jurisdiction has not yet been ingested into the VIGIA index.';
}

export function isContactOrRedressQuery(intent: string | undefined, query: string): boolean {
  return intent === 'complaint' || intent === 'rti' || intent === 'personnel' ||
    /\b(complain|complaint|rti|engineer|officer|contact|phone|email)\b/i.test(query);
}
