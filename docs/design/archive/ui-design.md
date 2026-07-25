# VIGIA Search — UI Design Specification

> A Perplexity-style GovTech auditing engine: "Perplexity for Government Infrastructure"

---

## 1. Design Philosophy

### Core Aesthetic: "Perplexity Light Mode"
This is NOT a ChatGPT clone or a SaaS dashboard. It is a **modern, minimalist knowledge-article platform** that feels editorial, rigorous, and trustworthy — like reading a well-cited research paper in a beautiful interface.

### Key Principles
- **Calm & Authoritative**: Soft backgrounds, generous whitespace, no visual noise
- **Citation-First**: Every claim is visibly sourced — citation pills are the UI's hallmark
- **Editorial Typography**: AI-generated content uses serif fonts to convey rigor and credibility
- **Minimal Chrome**: UI elements recede; content dominates

---

## 2. Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14+ (App Router) |
| Styling | Tailwind CSS |
| Components | shadcn/ui (radix-ui primitives) |
| Icons | lucide-react |
| UI Font | Inter (via `next/font/google`) |
| Content Font | Merriweather (via `next/font/google`) |

---

## 3. Color System

### Backgrounds
```
Main Content Area:    bg-[#f9f9f8]   (soft off-white/cream)
Sidebar:             bg-[#f0efed]   (slightly darker warm gray)
Cards/Surfaces:      bg-white        (pure white for elevated cards)
Input Bar:           bg-white        (floating on cream background)
User Query Bubble:   bg-gray-100     (soft neutral gray)
Citation Pills:      bg-gray-200     (subtle gray pill)
```

### Text
```
Primary Text:        text-gray-900   (near-black for readability)
Secondary Text:      text-gray-600   (muted labels, metadata)
Tertiary Text:       text-gray-400   (timestamps, hints)
Citation Text:       text-gray-600   (small, sans-serif inside pills)
Link/Accent:         text-blue-600   (source links, interactive)
Brand "VIGIA":       text-gray-900   (bold weight)
Brand "Search":      text-gray-500   (normal weight)
```

### Borders & Shadows
```
Default Border:      border-gray-200       (extremely subtle)
Hover Border:        border-gray-300       (slight emphasis)
Card Shadow:         shadow-sm             (barely perceptible lift)
Input Shadow:        shadow-sm             (floating effect)
Elevated Shadow:     shadow-md             (modals, dropdowns only)
```

---

## 4. Typography

### Font Loading (next/font/google)
```tsx
import { Inter } from 'next/font/google'
import { Merriweather } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const merriweather = Merriweather({ 
  weight: ['300', '400', '700'],
  subsets: ['latin'], 
  variable: '--font-merriweather' 
})
```

### Usage Rules
| Context | Font | Weight | Size |
|---------|------|--------|------|
| All UI (sidebar, buttons, labels, inputs) | Inter (sans-serif) | 400–600 | text-sm to text-base |
| AI-generated answer paragraphs | Merriweather (serif) | 400 | text-base (16px), leading-relaxed |
| Citation pills (inside answer) | Inter (sans-serif) | 500 | text-xs |
| Source card titles | Inter (sans-serif) | 500 | text-sm |
| Sidebar history items | Inter (sans-serif) | 400 | text-sm |
| Section headings in answers | Merriweather (serif) | 700 | text-lg |

---

## 5. Layout Architecture

### Global Structure
```
┌─────────────────────────────────────────────────────┐
│ [Sidebar 260px fixed] │ [Main Content fluid]        │
│                       │                             │
│  VIGIA Search         │  ┌─────────────────────┐   │
│  [+ New Thread]       │  │ Sticky Header Tabs  │   │
│                       │  ├─────────────────────┤   │
│  ── History ──        │  │                     │   │
│  SH-15 Pothole...    │  │  max-w-3xl centered │   │
│  Ward 4 Contract...  │  │  content area       │   │
│  Bridge Audit Q3...  │  │                     │   │
│                       │  │  [Message Feed]     │   │
│                       │  │                     │   │
│                       │  └─────────────────────┘   │
│  ── Bottom ──         │                             │
│  [User Profile]       │  ┌─────────────────────┐   │
│                       │  │ Floating Input Bar  │   │
└─────────────────────────────────────────────────────┘
```

### Responsive Behavior
- **Desktop (≥1024px)**: Sidebar visible, content centered at max-w-3xl
- **Tablet (768–1023px)**: Sidebar collapses to icon-only or overlay
- **Mobile (<768px)**: Sidebar hidden behind hamburger, full-width content

---

