import { MapPin } from 'lucide-react';

export function MapView() {
  return (
    <div
      className="relative my-4 h-64 w-full overflow-hidden rounded-[28px] border border-border bg-[#f7f3ed] lg:hidden"
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
      className="sticky top-0 hidden h-screen w-[40%] border-l border-border bg-[#f7f3ed] animate-slide-in-right lg:block"
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
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            'linear-gradient(#e5dfd3 1px, transparent 1px), linear-gradient(90deg, #e5dfd3 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 shadow-[0_1px_2px_rgba(17,17,17,0.04)]">
        <MapPin className="h-3.5 w-3.5 text-text-primary" />
        <span className="text-xs font-medium text-text-secondary">SH-15 Polyline Data</span>
      </div>
      <svg className="absolute inset-0 w-full h-full">
        <path
          d="M 20,120 Q 80,40 160,100 T 320,80"
          stroke="#111111"
          strokeWidth="3"
          fill="none"
          strokeDasharray="8,4"
          opacity="0.35"
        />
      </svg>
    </>
  );
}
