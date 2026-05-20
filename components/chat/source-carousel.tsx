import { FileText } from "lucide-react";

const sources = [
  { domain: "nhai.gov.in", title: "PM Gati Shakti Layer — SH-15 Corridor Plan", badge: "Verified Spatial Data", badgeColor: "bg-[#f3efe7] text-text-secondary" },
  { domain: "rti.gov.in", title: "RTI Response MC/2024/1847 — Road Maintenance", badge: "Legally Binding", badgeColor: "bg-[#f3efe7] text-text-secondary" },
  { domain: "eprocure.gov.in", title: "NHAI Tender #12 — Pothole Remediation Contract", badge: "Legally Binding", badgeColor: "bg-[#f3efe7] text-text-secondary" },
  { domain: "smartcities.gov.in", title: "Ward 12 Infrastructure Dashboard Q3 FY25", badge: "Official Portal", badgeColor: "bg-[#f3efe7] text-text-secondary" },
];

export function SourceCarousel() {
  return (
    <div className="my-6 space-y-3 border-l border-border pl-4">
      {sources.map((source, i) => (
        <div
          key={source.domain}
          className="opacity-0 animate-slide-in-left"
          style={{ animationDelay: `${i * 80}ms`, animationFillMode: "forwards" }}
        >
          <button className="group w-full rounded-2xl border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-white/80">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
                  <span className="text-xs text-text-muted">{source.domain}</span>
                </div>
                <p className="line-clamp-2 text-sm font-normal text-text-primary group-hover:text-text-primary/80">
                  {source.title}
                </p>
              </div>
              <span className={`shell-badge flex-shrink-0 whitespace-nowrap ${source.badgeColor}`}>
                {source.badge}
              </span>
            </div>
          </button>
        </div>
      ))}
    </div>
  );
}