## 6. Component Specifications

### 6.1 Sidebar (`components/layout/sidebar.tsx`)

```
Width:           w-[260px] fixed left-0 top-0 h-screen
Background:      bg-[#f0efed]
Border:          border-r border-gray-200
Padding:         p-4
```

**Sections:**

#### Branding (top)
```tsx
<div className="flex items-center gap-1 px-2 py-3">
  <span className="text-lg font-bold text-gray-900">VIGIA</span>
  <span className="text-lg font-normal text-gray-500">Search</span>
</div>
```

#### New Thread Button
```tsx
<Button variant="ghost" className="w-full justify-start gap-2 text-sm text-gray-600 hover:bg-gray-200/50">
  <Plus className="h-4 w-4" />
  New Thread
</Button>
```

#### History Section
```
Label:           text-xs font-medium text-gray-400 uppercase tracking-wide
Items:           text-sm text-gray-600 truncate, hover:bg-gray-200/40 rounded-lg px-2 py-1.5
Active Item:     bg-gray-200/60 text-gray-900
```

#### User Profile (bottom)
```
Position:        mt-auto (pushed to bottom)
Layout:          flex items-center gap-2
Avatar:          w-7 h-7 rounded-full bg-gray-300
Name:            text-sm text-gray-700
```

---

### 6.2 Sticky Header Tabs (`components/chat/header.tsx`)

```
Position:        sticky top-0 z-10
Background:      bg-[#f9f9f8]/80 backdrop-blur-sm
Border:          border-b border-gray-100
Padding:         px-6 py-3
Container:       max-w-3xl mx-auto
```

**Tabs:**
```tsx
// Tabs: "Answer" | "Sources" | "Maps"
<div className="flex items-center gap-6">
  <button className="text-sm font-medium text-gray-900 border-b-2 border-gray-900 pb-1">Answer</button>
  <button className="text-sm font-medium text-gray-400 hover:text-gray-600 pb-1">Sources</button>
  <button className="text-sm font-medium text-gray-400 hover:text-gray-600 pb-1">Maps</button>
</div>
```

---

### 6.3 Message Feed (`components/chat/message-feed.tsx`)

**Container:**
```
max-w-3xl mx-auto px-6 py-8
```

#### User Query Bubble
```tsx
<div className="flex justify-center mb-8">
  <div className="bg-gray-100 rounded-2xl px-5 py-2.5 text-sm font-sans text-gray-800 max-w-lg">
    What is the current budget allocation for SH-15 pothole repairs in Ward 12?
  </div>
</div>
```

#### AI Answer Block
```tsx
<div className="prose prose-gray font-serif leading-relaxed text-base text-gray-800">
  <p>
    The Municipal Corporation allocated ₹4.2 crore for SH-15 pothole repairs 
    in FY 2024-25 <CitationPill number={1} label="NHAI Tender 12" />, 
    representing a 23% increase from the previous fiscal year. However, 
    RTI data reveals only ₹1.8 crore was disbursed by Q3 
    <CitationPill number={2} label="RTI/MC/2024/1847" />.
  </p>
</div>
```

**Answer block styling:**
```
Font:            font-merriweather (serif)
Size:            text-base (16px)
Line Height:     leading-relaxed (1.75)
Color:           text-gray-800
Paragraph Gap:   space-y-4
```

---

### 6.4 Citation Pills (inline in answer text)

The **hallmark** UI element. Small pill-shaped badges inline with text.

```tsx
<span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-sans font-medium text-gray-600 cursor-pointer hover:bg-gray-300 transition-colors">
  <span className="mr-1 text-[10px] font-semibold text-gray-500">1</span>
  NHAI Tender 12
</span>
```

**Specs:**
```
Shape:           rounded-full
Background:      bg-gray-200 (hover: bg-gray-300)
Padding:         px-2 py-0.5
Font:            font-sans (Inter) — ALWAYS sans even inside serif text
Size:            text-xs
Color:           text-gray-600
Number Badge:    text-[10px] font-semibold text-gray-500 mr-1
Transition:      transition-colors duration-150
Vertical Align:  inline-flex items-center (aligns with text baseline)
```

---

### 6.5 Source Cards Carousel (`components/chat/source-carousel.tsx`)

Positioned **above** the AI answer, showing where information was retrieved from.

```
Container:       flex gap-3 overflow-x-auto pb-4 mb-6 scrollbar-hide
```

