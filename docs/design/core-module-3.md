# Core Module 3: Generative UI Pipes (Vercel AI SDK)

> The standardized streaming channel from server to client for AI responses

---

## Current State

**No AI SDK is installed.** The current UI renders static dummy content. There is no streaming infrastructure, no state management for conversations, no server actions, and no TypeScript interfaces for message types. Team members cannot build agents or tools without this pipe existing first.

## Purpose

This module establishes the **communication contract** between the AI backend and the React frontend. Once merged, any team member can:
- Hook a new agent into the existing streaming pipe
- Render custom React components as part of AI responses
- Maintain conversation history with proper typing

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Client (React)                                       │
│                                                      │
│  useActions() ──→ submitUserMessage(text)            │
│                                                      │
│  useUIState() ←── [ReactNode, ReactNode, ...]       │
│  useAIState() ←── [{role, content}, ...]            │
└──────────────────────┬──────────────────────────────┘
                       │ Server Action (RSC)
┌──────────────────────▼──────────────────────────────┐
│ lib/chat/actions.tsx                                  │
│                                                      │
│  createStreamableUI() → streams React components     │
│  AIState ←→ UIState mapping                         │
│  Tool calls → render Generative UI components        │
└─────────────────────────────────────────────────────┘
```

## Type Definitions (`lib/chat/types.ts`)

```typescript
// The JSON-serializable state sent to the LLM
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolCallId?: string;
}

export type AIState = AIMessage[];

// The rendered React nodes displayed to the user
export interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  display: React.ReactNode;
}

export type UIState = UIMessage[];

// Source/Citation types used by Generative UI components
export interface Source {
  id: string;
  domain: string;
  title: string;
  url: string;
  trustBadge: 'verified-spatial' | 'legally-binding' | 'official-portal';
}

export interface Citation {
  number: number;
  label: string;
  sourceId: string;
}

// Tool result types
export interface BudgetData {
  allocated: number;
  disbursed: number;
  currency: string;
  fiscalYear: string;
  percentDisbursed: number;
}

export interface SpatialData {
  polylineId: string;
  roadName: string;
  lengthKm: number;
  conditionPercent: number;
  ward: string;
}

export interface EvidenceImage {
  id: string;
  thumbnailUrl: string;
  severity?: string;
  label?: string;
}
```

## Server Action Stub (`lib/chat/actions.tsx`)

```typescript
'use server';

import { createAI, createStreamableUI, getMutableAIState } from 'ai/rsc';
import type { AIState, UIState, AIMessage } from './types';

async function submitUserMessage(content: string): Promise<{ id: string; display: React.ReactNode }> {
  'use server';

  const aiState = getMutableAIState<AIState>();

  // Append user message
  aiState.update([...aiState.get(), { id: crypto.randomUUID(), role: 'user', content }]);

  const ui = createStreamableUI();

  // TODO: Replace with actual LLM call + tool routing
  // For now, simulate a 1-second delay and return a placeholder
  setTimeout(() => {
    ui.done(<div className="font-serif text-base leading-relaxed text-gray-800">
      Placeholder response for: {content}
    </div>);
  }, 1000);

  return { id: crypto.randomUUID(), display: ui.value };
}

export const AI = createAI<AIState, UIState>({
  actions: { submitUserMessage },
  initialAIState: [],
  initialUIState: [],
});
```

## Provider Setup (`lib/chat/provider.tsx`)

```typescript
'use client';

import { AI } from './actions';

export function ChatProvider({ children }: { children: React.ReactNode }) {
  return <AI>{children}</AI>;
}
```

## Integration with Layout

```typescript
// app/layout.tsx — wrap children with ChatProvider
import { ChatProvider } from '@/lib/chat/provider';

// Inside RootLayout:
<ChatProvider>
  <main>{children}</main>
</ChatProvider>
```

## Generative UI Tool Mapping

When the LLM calls a tool, the streaming pipe renders the corresponding React component:

| Tool Call | Rendered Component | Props Source |
|-----------|-------------------|--------------|
| `get_budget_data` | `<FinancialBar />` | `BudgetData` |
| `get_spatial_data` | `<MapView />` | `SpatialData` |
| `get_evidence_images` | `<EvidenceGallery />` | `EvidenceImage[]` |
| `search_tenders` | `<SourceCarousel />` | `Source[]` |
| `suggest_actions` | `<ActionBlock />` | action list |

## Critical Gaps to Fix

1. **No `ai` or `@ai-sdk/react` packages installed** — Must add before any streaming work begins.
2. **No error boundary for streaming failures** — If the stream breaks mid-response, the UI will crash. Need a `<StreamErrorBoundary>` component.
3. **No loading/skeleton states** — The shimmer placeholders from `ui-design.md` need to be wired into `createStreamableUI()` as the initial state before content arrives.
4. **No conversation persistence** — AIState is ephemeral. Must define how/when to persist to IndexedDB (Module 4 dependency).
5. **No rate limiting or input validation** — The server action accepts raw strings. Must sanitize and rate-limit before hitting LLM APIs.
6. **No abort/cancel mechanism** — User should be able to cancel a streaming response. `AbortController` integration needed.
7. **No token counting** — No way to know if a conversation exceeds context window. Need a utility to estimate token count.

## Implementation Steps

1. `npm install ai@4.3.0 @ai-sdk/react@1.2.0 @ai-sdk/openai@1.3.0`
2. Create `lib/chat/types.ts` with all interfaces
3. Create `lib/chat/actions.tsx` with dummy streaming server action
4. Create `lib/chat/provider.tsx` wrapping `createAI`
5. Wrap `app/layout.tsx` children with `<ChatProvider>`
6. Update `components/chat/input-bar.tsx` to call `submitUserMessage`
7. Update `components/chat/message-feed.tsx` to render from `useUIState()`

## Dependencies to Add

```json
{
  "ai": "4.3.0",
  "@ai-sdk/react": "1.2.0",
  "@ai-sdk/openai": "1.3.0"
}
```

## Environment Variables Required

```env
OPENAI_API_KEY=sk-...
# Or alternative provider
ANTHROPIC_API_KEY=sk-ant-...
```
