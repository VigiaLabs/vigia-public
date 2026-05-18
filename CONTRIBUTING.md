# CONTRIBUTING.md

## VIGIA Engineering Rules

This repository follows a strict modular architecture.

## High-level rules
- Keep business logic out of UI.
- Prefer small, typed modules.
- Preserve offline-first and background sync behavior.
- Keep import direction: UI → orchestration → persistence. Never reverse it.
- Do not commit directly to main.

---

## 1) Current runtime + key entry points

### Next.js App Router
- UI lives under `app/` and `components/`.
- Server/API logic for chat lives in `app/api/chat/route.ts`.
- The current chat API is non-streaming and returns JSON:
  - `{ reply, sources }`

### Thread routing
The app is URL-driven:

- `/` = new chat
- `/t/[threadId]` = open an existing thread

Routing entry points:
- `app/page.tsx`
- `app/t/[threadId]/page.tsx`

### Offline + persistence (IndexedDB)
Offline persistence uses IndexedDB via Dexie:

- `lib/db/offline-store.ts`

Core data model:
- `threads` (conversation-level)
- `messages` (turn-level)

### Sync + maintenance
Sync and maintenance helpers live in:

- `lib/db/sync.ts`

Expected behavior:
- User messages are queued immediately.
- When online, pending messages are synced in the background.
- Cleanup/pruning is conservative and never deletes pending records.

### PWA layer
PWA is enabled via `next-pwa`:

- `next.config.ts`
- `public/manifest.json`
- `public/icon-192.png`
- `public/icon-512.png`

---

## 2) Folder responsibilities

### `app/`
Routing and composition only.

Allowed:
- layouts/pages
- providers
- route handlers (for example `app/api/**`)

Not allowed:
- IndexedDB / Dexie schema logic
- persistence orchestration beyond calling `lib/*`

---

### `components/ui/`
Reusable, dumb UI primitives.

Rules:
- no API calls
- no offline persistence
- no routing decisions beyond rendering UI

---

### `components/chat/`
Chat UI and lightweight client-side orchestration.

Allowed:
- calling typed functions from `lib/db/*` to load/store threads and messages
- calling the chat route handler via `fetch('/api/chat')`

Not allowed:
- Dexie schema definitions
- app-wide navigation shell responsibilities

---

### `components/layout/`
App shell and navigation.

Allowed:
- navigate to `/` and `/t/[threadId]`
- display queue/sync status via `lib/db/*`

Not allowed:
- chat runtime logic (keep that in `components/chat/*` and the route handler)

---

### `lib/db/`
Offline infrastructure and persistence.

Responsibilities:
- Dexie schema + migrations
- thread/message CRUD
- queue stats
- background sync + maintenance
- conservative cleanup/pruning

Rules:
- browser-safe only
- no React components
- export async functions and small utilities

---

## 3) Import boundaries

Allowed direction:
- `components/*` → `lib/db/*`

Forbidden:
- `lib/db/*` importing React or `components/*`
- `components/ui/*` importing `lib/db/*`

Keep dependencies moving downward only.

---

## 4) Chat + offline flow (expected behavior)

1. User sends a message.
2. The message is saved immediately to IndexedDB as pending.
3. If online, the app calls `app/api/chat/route.ts` and stores the assistant reply.
4. If offline, the UI shows a pending state and background sync resolves it later.

Notes:
- Pending records are durable.
- Cleanup must never delete pending records.
- UI must remain resilient when an assistant reply is missing because sync has not happened yet.
- The current chat transport is route-based JSON, not streaming.

---

## 5) Styling rules

- Prefer semantic tokens defined in `globals.css`.
- Avoid hardcoded hex values in components.
- Keep the design minimal and consistent.

---

## 6) Type safety

Shared DB types live in `types.ts`.

Avoid duplicating message/thread interfaces in components.

---

## 7) Branching + PR expectations

- Do not commit directly to `main`.
- Keep work on feature or foundation branches.

PRs should:
- preserve offline-first behavior
- follow import boundaries
- keep DB migrations backwards compatible
- include a short testing note covering online/offline and thread routing