**Individual Card:**
```tsx
<div className="flex-shrink-0 w-[200px] rounded-xl border border-gray-200 bg-white p-3 hover:shadow-sm transition-shadow cursor-pointer">
  <div className="flex items-center gap-2 mb-1.5">
    <FileText className="h-4 w-4 text-gray-400" />
    <span className="text-xs text-gray-400 truncate">nhai.gov.in</span>
  </div>
  <p className="text-sm font-medium text-gray-700 line-clamp-2">
    PM Gati Shakti Layer — SH-15 Corridor Plan
  </p>
</div>
```

**Card Specs:**
```
Width:           w-[200px] flex-shrink-0
Border:          border border-gray-200
Radius:          rounded-xl
Background:      bg-white
Padding:         p-3
Hover:           hover:shadow-sm transition-shadow
Icon:            h-4 w-4 text-gray-400 (FileText, Globe, or PDF icon)
Domain Text:     text-xs text-gray-400
Title Text:      text-sm font-medium text-gray-700 line-clamp-2
```

---

### 6.6 Floating Input Bar (`components/chat/input-bar.tsx`)

Fixed to bottom, floating above the page.

```
Position:        fixed bottom-6 left-[260px] right-0 (accounts for sidebar)
Container:       max-w-3xl mx-auto px-6
```

**Input Element:**
```tsx
<div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-3 shadow-sm">
  {/* Focus Dropdown */}
  <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
    <Focus className="h-4 w-4" />
    <span>Focus</span>
    <ChevronDown className="h-3 w-3" />
  </button>
  
  {/* Divider */}
  <div className="h-5 w-px bg-gray-200" />
  
  {/* Text Input */}
  <input 
    className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
    placeholder="Ask a follow-up about this budget..."
  />
  
  {/* Submit Button */}
  <button className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-700 transition-colors">
    <ArrowUp className="h-4 w-4" />
  </button>
</div>
```

**Specs:**
```
Shape:           rounded-full
Border:          border border-gray-200
Background:      bg-white
Shadow:          shadow-sm
Padding:         px-4 py-3
Submit Button:   h-8 w-8 rounded-full bg-gray-900 text-white
Placeholder:     text-sm text-gray-400
```

---

## 7. Animations & Micro-interactions

### 7.1 Answer Streaming Animation (Perplexity-style)

When the AI answer appears, it should **fade in paragraph by paragraph** with a subtle upward motion:

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.answer-paragraph {
  animation: fadeInUp 0.4s ease-out forwards;
  opacity: 0;
}

/* Stagger each paragraph */
.answer-paragraph:nth-child(1) { animation-delay: 0ms; }
.answer-paragraph:nth-child(2) { animation-delay: 150ms; }
.answer-paragraph:nth-child(3) { animation-delay: 300ms; }
```

**Tailwind equivalent:**
```tsx
<p className="animate-in fade-in slide-in-from-bottom-2 duration-400" style={{ animationDelay: '0ms' }}>...</p>
<p className="animate-in fade-in slide-in-from-bottom-2 duration-400" style={{ animationDelay: '150ms' }}>...</p>
```

### 7.2 Source Cards Entrance

Cards slide in from the left with staggered timing:

```css
@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

**Stagger:** Each card delays by 80ms (card 1: 0ms, card 2: 80ms, card 3: 160ms, etc.)

### 7.3 Citation Pill Hover

```
Default:         bg-gray-200
Hover:           bg-gray-300, scale(1.02)
Transition:      transition-all duration-150
```

On hover, optionally show a tooltip with the full source title and a "View Source" link.

### 7.4 Input Bar Focus State

```
Default:         border-gray-200 shadow-sm
Focused:         border-gray-300 shadow-md ring-1 ring-gray-200
Transition:      transition-all duration-200
```

### 7.5 Sidebar History Item Hover

```
Default:         bg-transparent
Hover:           bg-gray-200/40 rounded-lg
Active:          bg-gray-200/60
Transition:      transition-colors duration-150
```

### 7.6 Typing Indicator (while "searching")

Three pulsing dots in serif font area before answer appears:

```tsx
<div className="flex items-center gap-1.5 py-4">
  <div className="h-2 w-2 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '0ms' }} />
  <div className="h-2 w-2 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '150ms' }} />
  <div className="h-2 w-2 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '300ms' }} />
</div>
```

### 7.7 "Searching Sources" Shimmer

Before source cards load, show shimmer placeholders:

```tsx
<div className="flex gap-3">
  {[...Array(4)].map((_, i) => (
    <div key={i} className="flex-shrink-0 w-[200px] h-[72px] rounded-xl bg-gray-200 animate-pulse" />
  ))}
</div>
```

### 7.8 Page/Thread Transition

