'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useMap, type SpatialMarker } from '@/lib/context/map-context';
import { fetchRouteGeometry } from '@/lib/map/fetch-route-geometry';
import { MapCarousel } from './map-carousel';
import 'leaflet/dist/leaflet.css';

const SEVERITY_COLORS: Record<string, { active: string; inactive: string }> = {
  critical: { active: '#ef4444', inactive: '#fca5a5' },
  moderate: { active: '#f59e0b', inactive: '#fde68a' },
  low: { active: '#3b82f6', inactive: '#93c5fd' },
  info: { active: '#6b7280', inactive: '#d1d5db' },
};

export function MapDashboard() {
  const { markers, activeIndex } = useMap();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Initialize map once, deferred to ensure container is laid out
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Defer to next frame so container has dimensions
    const raf = requestAnimationFrame(() => {
      if (!containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [20.5, 78.9],
        zoom: 5,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).addTo(map);

      layersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      // Force invalidate size after layout settles and whenever the host resizes.
      const syncSize = () => map.invalidateSize({ animate: false });
      const resizeObserver = new ResizeObserver(() => syncSize());
      resizeObserver.observe(containerRef.current);
      syncSize();
      const sizeTimer = window.setTimeout(syncSize, 100);
      const secondTimer = window.setTimeout(syncSize, 300);

      mapRef.current = map;

      const cleanupResize = () => {
        resizeObserver.disconnect();
        window.clearTimeout(sizeTimer);
        window.clearTimeout(secondTimer);
      };

      map.on('unload', cleanupResize);
    });

    return () => {
      cancelAnimationFrame(raf);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layersRef.current = null;
      }
    };
  }, []);

  // Update markers and routes
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();

    markers.forEach((m, i) => {
      const isActive = i === activeIndex;
      const colors = SEVERITY_COLORS[m.severity] ?? SEVERITY_COLORS.info;

      // Draw route polyline
      if (m.route) {
        drawRoute(m, isActive, colors, layers, map);
      }

      // Draw center marker
      L.circleMarker([m.lat, m.lng], {
        radius: isActive ? 8 : 5,
        color: '#fff',
        weight: 2,
        fillColor: colors.active,
        fillOpacity: isActive ? 1 : 0.6,
      })
        .bindPopup(`<strong>${m.title}</strong><br/><span style="font-size:12px">${m.summary}</span>`)
        .addTo(layers);
    });

    // Fly to active
    const active = markers[activeIndex];
    if (active) {
      map.flyTo([active.lat, active.lng], 9, { duration: 1 });
    }
  }, [markers, activeIndex]);

  return (
    <div className="relative z-0 h-full w-full">
      <div ref={containerRef} className="absolute inset-0 z-0" />
      {markers.length > 0 && <MapCarousel />}
      {markers.length === 0 && (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="rounded-xl bg-white/90 px-6 py-4 text-center shadow-sm backdrop-blur-sm">
            <div className="text-3xl mb-2">🗺️</div>
            <p className="text-sm text-text-muted">Ask about a road to see it highlighted here.</p>
          </div>
        </div>
      )}
    </div>
  );
}

async function drawRoute(
  m: SpatialMarker,
  isActive: boolean,
  colors: { active: string; inactive: string },
  layers: L.LayerGroup,
  map: L.Map
) {
  if (!m.route) return;

  let coords: [number, number][];

  if (m.route.geometry) {
    coords = m.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  } else {
    const geo = await fetchRouteGeometry(m.route.start, m.route.end);
    if (geo) {
      m.route.geometry = geo;
      coords = geo.coordinates.map(([lng, lat]) => [lat, lng]);
    } else {
      coords = [
        [m.route.start.lat, m.route.start.lng],
        [m.route.end.lat, m.route.end.lng],
      ];
    }
  }

  L.polyline(coords, {
    color: isActive ? colors.active : colors.inactive,
    weight: isActive ? 6 : 3,
    opacity: isActive ? 1 : 0.4,
    dashArray: coords.length === 2 ? '8 8' : undefined,
  }).addTo(layers);

  // Fit bounds to active route
  if (isActive && coords.length > 2) {
    map.fitBounds(L.latLngBounds(coords.map(c => L.latLng(c[0], c[1]))), { padding: [40, 40] });
  }
}
