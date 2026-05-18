# CONTRIBUTING.md

## VIGIA Engineering Rules

This repository follows a strict modular architecture.
Do not place logic arbitrarily across the codebase.

---

## 1. Core Architecture

### app/
Routing and composition only.

Allowed:
- layouts
- providers
- route handlers
- page composition

Not allowed:
- database logic
- AI orchestration
- fetch logic
- tool execution
- business logic

---

### components/ui/
Reusable dumb UI primitives only.

Examples:
- Button
- Input
- Sheet
- ScrollArea

Rules:
- No API calls
- No AI logic
- No IndexedDB logic
- No direct imports from lib/agents or lib/db

---

### components/chat/
Chat-specific presentation components.

Examples:
- message-feed
- citation-pill
- evidence-gallery
- financial-bar

Rules:
- May consume typed props only
- No orchestration logic
- No direct fetch calls
- No model calls

---

### components/layout/
Navigation and layout shells only.

Examples:
- sidebar
- mobile-sidebar
- top navigation

---

### lib/chat/
Owns the AI streaming pipeline.

Responsibilities:
- AI state
- UI state
- server actions
- streaming
- model communication

Rules:
- No UI rendering logic
- No Tailwind styling
- No DOM access

---

### lib/agents/
Agent orchestration layer.

Responsibilities:
- routing
- planning
- tool selection
- multi-step reasoning

Rules:
- No React imports
- No browser APIs
- No Tailwind
- No UI components

---

### lib/tools/
Pure tool implementations.

Examples:
- RTI lookup
- tender search
- spatial data retrieval

Rules:
- Pure functions only
- No React
- No DOM
- No component imports

---

### lib/db/
Offline infrastructure and persistence layer.

Responsibilities:
- IndexedDB
- background sync
- caching
- evidence staging

Rules:
- Browser-safe only
- Export async functions only
- No React components

---

## 2. Import Boundaries

Allowed import direction:

UI
↓
chat pipe
↓
agents
↓
tools
↓
db / external APIs

Never reverse this direction.

Forbidden examples:
- components importing agents
- tools importing UI
- db importing components
- agents importing React components

---

## 3. Styling Rules

This project follows a strict editorial design system.

### Typography
- `font-serif` may be used only inside AI-generated answer blocks.
- `font-sans` must be used everywhere else.

Do not introduce additional fonts.

### Colors
Do not hardcode hex values in components.

Use semantic tokens from `app/globals.css`.

Example:
- `text-text-primary`
- `bg-surface`
- `border-border`

Not:
- `text-gray-900`
- `bg-white`

### Shadows
Allowed:
- `shadow-sm`
- `shadow-md`
- `shadow-lg`

Do not create custom shadow systems unless explicitly approved.

---

## 4. State Management

AI state must flow through:
- `lib/chat/actions.tsx`
- `createAI()`
- `createStreamableUI()`

Do not create parallel chat state systems.

---

## 5. Offline Rules

All offline persistence must go through:
- `lib/db/offline-store.ts`

Never access IndexedDB directly from components.

---

## 6. Type Safety

Shared interfaces belong in:
- `types/`
- `lib/chat/types.ts`

Do not duplicate interfaces across modules.

---

## 7. File Naming

Use kebab-case for files.

Examples:
- `input-bar.tsx`
- `offline-store.ts`
- `citation-pill.tsx`

---

## 8. Branching

Never commit directly to main.

Branch format:
- core-foundation

---

## 9. Pull Requests

Every PR should:
- follow import boundaries
- avoid duplicated types
- avoid inline hardcoded styles
- avoid business logic in components

---

## 10. Engineering Principle

This project is not a dashboard.

The product should feel:
- editorial
- trustworthy
- minimal
- government-grade
- evidence-driven

Avoid:
- flashy SaaS UI patterns
- excessive gradients
- gamified UX
- unnecessary animations