When switching threads in sidebar:
```
Content area:    fade-out (150ms) → fade-in (200ms)
Source cards:    slide out left → slide in from right
```

---

## 8. File Structure

```
vigia-public/
├── app/
│   ├── layout.tsx              # Root layout with sidebar + main area
│   ├── page.tsx                # Main chat page (static demo)
│   └── globals.css             # Tailwind directives + custom animations
├── components/
│   ├── layout/
│   │   └── sidebar.tsx         # Fixed left sidebar
│   ├── chat/
│   │   ├── header.tsx          # Sticky tabs (Answer/Sources/Maps)
│   │   ├── message-feed.tsx    # User bubble + AI answer container
│   │   ├── citation-pill.tsx   # Reusable inline citation badge
│   │   ├── source-carousel.tsx # Horizontal source cards
│   │   └── input-bar.tsx       # Floating bottom input
│   └── ui/                     # shadcn/ui components (button, input, scroll-area)
├── lib/
│   └── fonts.ts                # Font configuration (Inter + Merriweather)
├── tailwind.config.ts
├── next.config.js
└── package.json
```

---

## 9. Tailwind Configuration Extensions

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-merriweather)', 'Georgia', 'serif'],
      },
      colors: {
        cream: '#f9f9f8',
        'sidebar-bg': '#f0efed',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.4s ease-out forwards',
        'slide-in-left': 'slide-in-left 0.3s ease-out forwards',
      },
    },
  },
}
```

---

## 10. Spacing & Sizing Reference

| Element | Value |
|---------|-------|
| Sidebar width | 260px |
| Content max-width | max-w-3xl (768px) |
| Content horizontal padding | px-6 |
| Content vertical padding | py-8 |
| Source card width | 200px |
| Source card gap | gap-3 (12px) |
| Input bar bottom offset | bottom-6 (24px) |
| Input bar border radius | rounded-full |
| Submit button size | h-8 w-8 |
| Citation pill padding | px-2 py-0.5 |
| Paragraph spacing | space-y-4 |
| Answer line-height | leading-relaxed (1.75) |

---

## 11. Accessibility Requirements

- All interactive elements must have visible focus rings (`focus-visible:ring-2 ring-gray-400`)
- Citation pills must be keyboard-navigable (use `<button>` or `role="button"`)
- Sidebar history items must be navigable via arrow keys
- Input bar must trap focus appropriately
- Color contrast: all text meets WCAG AA (4.5:1 for body, 3:1 for large text)
- Source cards must have `aria-label` describing the source
- Animations respect `prefers-reduced-motion` media query

---

## 12. Dummy Content for Static Scaffold

### User Query
> "What is the current budget allocation for SH-15 pothole repairs in Ward 12?"

### Source Cards (4 items)
1. 📄 `nhai.gov.in` — "PM Gati Shakti Layer — SH-15 Corridor Plan"
2. 📄 `rti.gov.in` — "RTI Response MC/2024/1847 — Road Maintenance"
3. 📄 `eprocure.gov.in` — "NHAI Tender #12 — Pothole Remediation Contract"
4. 📄 `smartcities.gov.in` — "Ward 12 Infrastructure Dashboard Q3 FY25"

### AI Answer (with citations)
> The Municipal Corporation allocated ₹4.2 crore for SH-15 pothole repairs in FY 2024-25 `[1: NHAI Tender 12]`, representing a 23% increase from the previous fiscal year. However, RTI data reveals only ₹1.8 crore was disbursed by Q3 `[2: RTI/MC/2024/1847]`.
>
> The Gati Shakti spatial layer confirms that 12.4 km of SH-15 falls within Ward 12 boundaries `[3: PM Gati Shakti Layer]`, with 67% classified as "poor condition" in the latest survey. The Smart Cities dashboard shows 3 active tenders for this stretch, but none have progressed beyond the "Technical Evaluation" stage `[4: Ward 12 Dashboard]`.

### Sidebar History
- "SH-15 Pothole Budget"
- "Ward 4 Contractor Audit"
- "Bridge Safety Compliance Q3"
- "Drainage Fund Utilization"
- "Smart City Mission — Phase 2"

---

## 13. Implementation Priority

1. **Phase 1 (Static Shell)**: Layout, sidebar, fonts, colors — get the "feel" right
2. **Phase 2 (Components)**: Source cards, citation pills, input bar — build the vocabulary
3. **Phase 3 (Animations)**: Fade-in-up, stagger, shimmer — bring it to life
4. **Phase 4 (Interactivity)**: Tab switching, sidebar navigation, input focus states
