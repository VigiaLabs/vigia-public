import { ImageIcon, AlertTriangle } from "lucide-react";

type EvidenceImage = {
  url: string;
  severity: string;
  label: string;
};

const severityLabel: Record<string, string> = {
  critical: 'Critical',
  severe: 'Severe',
  moderate: 'Moderate',
  minor: 'Minor',
  none: 'None',
};

export function EvidenceGallery({ images = [] }: { images?: EvidenceImage[] }) {
  if (!images.length) {
    return (
      <div className="my-3 text-xs text-text-muted">
        No visual evidence captured yet.
      </div>
    );
  }

  return (
    <div className="my-6 grid grid-cols-2 gap-3 md:grid-cols-3">
      {images.map((image, i) => (
        <button
          key={`${image.url}-${i}`}
          type="button"
          className="shell-evidence-card group relative flex aspect-[4/3] items-center justify-center overflow-hidden opacity-0 hover:bg-white animate-fade-in-up"
          style={{ animationDelay: `${i * 100}ms`, animationFillMode: "forwards" }}
        >
          <img
            src={image.url}
            alt={image.label}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          <div className="absolute bottom-2 left-2 right-2 space-y-1 text-left">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#b9382b] px-2 py-1 text-[10px] font-medium text-white shadow-sm">
              <AlertTriangle className="h-3 w-3" />
              {severityLabel[image.severity] ?? 'Moderate'} Severity
            </span>
            <div className="line-clamp-2 text-[11px] font-medium text-white/90">
              {image.label}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
