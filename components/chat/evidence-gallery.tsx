import { ImageIcon, AlertTriangle } from "lucide-react";

export function EvidenceGallery() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 my-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="relative aspect-[4/3] rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center opacity-0 animate-fade-in-up"
          style={{ animationDelay: `${i * 100}ms`, animationFillMode: "forwards" }}
        >
          <ImageIcon className="h-8 w-8 text-gray-300" />
          {i === 0 && (
            <div className="absolute bottom-2 left-2 right-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
                <AlertTriangle className="h-3 w-3" />
                iRAP Severity: High — Surface Roughness
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
