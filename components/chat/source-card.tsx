'use client';

import { cn } from '@/lib/utils';
import {
  dedupeSources,
  getDomain,
  getFaviconUrl,
  getSourceHref,
  getSourceLocation,
  getTrustMeta,
  type VigiaSource,
} from '@/lib/sources/utils';
import type { EvidenceClaim } from '@/lib/agents/state';
import { ExternalLink, FileText, Quote } from 'lucide-react';

type Props = {
  source: VigiaSource;
  index: number;
  highlighted?: boolean;
  claims?: EvidenceClaim[];
};

export function SourceRow({ source, index, highlighted, claims = [] }: Props) {
  const domain = getDomain(source.url);
  const favicon = getFaviconUrl(source.url, 32);
  const href = getSourceHref(source);
  const trust = getTrustMeta(source.trustLevel);
  const hasStructuredLocation = Boolean(
    source.pageNumber || source.paragraphNumber || source.sectionTitle || source.sourceLocator || source.chunkIndex !== undefined
  );
  const sourceLocation = hasStructuredLocation
    ? getSourceLocation(source)
    : claims.find((claim) => claim.sourceLocator)?.sourceLocator ?? getSourceLocation(source);
  const passages: Array<{ quote: string; locator: string | undefined }> = [];
  if (source.excerpt) passages.push({ quote: source.excerpt, locator: sourceLocation });
  passages.push(...claims.map((claim) => ({
    quote: claim.sourceQuote,
    locator: claim.sourceLocator && !sourceLocation.includes(claim.sourceLocator)
      ? `${sourceLocation} · ${claim.sourceLocator}`
      : sourceLocation,
  })));
  const uniquePassages = passages.filter(
    (passage, passageIndex) => passages.findIndex((candidate) => candidate.quote === passage.quote) === passageIndex
  );

  return (
    <article
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
        <span className="flex items-start justify-between gap-2">
          <span className="source-row-title">{source.documentTitle ?? source.label}</span>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ring-1 ring-inset', trust.badgeClass)}>
            {trust.label}
          </span>
        </span>
        <span className="source-row-domain">{domain}</span>

        <span className="mt-2 flex items-center gap-1 text-[11px] font-medium text-neutral-600">
          <FileText className="h-3 w-3" aria-hidden="true" />
          {sourceLocation}
        </span>

        {uniquePassages.length > 0 ? (
          <span className="mt-2 block space-y-2">
            {uniquePassages.map((passage, passageIndex) => (
              <span key={`${passage.quote.slice(0, 40)}-${passageIndex}`} className="block rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
                {passage.locator && (
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                    {passage.locator}
                  </span>
                )}
                <span className="flex gap-2">
                  <Quote className="mt-0.5 h-3 w-3 shrink-0 text-neutral-300" aria-hidden="true" />
                  <span className="text-[12px] leading-relaxed text-neutral-700">{passage.quote}</span>
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="mt-2 block text-[11px] leading-relaxed text-neutral-400">
            This source did not provide passage-level metadata.
          </span>
        )}

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900"
          >
            Open source{source.pageNumber ? ` at page ${source.pageNumber}` : ''}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </span>
    </article>
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
