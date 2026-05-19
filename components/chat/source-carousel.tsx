import { FileText } from "lucide-react";

const sources = [
  { domain: "nhai.gov.in", title: "PM Gati Shakti Layer — SH-15 Corridor Plan", badge: "Verified Spatial Data", badgeColor: "bg-green-100 text-green-800" },
  { domain: "rti.gov.in", title: "RTI Response MC/2024/1847 — Road Maintenance", badge: "Legally Binding", badgeColor: "bg-blue-100 text-blue-800" },
  { domain: "eprocure.gov.in", title: "NHAI Tender #12 — Pothole Remediation Contract", badge: "Legally Binding", badgeColor: "bg-blue-100 text-blue-800" },
  { domain: "smartcities.gov.in", title: "Ward 12 Infrastructure Dashboard Q3 FY25", badge: "Official Portal", badgeColor: "bg-amber-100 text-amber-800" },
];

export function SourceCarousel() {
  return (
    <div className="my-6 space-y-3 border-l-2 border-gray-200 pl-4">
      {sources.map((source, i) => (
        <div
          key={source.domain}
          className="opacity-0 animate-slide-in-left"
          style={{ animationDelay: `${i * 80}ms`, animationFillMode: "forwards" }}
        >
          <button className="group w-full text-left hover:opacity-70 transition-opacity">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-500">{source.domain}</span>
                </div>
                <p className="text-sm font-normal text-gray-900 line-clamp-2 group-hover:text-gray-700">
                  {source.title}
                </p>
              </div>
              <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium whitespace-nowrap flex-shrink-0 ${source.badgeColor}`}>
                {source.badge}
              </span>
            </div>
          </button>
        </div>
      ))}
    </div>
  );
}
