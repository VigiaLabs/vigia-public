export type VigiaSource = {
  id: string;
  label: string;
  trustLevel: string;
  url?: string;
};

export const TRUST_META: Record<
  string,
  { label: string; badgeClass: string; dotClass: string }
> = {
  'legally-binding': {
    label: 'Legally binding',
    badgeClass: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
    dotClass: 'bg-emerald-500',
  },
  'official-portal': {
    label: 'Official portal',
    badgeClass: 'bg-blue-50 text-blue-800 ring-blue-200/80',
    dotClass: 'bg-blue-500',
  },
  'verified-spatial': {
    label: 'Verified spatial',
    badgeClass: 'bg-indigo-50 text-indigo-800 ring-indigo-200/80',
    dotClass: 'bg-indigo-500',
  },
  'citizen-claim': {
    label: 'Citizen report',
    badgeClass: 'bg-amber-50 text-amber-900 ring-amber-200/80',
    dotClass: 'bg-amber-500',
  },
};

const DEFAULT_TRUST = {
  label: 'Source',
  badgeClass: 'bg-[#f4f4f5] text-text-secondary ring-border/80',
  dotClass: 'bg-[#a1a1aa]',
};

export function getTrustMeta(trustLevel: string) {
  return TRUST_META[trustLevel] ?? DEFAULT_TRUST;
}

export function dedupeSources(sources: VigiaSource[]): VigiaSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.url || source.id || source.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getDomain(url?: string): string {
  if (!url) return 'Document';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function getFaviconUrl(url?: string, size = 32): string | null {
  if (!url) return null;
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  } catch {
    return null;
  }
}

export function findSourceIndex(sources: VigiaSource[], label: string): number {
  return sources.findIndex(
    (source) => source.label === label || label.includes(source.label) || source.label.includes(label)
  );
}

export function findSourceByLabel(sources: VigiaSource[], label: string): VigiaSource | undefined {
  const index = findSourceIndex(sources, label);
  return index >= 0 ? sources[index] : undefined;
}
