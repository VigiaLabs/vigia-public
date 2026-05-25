# Feature Spec: Geospatial Chat Map & Interactive Carousel

## Overview

Add a "Maps" view to the VIGIA frontend that visualizes infrastructure discussed in the chat. When the user clicks "Map" in the top bar, the UI transitions to a full-screen interactive map highlighting roads/locations mentioned, controlled by a swipeable carousel.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Chat API Route (app/api/chat/route.ts)                  │
│  └─ Pipeline emits spatialMarkers in evidence metadata  │
└──────────────────────┬──────────────────────────────────┘
                       │ SSE stream (vigia-evidence metadata)
                       ▼
┌─────────────────────────────────────────────────────────┐
│ ChatShell (components/chat/chat-shell.tsx)               │
│  └─ Reads evidence.spatialMarkers → pushes to MapStore  │
└──────────────────────┬──────────────────────────────────┘
                       │ React Context
                       ▼
┌─────────────────────────────────────────────────────────┐
│ MapStore (lib/context/map-context.tsx)                   │
│  State: markers[], activeIndex, isMapView               │
└──────────┬────────────────────────────┬─────────────────┘
           │                            │
           ▼                            ▼
┌─────────────────────┐    ┌──────────────────────────────┐
│ MapDashboard        │    │ MapCarousel                   │
│ (react-leaflet)     │    │ (floating bottom cards)       │
│ - Plots markers     │    │ - Swipeable road cards        │
│ - flyTo on change   │    │ - Updates activeIndex         │
└─────────────────────┘    └──────────────────────────────┘
```

---

## Step 1: Backend — Spatial Marker Extraction (`lib/agents/ui-hook.ts`)

### Current State
The `extractUIPayload()` function already has a `spatialMarkers` field but only populates it from telemetry GPS data. Most queries (admin/tender) don't produce spatial markers.

### Changes Required

Update `extractUIPayload()` to also extract spatial markers from **admin agent evidence** by:
1. Parsing road numbers (NH-44, SH-15) from findings text
2. Looking up approximate coordinates from a static road-centroid lookup table
3. Emitting markers for each road/section mentioned in the response

#### Schema (extended)
```typescript
interface SpatialMarker {
  id: string;                    // unique per marker
  title: string;                 // e.g. "NH-44 Panipat-Jalandhar"
  lat: number;                   // center point (for flyTo)
  lng: number;
  type: 'point' | 'route';
  severity: 'critical' | 'moderate' | 'low' | 'info';
  summary: string;              // brief context from chat
  citations: string[];          // source labels
  roadNumber?: string;
  state?: string;
  // Route geometry (for drawing highlighted road segments)
  route?: {
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
    geometry?: GeoJSON.LineString;  // populated from OSRM at render time
  };
}
```

#### Road Centroid Lookup
Create `data/road-centroids.json` with start/end coordinates for major NH/SH route sections:
```json
{
  "NH-44": {
    "center": { "lat": 20.5, "lng": 78.9 },
    "label": "NH-44 (Srinagar–Kanyakumari)",
    "type": "route"
  },
  "NH-44:Panipat-Jalandhar": {
    "start": { "lat": 29.39, "lng": 76.97 },
    "end": { "lat": 31.33, "lng": 75.57 },
    "center": { "lat": 30.35, "lng": 76.38 },
    "label": "NH-44 Panipat–Jalandhar",
    "type": "route"
  },
  "NH-44:Hyderabad-Nagpur": {
    "start": { "lat": 17.385, "lng": 78.486 },
    "end": { "lat": 21.146, "lng": 79.088 },
    "center": { "lat": 18.95, "lng": 78.5 },
    "label": "NH-44 Hyderabad–Nagpur",
    "type": "route"
  },
  "NH-44:Delhi-Panipat": {
    "start": { "lat": 28.61, "lng": 77.23 },
    "end": { "lat": 29.39, "lng": 76.97 },
    "center": { "lat": 29.0, "lng": 77.1 },
    "label": "NH-44 Delhi–Panipat Expressway",
    "type": "route"
  },
  "NH-44:Jammu-Srinagar": {
    "start": { "lat": 32.73, "lng": 74.87 },
    "end": { "lat": 34.08, "lng": 74.79 },
    "center": { "lat": 33.5, "lng": 74.8 },
    "label": "NH-44 Jammu–Srinagar",
    "type": "route"
  }
}
```

For unknown roads: use Nominatim geocoding as fallback (rate-limited, cached).

#### Implementation
```typescript
// In extractUIPayload(), after existing spatialMarkers logic:
const adminMarkers = extractMarkersFromEvidence(state.evidence);
const allMarkers = [...(spatialMarkers ?? []), ...adminMarkers];
```

---

## Step 2: Frontend State Management (`lib/context/map-context.tsx`)

### Approach
Use React Context (consistent with existing codebase — no Zustand dependency needed).

#### Interface
```typescript
interface MapContextValue {
  markers: SpatialMarker[];
  activeIndex: number;
  addMarkers: (markers: SpatialMarker[]) => void;
  setActiveIndex: (index: number) => void;
  clearMarkers: () => void;
}
```

#### Provider
- Wraps the chat layout (alongside `EvidenceProvider` and `HeaderTabProvider`)
- `ChatShell` calls `addMarkers()` when it receives `vigia-evidence` metadata with `spatialMarkers`
- `MapDashboard` and `MapCarousel` consume the context

---

## Step 3: Map Component (`components/chat/map-dashboard.tsx`)

### Library Choice: `react-leaflet`
- Free, no API key required (uses OpenStreetMap tiles)
- Lightweight (~40KB gzipped)
- Good mobile support
- No vendor lock-in

### Behavior
- Renders when `activeHeaderTab === 'map'`
- Plots all `markers` from MapContext as circle markers (color-coded by severity)
- **Draws road segments as highlighted polylines** along the actual road geometry (like Google Maps route highlighting)
- On `activeIndex` change: `map.flyTo(markers[activeIndex], zoom: 10)` with smooth animation and fits the route bounds
- Active route is highlighted in bold color; inactive routes are dimmed
- Marker popup shows title + summary
- Default view: India bounds `[[8, 68], [37, 97]]` if no markers

### Route Geometry Source
Use the **OSRM (Open Source Routing Machine)** API to fetch actual road geometry:
```
GET https://router.project-osrm.org/route/v1/driving/{startLng},{startLat};{endLng},{endLat}?overview=full&geometries=geojson
```
- Returns the actual road path as GeoJSON LineString coordinates
- Free, no API key, follows real road network
- Cache responses in `sessionStorage` to avoid repeat calls

For each road section, store start/end coordinates in `road-centroids.json`:
```json
{
  "NH-44:Panipat-Jalandhar": {
    "start": { "lat": 29.39, "lng": 76.97 },
    "end": { "lat": 31.33, "lng": 75.57 },
    "label": "NH-44 Panipat–Jalandhar"
  },
  "NH-44:Hyderabad-Nagpur": {
    "start": { "lat": 17.385, "lng": 78.486 },
    "end": { "lat": 21.146, "lng": 79.088 },
    "label": "NH-44 Hyderabad–Nagpur"
  }
}
```

### Route Rendering
- Use Leaflet's `<Polyline>` (via react-leaflet) to draw the OSRM-returned geometry
- Active route: **thick (6px), bright color, full opacity**
- Inactive routes: **thin (3px), muted color, 40% opacity**
- On hover: show route name tooltip
- On click: set as active, fly to fit bounds

### Polyline Styling
| Severity | Active Color | Inactive Color | Width |
|----------|-------------|----------------|-------|
| critical | #ef4444 (red) | #fca5a5 | 6px / 3px |
| moderate | #f59e0b (amber) | #fde68a | 6px / 3px |
| low | #3b82f6 (blue) | #93c5fd | 6px / 3px |
| info | #6b7280 (gray) | #d1d5db | 5px / 2px |

### Fallback (no OSRM)
If OSRM is unreachable or the route is too short, draw a straight dashed line between start/end points as a visual indicator.

### Marker Styling
| Severity | Color | Size |
|----------|-------|------|
| critical | red (#ef4444) | 12px |
| moderate | amber (#f59e0b) | 10px |
| low | blue (#3b82f6) | 8px |
| info | gray (#6b7280) | 8px |

---

## Step 4: Interactive Carousel (`components/chat/map-carousel.tsx`)

### Layout
- Fixed at bottom of map view, overlaid with `position: absolute; bottom: 0`
- Horizontal scrollable card strip
- Each card: 280px wide, shows title, summary (2 lines), citation count

### Card Structure
```
┌─────────────────────────────┐
│ 🔴 NH-44 Panipat-Jalandhar  │
│ 6L, HAM, ₹8,375 Cr sanct.  │
│ 📎 2 sources                 │
└─────────────────────────────┘
```

### Interactions
- Tap/click card → `setActiveIndex(i)` → map flies to that marker
- Swipe left/right to browse (CSS `scroll-snap-type: x mandatory`)
- Active card has highlighted border
- Left/Right arrow buttons on desktop

---

## Step 5: Integration with ChatShell

### Data Flow
1. User sends message → pipeline runs → evidence metadata includes `spatialMarkers`
2. `ChatShell` receives metadata in `onFinish` callback
3. Calls `addMarkers(evidence.spatialMarkers)` on the MapContext
4. If user switches to Map tab, they see all accumulated markers from the conversation

### Accumulation
- Markers accumulate across the conversation (not reset per message)
- `clearMarkers()` called on new thread creation
- Duplicate markers (same road+section) are deduplicated by `id`

---

## Dependencies to Add

```json
{
  "react-leaflet": "^4.2.1",
  "leaflet": "^1.9.4",
  "@types/leaflet": "^1.9.8"
}
```

No Mapbox API key needed. Uses free OpenStreetMap tiles:
```
https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
```

---

## File Structure

```
lib/context/map-context.tsx          # MapProvider + useMap hook
data/road-centroids.json             # Static lat/lng for major roads
components/chat/map-dashboard.tsx    # Leaflet map component
components/chat/map-carousel.tsx     # Bottom card carousel
lib/agents/ui-hook.ts                # Updated: extract spatial markers from admin evidence
```

---

## Tasks

- [ ] Create `data/road-centroids.json` with NH-44 section start/end coordinates
- [ ] Create `lib/context/map-context.tsx` (React Context store)
- [ ] Create `lib/map/fetch-route-geometry.ts` (OSRM API client with sessionStorage cache)
- [ ] Update `lib/agents/ui-hook.ts` to extract markers from admin evidence
- [ ] Install `react-leaflet` + `leaflet` dependencies
- [ ] Create `components/chat/map-dashboard.tsx` (Leaflet map with polyline route rendering)
- [ ] Create `components/chat/map-carousel.tsx` (bottom carousel)
- [ ] Wire MapProvider into `app/(chat)/layout.tsx`
- [ ] Update ChatShell to push markers to MapContext on evidence receipt
- [ ] Replace Map tab placeholder in ChatShell with MapDashboard + MapCarousel
- [ ] Test with NH-44 query to verify route segment is highlighted on map

---

## Acceptance Criteria

1. User sends "NH-44 degraded section" → Map tab shows a marker on the NH-44 corridor
2. Multiple queries accumulate markers on the map
3. Clicking a carousel card flies the map to that location
4. Markers are color-coded by severity
5. Works on mobile (touch swipe on carousel)
6. No API keys required (OpenStreetMap tiles)
7. Map loads in < 500ms after tab switch
