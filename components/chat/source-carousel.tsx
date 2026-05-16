import { FileText } from "lucide-react";

const sources = [
  { domain: "nhai.gov.in", title: "PM Gati Shakti Layer — SH-15 Corridor Plan" },
  { domain: "rti.gov.in", title: "RTI Response MC/2024/1847 — Road Maintenance" },
  { domain: "eprocure.gov.in", title: "NHAI Tender #12 — Pothole Remediation Contract" },
  { domain: "smartcities.gov.in", title: "Ward 12 Infrastructure Dashboard Q3 FY25" },
];

export function SourceCarousel() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4 mb-6 scrollbar-hide">
      {sources.map((source, i) => (
        <div
          key={source.domain}
          className="flex-shrink-0 w-[200px] rounded-xl border border-gray-200 bg-white p-3 hover:shadow-sm transition-shadow cursor-pointer opacity-0 animate-slide-in-left"
          style={{ animationDelay: `${i * 80}ms`, animationFillMode: "forwards" }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <FileText className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-400 truncate">{source.domain}</span>
          </div>
          <p className="text-sm font-medium text-gray-700 line-clamp-2">{source.title}</p>
        </div>
      ))}
    </div>
  );
}
