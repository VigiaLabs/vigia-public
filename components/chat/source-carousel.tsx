import { FileText } from "lucide-react";

type SourceItem = {
  id: string;
  label: string;
  trustLevel: string;
  url?: string;
};

const trustMeta: Record<string, { label: string; className: string }> = {
  'verified-spatial': {
    label: 'Verified Spatial',
    className: 'bg-[#e7effc] text-[#1f3a5f]',
  },
  'legally-binding': {
    label: 'Legally Binding',
    className: 'bg-[#f7ecd7] text-[#7a4b21]',
  },
  'official-portal': {
    label: 'Official Portal',
    className: 'bg-[#e6f5ea] text-[#24624c]',
  },
};

function getDomain(url?: string) {
  if (!url) return 'source';
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function SourceCarousel({ sources = [] }: { sources?: SourceItem[] }) {
  if (!sources.length) {
    return (
      <div className="my-3 text-xs text-text-muted">
        No sources extracted yet.
      </div>
    );
  }

  return (
    <div className="my-6 space-y-4">
      <div className="shell-section-label">Sources</div>
      {sources.map((source, i) => {
        const meta = trustMeta[source.trustLevel] ?? {
          label: 'Source',
          className: 'bg-[#f1ebe2] text-text-secondary',
        };

        return (
        <div
          key={source.id ?? `${source.label}-${i}`}
          className="opacity-0 animate-slide-in-left"
          style={{ animationDelay: `${i * 80}ms`, animationFillMode: "forwards" }}
        >
          <button className="shell-source-card group w-full" type="button">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
                  <span className="text-xs text-text-muted">{getDomain(source.url)}</span>
                </div>
                <p className="line-clamp-2 text-sm font-normal text-text-primary group-hover:text-text-primary/80">
                  {source.label}
                </p>
              </div>
              <span className={`shell-badge flex-shrink-0 whitespace-nowrap ${meta.className}`}>
                {meta.label}
              </span>
            </div>
          </button>
        </div>
        );
      })}
    </div>
  );
}
