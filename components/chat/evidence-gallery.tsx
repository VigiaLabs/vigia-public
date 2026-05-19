import { ImageIcon, AlertTriangle } from "lucide-react";

export function EvidenceGallery() {
  return (
    <div className="my-6 grid grid-cols-2 md:grid-cols-3 gap-3">
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          className="relative aspect-[4/3] rounded bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center hover:bg-gray-100 transition-colors opacity-0 animate-fade-in-up group"
          style={{ animationDelay: `${i * 100}ms`, animationFillMode: "forwards" }}
        >
          <ImageIcon className="h-6 w-6 text-gray-300 group-hover:text-gray-400" />
          {i === 0 && (
            <div className="absolute bottom-2 left-2 right-2">
              <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-white bg-red-600">
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
