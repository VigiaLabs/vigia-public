'use client';

import { cn } from '@/lib/utils';
import { dedupeSources, getDomain, getFaviconUrl, type VigiaSource } from '@/lib/sources/utils';

type Props = {
  source: VigiaSource;
  index: number;
  highlighted?: boolean;
};

export function SourceRow({ source, index, highlighted }: Props) {
  const domain = getDomain(source.url);
  const favicon = getFaviconUrl(source.url, 32);
  const Wrapper = source.url ? 'a' : 'div';

  return (
    <Wrapper
      href={source.url}
      target={source.url ? '_blank' : undefined}
      rel={source.url ? 'noopener noreferrer' : undefined}
      data-source-id={source.id}
      className={cn('source-row group', highlighted && 'source-row-active')}
    >
      <span className="source-row-num">{index}</span>
      <span className="source-row-icon">
        {favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={favicon} alt="" className="h-4 w-4 object-contain" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="source-row-title">{source.label}</span>
        <span className="source-row-domain">{domain}</span>
      </span>
    </Wrapper>
  );
}

export function SourceRowSkeleton() {
  return (
    <div className="source-row animate-pulse">
      <span className="h-3 w-3 rounded bg-neutral-100" />
      <span className="h-4 w-4 rounded bg-neutral-100" />
      <span className="flex-1 space-y-1.5">
        <span className="block h-3 w-full rounded bg-neutral-100" />
        <span className="block h-2.5 w-1/3 rounded bg-neutral-100" />
      </span>
    </div>
  );
}

export function dedupeSourceList(sources: VigiaSource[]) {
  return dedupeSources(sources);
}
