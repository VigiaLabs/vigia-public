export function MapView() {
  return (
    <div
      className="relative h-64 w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-50 my-4 lg:hidden"
      role="img"
      aria-label="Map showing SH-15 road polyline data"
    >
      <MapPlaceholder />
    </div>
  );
}

export function MapPanel() {
  return (
    <div
      className="hidden lg:block sticky top-0 h-screen w-[40%] border-l border-gray-200 bg-gray-50 animate-slide-in-right"
      role="img"
      aria-label="Map showing SH-15 road polyline data"
    >
      <MapPlaceholder />
    </div>
  );
}

function MapPlaceholder() {
  return (
    <>
      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(#e5e5e5 1px, transparent 1px), linear-gradient(90deg, #e5e5e5 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      {/* Floating label */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 shadow-sm border border-gray-100">
        <span className="text-sm">📍</span>
        <span className="text-xs font-medium text-gray-700">SH-15 Polyline Data</span>
      </div>
      {/* Simulated route line */}
      <svg className="absolute inset-0 w-full h-full">
        <path
          d="M 20,120 Q 80,40 160,100 T 320,80"
          stroke="#3b82f6"
          strokeWidth="3"
          fill="none"
          strokeDasharray="8,4"
          opacity="0.6"
        />
      </svg>
    </>
  );
}
