import { ImageIcon, AlertTriangle } from "lucide-react";

export function EvidenceGallery() {
  return (
    <div className="my-6 grid grid-cols-2 gap-3 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          className="group relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-border bg-[#fbf8f2] opacity-0 transition-colors hover:bg-white animate-fade-in-up"
          style={{ animationDelay: `${i * 100}ms`, animationFillMode: "forwards" }}
        >
          <ImageIcon className="h-6 w-6 text-text-muted/30 group-hover:text-text-muted/50" />
          {i === 0 && (
            <div className="absolute bottom-2 left-2 right-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-medium text-white shadow-sm">
                <AlertTriangle className="h-3 w-3" />
                High Severity
              </span>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
