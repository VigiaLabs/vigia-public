'use client';

import { FileText, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

type Source = { id: string; label: string; trustLevel: string; url?: string };

type Props = { sources: Source[]; onOpen?: () => void };

function dedupe(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = s.url || s.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TRUST_COLORS: Record<string, string> = {
  'legally-binding': 'bg-emerald-500',
  'official-portal': 'bg-blue-500',
};

export function SourceCluster({ sources, onOpen }: Props) {
  const unique = dedupe(sources);
  if (!unique.length) return null;

  return (
    <button
      type="button"
      onClick={() => onOpen?.()}
      aria-label="Open sources panel"
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-0.5 py-0.5 text-left text-text-primary transition-colors hover:text-text-primary'
      )}
    >
      <span className="relative flex h-8 w-[52px] shrink-0 items-center justify-start">
        <span className="absolute left-0 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <FileText className="h-4 w-4 text-text-secondary" strokeWidth={1.8} />
        </span>
        <span className="absolute left-[16px] flex h-7 w-7 items-center justify-center rounded-full border border-white bg-[#f3f0d8] shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <span className="h-3.5 w-3.5 rounded-full bg-black" />
        </span>
        <span className="absolute left-[32px] flex h-7 w-7 items-center justify-center rounded-full border border-white bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <Globe className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.8} />
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white',
              TRUST_COLORS[unique[0]?.trustLevel] ?? 'bg-amber-500'
            )}
          />
        </span>
      </span>

      <span className="min-w-0 pr-1 text-[18px] font-normal leading-none text-text-muted">
        {unique.length} sources
      </span>
    </button>
  );
}
