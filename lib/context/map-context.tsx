'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface SpatialMarker {
  id: string;
  title: string;
  lat: number;
  lng: number;
  type: 'point' | 'route';
  severity: 'critical' | 'moderate' | 'low' | 'info';
  summary: string;
  citations: string[];
  roadNumber?: string;
  state?: string;
  route?: {
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
    geometry?: { type: 'LineString'; coordinates: [number, number][] };
  };
}

interface MapContextValue {
  markers: SpatialMarker[];
  activeIndex: number;
  addMarkers: (markers: SpatialMarker[]) => void;
  setActiveIndex: (index: number) => void;
  clearMarkers: () => void;
}

const MapContext = createContext<MapContextValue | null>(null);

export function useMap() {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('useMap must be used within MapProvider');
  return ctx;
}

export function MapProvider({ children }: { children: ReactNode }) {
  const [markers, setMarkers] = useState<SpatialMarker[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const addMarkers = useCallback((newMarkers: SpatialMarker[]) => {
    setMarkers(prev => {
      const existing = new Set(prev.map(m => m.id));
      const unique = newMarkers.filter(m => !existing.has(m.id));
      return unique.length ? [...prev, ...unique] : prev;
    });
  }, []);

  const clearMarkers = useCallback(() => {
    setMarkers([]);
    setActiveIndex(0);
  }, []);

  return (
    <MapContext.Provider value={{ markers, activeIndex, addMarkers, setActiveIndex, clearMarkers }}>
      {children}
    </MapContext.Provider>
  );
}
