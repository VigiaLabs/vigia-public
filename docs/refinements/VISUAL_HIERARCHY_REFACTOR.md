# Visual Hierarchy Refactor: Perplexity/Claude Aesthetic

## Overview

Refactored VIGIA from a dashboard-style interface to a calm, editorial-focused workspace inspired by Perplexity and Claude. Prioritizes reading comfort, reduced visual noise, and intelligence-focused design.

## Changes Made

### 1. Sidebar (components/layout/sidebar.tsx)

**Removed:**
- Status card with "ONLINE / Up to date" indicator
- Queue stats display (pending, synced, failed counts)
- Visual clutter from borders and backgrounds

**Kept:**
- VIGIA branding and subtitle
- New Search button
- Recent history list
- All routing and sync logic intact

**Visual Improvements:**
- Tighter header spacing (mb-6 instead of mb-8)
- Lighter subtitle text (from "Government Infrastructure" → "Infrastructure Intelligence")
- Cleaner button styling (removed extra padding)
- Reduced section label prominence ("Recent Searches" → "Recent")
- Removed gradients and excessive borders

### 2. Query History (components/layout/query-history.tsx)

**Removed:**
- Dashed borders around empty state
- Gradient backgrounds
- Semi-transparent overlays
- Excessive padding

**Updated:**
- History items now have minimal hover state (subtle bg-gray-900/5)
- Tighter spacing between items (space-y-0.5)
- Cleaner typography (removed font-medium from titles)
- Date and message count displayed inline
- Empty state is now a simple text label

### 3. Chat Shell (components/chat/chat-shell.tsx)

**Removed:**
- Sticky thread header with "Saved Search" indicator
- Border separator between header and messages
- Thread metadata display (creation date, message counts)
- Loading skeleton animation
- Backdrop blur effects

**Kept:**
- Thread loading state handling
- Error messages
- All message loading and sync logic

**Result:**
- Clean, distraction-free reading space
- Messages start immediately below input
- No visual hierarchy breaks

### 4. Message Feed (components/chat/message-feed.tsx)

**Removed:**
- Dark rounded boxes around user messages
- Heavy shadows on assistant messages
- Thick borders around messages
- Excessive padding

**Updated:**
- User messages: subtle gray backgrounds (bg-gray-100)
- Assistant messages: plain text on white with improved leading
- Removed rounded corners on user messages (rounded-lg instead of rounded-xl)
- Cleaner sync status indicators
- Tighter spacing (space-y-6 for breathing room, not visual separation)
- Max width reduced to 3xl for better readability

### 5. Input Bar (components/chat/input-bar.tsx)

**Removed:**
- Focus dropdown button with Crosshair icon
- Divider separator
- Helper text at bottom ("Shift + Enter for new line")
- Excessive shadows and ring effects
- Rounded-full send button

**Updated:**
- Clean input container with subtle border
- Removed placeholder complexity ("Ask about roads, tenders..." → "Ask about infrastructure...")
- Simpler offline banner (no border, no shadow, no backdrop blur)
- Streamlined button styling (rounded-md instead of rounded-full)
- Cleaner focus states

**Kept:**
- Keyboard shortcuts work identically
- Offline functionality and message queuing
- Sync status indicators on messages

### 6. Mobile Sidebar (components/layout/mobile-sidebar.tsx)

**Updated:**
- Removed border from menu button
- Removed shadow from menu button
- Cleaner hover states

### 7. PWA Install Badge (components/ui/pwa-install-badge.tsx)

**Removed:**
- Gradient header
- Heavy shadows
- Excessive visual weight

**Updated:**
- Simple white card with subtle border
- Minimal spacing and padding
- Clean button styling
- Icon and text only, no extra decoration

### 8. Color Palette (app/globals.css)

**Adjusted:**
- `--color-cream`: #fafaf8 (lighter, warmer)
- `--color-sidebar-bg`: #f5f3f0 (more neutral)
- `--color-text-primary`: #0f0f0f (darker, better contrast)
- `--color-text-secondary`: #525252 (adjusted)
- `--color-text-muted`: #a0a0a0 (lighter muted tone)

## Design Principles Applied

### 1. **Editorial Reading Experience**
- Messages render as clean text on white/light backgrounds
- Large, comfortable line height
- Typography does the heavy lifting
- No visual distractions

### 2. **Spacing > Borders**
- Vertical spacing creates separation, not hard lines
- Subtle background contrast (gray-100 for user bubbles)
- Removed nearly all border elements
- Breathing room via generous spacing

### 3. **Minimal Color Usage**
- Grayscale for primary UI (no gradients)
- Color reserved for status/feedback (amber for offline, red for errors)
- Intelligence-focused aesthetic
- Clean, professional appearance

### 4. **Reduced Visual Weight**
- Smaller rounded corners (md instead of xl/2xl)
- Fewer shadows
- Simpler button styling
- Lighter typography weights

### 5. **Preserved Functionality**
- All routing remains unchanged
- Offline-first behavior intact
- Thread loading and sync mechanism untouched
- Message queuing works identically
- Background sync preserved

## Files Modified

| File | Changes |
|------|---------|
| `components/layout/sidebar.tsx` | Removed status card, tightened spacing |
| `components/layout/query-history.tsx` | Simplified empty state, cleaner items |
| `components/chat/chat-shell.tsx` | Removed thread header |
| `components/chat/message-feed.tsx` | Cleaner messages, better reading |
| `components/chat/input-bar.tsx` | Simplified, removed focus dropdown |
| `components/layout/mobile-sidebar.tsx` | Removed button borders |
| `components/ui/pwa-install-badge.tsx` | Cleaner card design |
| `app/globals.css` | Adjusted color palette |

## Testing Checklist

- [x] Build completes without errors
- [x] TypeScript passes
- [x] All routing works (`/` and `/t/[threadId]`)
- [x] Offline functionality intact
- [x] Message sending and queuing works
- [x] History loads correctly
- [x] Mobile sidebar functions properly
- [x] PWA badge displays cleanly

## Before/After Comparison

### Before (Dashboard-style)
- Heavy status cards with multiple indicators
- Thick borders separating sections
- Rounded xl corners with shadows
- Gradient backgrounds
- Dense, widget-like appearance
- Visual noise competing with content

### After (Editorial-style)
- Focused reading workspace
- Minimal visual separators (spacing only)
- Clean, modern typography
- Subtle backgrounds
- Calm, intelligence-focused appearance
- Content is the focus, UI stays invisible

## Future Enhancements

- Consider soft background color (cream) on message container for very light definition
- Add subtle hover effects on history items for better affordance
- Consider a "cite" or "copy" quick action on assistant messages
- Add smooth scroll to latest message on new response
