# Core Module 4: Offline Infrastructure Wrapper

> Abstract browser storage so the team never writes raw IndexedDB code

---

## Current State

**No offline support exists.** No service worker, no PWA manifest, no IndexedDB wrapper, no background sync. The app is purely online. Citizens using this in the field (poor connectivity areas near infrastructure sites) will get a blank screen if offline.

## Purpose

This module provides:
1. **PWA shell caching** — App loads instantly even offline
2. **IndexedDB abstraction** — Clean async functions for storing queries, responses, and evidence
3. **Background sync** — Queued requests auto-retry when connectivity returns
4. **Camera/upload staging** — Offline storage for photos taken in the field (future feature prep)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Components (call clean functions)                     │
│                                                      │
│  saveQueryOffline(query)                            │
│  getCachedResponse(queryId)                         │
│  stageEvidence(file)                                │
│  syncPendingQueries()                               │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│ lib/db/offline-store.ts (Dexie wrapper)              │
│                                                      │
│  Database: VigiaOfflineDB                           │
│  Tables: requests, responses, evidence, settings     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│ IndexedDB (browser)                                  │
└─────────────────────────────────────────────────────┘
```

## Database Schema (`lib/db/offline-store.ts`)

```typescript
import Dexie, { type Table } from 'dexie';

export interface OfflineRequest {
  id: string;
  timestamp: number;
  query: string;
  status: 'pending' | 'synced' | 'failed';
  retryCount: number;
  aiState?: string; // JSON-serialized AIState
}

export interface CachedResponse {
  id: string;
  requestId: string;
  timestamp: number;
  content: string; // Serialized response
  sources: string; // JSON-serialized Source[]
}

export interface StagedEvidence {
  id: string;
  timestamp: number;
  filename: string;
  mimeType: string;
  blob: Blob;
  metadata: string; // JSON: { lat, lng, description }
  status: 'staged' | 'uploaded' | 'failed';
}

export interface AppSettings {
  key: string;
  value: string;
}

class VigiaOfflineDB extends Dexie {
  requests!: Table<OfflineRequest>;
  responses!: Table<CachedResponse>;
  evidence!: Table<StagedEvidence>;
  settings!: Table<AppSettings>;

  constructor() {
    super('vigia-offline');
    this.version(1).stores({
      requests: 'id, timestamp, status',
      responses: 'id, requestId, timestamp',
      evidence: 'id, timestamp, status',
      settings: 'key',
    });
  }
}

export const db = new VigiaOfflineDB();
```

## Exported Functions (`lib/db/offline-store.ts`)

```typescript
// Save a query when offline (or always, for history)
export async function saveQueryOffline(query: string): Promise<string>;

// Get cached response for a previous query
export async function getCachedResponse(requestId: string): Promise<CachedResponse | undefined>;

// Stage evidence (photo/file) for later upload
export async function stageEvidence(file: File, metadata: { lat?: number; lng?: number; description?: string }): Promise<string>;

// Get all pending (unsynced) requests
export async function getPendingRequests(): Promise<OfflineRequest[]>;

// Mark a request as synced
export async function markSynced(requestId: string): Promise<void>;

// Sync all pending queries (call when online)
export async function syncPendingQueries(): Promise<{ synced: number; failed: number }>;

// Get conversation history (for sidebar)
export async function getQueryHistory(limit?: number): Promise<OfflineRequest[]>;

// Clear old data (retention policy)
export async function pruneOldData(olderThanDays: number): Promise<void>;
```

## PWA Configuration (`next.config.ts`)

```typescript
import withPWA from 'next-pwa';

const nextConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
      handler: 'CacheFirst',
      options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 } },
    },
    {
      urlPattern: /\/_next\/static/,
      handler: 'CacheFirst',
      options: { cacheName: 'next-static', expiration: { maxEntries: 100 } },
    },
    {
      urlPattern: /\/_next\/image/,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'next-images', expiration: { maxEntries: 50 } },
    },
  ],
})({
  // existing next config
});

export default nextConfig;
```

## PWA Manifest (`public/manifest.json`)

```json
{
  "name": "VIGIA Search",
  "short_name": "VIGIA",
  "description": "Perplexity for Government Infrastructure",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f9f9f8",
  "theme_color": "#111827",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

## Background Sync (`lib/db/sync.ts`)

```typescript
// Register for background sync when a query is saved offline
export async function registerBackgroundSync(): Promise<void> {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register('sync-pending-queries');
  }
}

// Called by service worker when sync event fires
export async function handleSyncEvent(): Promise<void> {
  const pending = await getPendingRequests();
  for (const request of pending) {
    try {
      // POST to /api/chat with the stored query
      const response = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ query: request.query }),
      });
      if (response.ok) {
        await markSynced(request.id);
      }
    } catch {
      // Will retry on next sync event
    }
  }
}
```

## Online/Offline Detection Hook

```typescript
// lib/db/use-online-status.ts
'use client';

import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true // SSR assumes online
  );
}
```

## Critical Gaps to Fix

1. **No `next-pwa` installed** — Must add to enable service worker generation and app shell caching.
2. **No `dexie` installed** — Must add for IndexedDB abstraction.
3. **No PWA icons** — Need 192x192 and 512x512 icons in `public/`.
4. **No offline indicator in UI** — When offline, the input bar should show a subtle banner: "You're offline. Queries will sync when connected."
5. **No storage quota management** — IndexedDB has limits. Need to implement `pruneOldData()` and warn users when approaching quota.
6. **No encryption for sensitive data** — RTI responses and government data stored locally should be encrypted at rest. Consider `crypto.subtle` for AES-GCM encryption of cached responses.
7. **No data export** — Citizens may need to export their query history for legal proceedings. Need a `exportHistory()` function that generates a JSON/PDF.
8. **Service worker conflicts with Next.js dev mode** — `next-pwa` must be disabled in development to avoid caching stale pages during hot reload.
9. **No `<meta>` tags for PWA** — `app/layout.tsx` needs `<meta name="theme-color">`, `<link rel="manifest">`, and Apple-specific meta tags.

## Implementation Steps

1. `npm install next-pwa@5.6.0 dexie@4.0.11`
2. Create `lib/db/offline-store.ts` with Dexie schema and exported functions
3. Create `lib/db/sync.ts` with background sync logic
4. Create `lib/db/use-online-status.ts` hook
5. Create `lib/db/types.ts` re-exporting interfaces
6. Update `next.config.ts` with PWA wrapper
7. Create `public/manifest.json`
8. Add PWA meta tags to `app/layout.tsx`
9. Create placeholder icons in `public/`
10. Add offline indicator to `components/chat/input-bar.tsx`

## Dependencies to Add

```json
{
  "next-pwa": "5.6.0",
  "dexie": "4.0.11"
}
```

## Environment Variables

None required for this module (all client-side).

## Integration with Module 3

When `submitUserMessage()` is called:
1. Always call `saveQueryOffline(query)` first (for history + offline resilience)
2. If online → stream response normally, then cache via `saveCachedResponse()`
3. If offline → show cached response if available, otherwise queue for sync
