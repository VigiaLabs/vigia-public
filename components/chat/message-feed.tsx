import { CitationPill } from "./citation-pill";
import { SourceCarousel } from "./source-carousel";

export function MessageFeed() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* User Query Bubble */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 rounded-2xl px-5 py-2.5 text-sm font-sans text-gray-800 max-w-lg">
          What is the current budget allocation for SH-15 pothole repairs in Ward 12?
        </div>
      </div>

      {/* Source Cards */}
      <SourceCarousel />

      {/* AI Answer */}
      <div className="space-y-4 font-serif text-base leading-relaxed text-gray-800">
        <p
          className="opacity-0 animate-fade-in-up"
          style={{ animationDelay: "0ms", animationFillMode: "forwards" }}
        >
          The Municipal Corporation allocated ₹4.2 crore for SH-15 pothole repairs in
          FY 2024-25 <CitationPill number={1} label="NHAI Tender 12" />, representing a
          23% increase from the previous fiscal year. However, RTI data reveals only ₹1.8
          crore was disbursed by Q3{" "}
          <CitationPill number={2} label="RTI/MC/2024/1847" />.
        </p>
        <p
          className="opacity-0 animate-fade-in-up"
          style={{ animationDelay: "150ms", animationFillMode: "forwards" }}
        >
          The Gati Shakti spatial layer confirms that 12.4 km of SH-15 falls within Ward
          12 boundaries <CitationPill number={3} label="PM Gati Shakti Layer" />, with
          67% classified as &ldquo;poor condition&rdquo; in the latest survey. The Smart
          Cities dashboard shows 3 active tenders for this stretch, but none have
          progressed beyond the &ldquo;Technical Evaluation&rdquo; stage{" "}
          <CitationPill number={4} label="Ward 12 Dashboard" />.
        </p>
      </div>
    </div>
  );
}
