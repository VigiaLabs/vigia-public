'use client';

import { dedupeSources, getDomain, getFaviconUrl, type VigiaSource } from '@/lib/sources/utils';

type Props = {
  sources: VigiaSource[];
  onOpenAll?: () => void;
  onOpenSource?: (sourceId: string) => void;
};

function Favicon({ url }: { url?: string }) {
  const src = getFaviconUrl(url, 32);
  if (!src) {
    return <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-neutral-200 text-[8px] font-bold text-neutral-500">·</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain" />
  );
}

export function SourcesStrip({ sources, onOpenAll, onOpenSource }: Props) {
  const list = dedupeSources(sources);
  if (!list.length) return null;

  const shown = list.slice(0, 4);
  const remaining = list.length - shown.length;

  return (
    <div className="sources-strip">
      <div className="sources-strip-head">
        <span className="sources-strip-label">Reviewed {list.length} sources</span>
        <button type="button" className="sources-strip-all" onClick={onOpenAll}>
          View all
        </button>
      </div>
      <div className="sources-strip-row">
        {shown.map((source) => (
          <button
            key={source.id}
            type="button"
            className="sources-strip-pill"
            onClick={() => (onOpenSource ? onOpenSource(source.id) : onOpenAll?.())}
          >
            <Favicon url={source.url} />
            <span className="truncate">{getDomain(source.url)}</span>
          </button>
        ))}
        {remaining > 0 && (
          <button type="button" className="sources-strip-more" onClick={onOpenAll}>
            +{remaining}
          </button>
        )}
      </div>
    </div>
  );
}
