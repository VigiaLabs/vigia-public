'use client';

import { useEffect, useRef } from 'react';
import { dedupeSourceList, SourceRow, SourceRowSkeleton } from './source-card';
import type { VigiaSource } from '@/lib/sources/utils';
import type { EvidenceClaim } from '@/lib/agents/state';

type Props = {
  sources?: VigiaSource[];
  highlightedSourceId?: string | null;
  loading?: boolean;
  claims?: EvidenceClaim[];
};

export function SourceList({ sources = [], highlightedSourceId, loading, claims = [] }: Props) {
  const list = dedupeSourceList(sources);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!highlightedSourceId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [highlightedSourceId, list.length]);

  if (loading) {
    return (
      <div>
        {[0, 1, 2, 3].map((i) => (
          <SourceRowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!list.length) {
    return <p className="px-5 py-8 text-center text-[13px] text-neutral-400">No sources for this answer.</p>;
  }

  return (
    <div>
      {list.map((source, i) => {
        const highlighted = highlightedSourceId === source.id;
        return (
          <div key={source.id ?? `${source.label}-${i}`} ref={highlighted ? highlightRef : undefined}>
            <SourceRow
              source={source}
              index={i + 1}
              highlighted={highlighted}
              claims={claims.filter((claim) => claim.sourceId === source.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
