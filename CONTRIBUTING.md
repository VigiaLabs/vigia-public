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

---

## 8) Future: AI SDK RSC Integration

When integrating the Vercel AI SDK with React Server Components (RSC), follow this path to preserve offline-first behavior and backward compatibility.

### Why we're keeping IndexedDB

The AI SDK manages conversation state in React contexts on the client. VIGIA **must keep IndexedDB as the source of truth** because:
- Users expect to see their history offline
- Background sync needs durable pending state
- Closing the browser window shouldn't lose unsent messages

The AI SDK's state will be **hydrated from IndexedDB on page load** and **synced back to IndexedDB after each interaction**.

### Implementation path

#### Step 1: Update the chat provider

Location: `lib/chat/provider.tsx`

Current state: stub that returns `<>{children}</>`

Future implementation:

```typescript
'use client';

import React, { createContext, useContext } from 'react';
import { useChat } from '@ai-sdk/rsc';
import { loadThread, upsertMessages } from '@/lib/db';

interface ChatContextType {
  // AI SDK useChat hook result
  isLoading: boolean;
  messages: Array<{ id: string; role: string; content: string }>;
  append: (message: { role: string; content: string }) => void;
  setMessages: (messages: any[]) => void;
  // Add offline + sync metadata
  syncStatus: 'synced' | 'pending' | 'failed' | 'offline';
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({
  children,
  threadId,
}: {
  children: React.ReactNode;
  threadId?: string;
}) {
  const [messages, setMessages] = React.useState<any[]>([]);
  const [syncStatus, setSyncStatus] = React.useState<ChatContextType['syncStatus']>('synced');

  // 1. On mount: Load thread from IndexedDB
  React.useEffect(() => {
    async function initThread() {
      if (!threadId) return;
      const thread = await loadThread(threadId);
      if (thread?.messages) {
        setMessages(thread.messages);
      }
    }
    initThread();
  }, [threadId]);

  // 2. Initialize AI SDK useChat with persistence hook
  const { isLoading, messages: aiMessages, append, setMessages: setAiMessages } = useChat({
    api: '/api/chat',
    id: threadId,
    initialMessages: messages,
    onResponse: async (response) => {
      // 3. After each AI response, persist to IndexedDB
      const updatedMessages = [...messages, ...aiMessages];
      await upsertMessages(threadId || 'new', updatedMessages);
      setSyncStatus('synced');
    },
    onError: (error) => {
      setSyncStatus('failed');
      console.error('Chat error:', error);
    },
  });

  // 4. When user appends a message, mark as pending and persist
  const handleAppend = React.useCallback(
    async (message: { role: string; content: string }) => {
      setSyncStatus('pending');
      await upsertMessages(threadId || 'new', [...messages, message]);
      append(message);
    },
    [messages, threadId, append]
  );

  const value: ChatContextType = {
    isLoading,
    messages: aiMessages,
    append: handleAppend,
    setMessages: setAiMessages,
    syncStatus,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within ChatProvider');
  }
  return context;
}
```

#### Step 2: Update the chat route handler

Location: `app/api/chat/route.ts`

Current behavior: non-streaming JSON response

Future implementation with streaming:

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  // Use the last user message as context
  const userMessage = messages[messages.length - 1];

  // For now, use OpenAI. Adapt as needed for your LLM.
  const result = streamText({
    model: openai('gpt-4'),
    system: 'You are a helpful infrastructure intelligence assistant...',
    messages: messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    })),
    // Optional: tools for real-time data fetching
    tools: {
      // future: add tools for live data
    },
  });

  return result.toDataStream();
}
```

#### Step 3: Wrap your layout with the provider

Location: `app/layout.tsx` or `app/t/[threadId]/layout.tsx`

```typescript
import { ChatProvider } from '@/lib/chat/provider';

export default function Layout({ children, params }: any) {
  const threadId = params?.threadId;

  return (
    <ChatProvider threadId={threadId}>
      {children}
    </ChatProvider>
  );
}
```

#### Step 4: Update components to use the provider

Location: `components/chat/input-bar.tsx`

```typescript
'use client';

import { useChatContext } from '@/lib/chat/provider';

export function InputBar() {
  const { append, isLoading, syncStatus } = useChatContext();
  const [input, setInput] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    append({ role: 'user', content: input });
    setInput('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={isLoading}
        placeholder="Type a message..."
      />
      <button disabled={isLoading} type="submit">
        {isLoading ? 'Sending...' : 'Send'}
      </button>
      {syncStatus === 'failed' && <span className="text-red-500">Failed to send</span>}
    </form>
  );
}
```

Location: `components/chat/message-feed.tsx`

```typescript
'use client';

import { useChatContext } from '@/lib/chat/provider';

export function MessageFeed() {
  const { messages } = useChatContext();

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
          {message.content}
        </div>
      ))}
    </div>
  );
}
```

### Migration checklist

When implementing AI SDK RSC integration:

- [ ] Install `ai` and your chosen model provider (e.g., `@ai-sdk/openai`)
- [ ] Replace `lib/chat/provider.tsx` with the RSC-enabled version above
- [ ] Update `app/api/chat/route.ts` to use `streamText` and return `.toDataStream()`
- [ ] Wrap your layout with `<ChatProvider>`
- [ ] Update components to import and use `useChatContext()` instead of fetching directly
- [ ] Test offline: user messages should queue to IndexedDB even without AI SDK online
- [ ] Test online: AI responses should stream in and persist after streaming completes
- [ ] Test thread routing: navigating to `/t/[threadId]` should hydrate messages from IndexedDB
- [ ] Test sync: pending messages should resolve when connection returns
- [ ] Verify `syncStatus` indicators display correctly in UI

### Why this approach works

1. **Backward compatible**: Existing IndexedDB schema unchanged. No data migration needed.
2. **Offline-first preserved**: User messages queue locally even if AI SDK provider is down.
3. **Durable pending state**: Background sync can process pending messages after reconnection.
4. **Streaming UX**: AI SDK handles streaming directly; you just persist the final result.
5. **No state duplication**: IndexedDB is source of truth; AI SDK context is transient.

### Resources

- [Vercel AI SDK Docs](https://sdk.vercel.ai/)
- [React Server Components Guide](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [Dexie.js Docs](https://dexie.org/)

---

## 9) Dead code and cleanup notes

### Removed in polish phase

No files were deleted. Legacy stubs remain:

- `lib/chat/provider.tsx`: stub returning `<>{children}</>` — comment indicates AI SDK integration path
- `lib/chat/types.ts`: legacy AI SDK type definitions — marked for removal when AI SDK implemented
- `types/chat.ts`: duplicate of `types/index.ts` — consolidate when refactoring

Future builders: when implementing AI SDK, you can safely delete these after confirming no imports reference them (use `grep -r "from.*provider\|from.*types\.ts\|from.*chat\.ts"` to check).

### Build validation

After cleanup:
```bash
npm run build
```

All TypeScript should pass and PWA service worker should compile without errors.