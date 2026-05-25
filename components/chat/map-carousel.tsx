'use client';

import { useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMap } from '@/lib/context/map-context';
import { cn } from '@/lib/utils';

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  moderate: 'bg-amber-500',
  low: 'bg-blue-500',
  info: 'bg-gray-400',
};

export function MapCarousel() {
  const { markers, activeIndex, setActiveIndex } = useMap();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll active card into view
  useEffect(() => {
    const el = scrollRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeIndex]);

  const prev = () => setActiveIndex(Math.max(0, activeIndex - 1));
  const next = () => setActiveIndex(Math.min(markers.length - 1, activeIndex + 1));

  return (
    <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+9rem)] left-0 right-0 z-[70] px-3 md:bottom-36">
      <div className="relative mx-auto max-w-[900px]">
        {/* Arrows */}
        {markers.length > 1 && (
          <>
            <button
              onClick={prev}
              disabled={activeIndex === 0}
              className="absolute -left-1 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white p-1.5 shadow-md disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={next}
              disabled={activeIndex === markers.length - 1}
              className="absolute -right-1 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white p-1.5 shadow-md disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Cards */}
        <div
          ref={scrollRef}
          className="flex gap-2.5 overflow-x-auto px-6 pb-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
        >
          {markers.map((m, i) => (
            <button
              key={m.id}
              onClick={() => setActiveIndex(i)}
              className={cn(
                'flex-shrink-0 w-[260px] snap-center rounded-xl border bg-white px-3.5 py-3 text-left shadow-sm transition-all',
                i === activeIndex
                  ? 'border-text-primary ring-1 ring-text-primary/20 scale-[1.02]'
                  : 'border-border/60 hover:border-border'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('h-2 w-2 rounded-full', SEVERITY_DOT[m.severity] ?? SEVERITY_DOT.info)} />
                <span className="text-sm font-medium text-text-primary truncate">{m.title}</span>
              </div>
              <p className="text-xs text-text-muted line-clamp-2">{m.summary}</p>
              {m.citations.length > 0 && (
                <p className="mt-1.5 text-[10px] text-text-muted">📎 {m.citations.length} source{m.citations.length > 1 ? 's' : ''}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
