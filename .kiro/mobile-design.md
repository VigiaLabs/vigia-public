# VIGIA Search — Mobile & Generative UI Design Specification

> Responsive overhaul + GovTech "Generative UI" components for citizen field use

---

## 1. Design Context

VIGIA Search must be usable by citizens on smartphones in the field — checking road conditions, verifying budgets, escalating issues. This spec covers:

1. **Mobile-responsive layout** (sidebar drawer, adaptive input bar)
2. **Five GovTech Generative UI components** that render inline within AI answers

All components maintain the Perplexity Light Mode aesthetic: off-white backgrounds, minimal borders, Inter for UI, Merriweather for AI text.

---

## 2. Responsive Layout Overhaul

### 2.1 Breakpoint Strategy

| Breakpoint | Sidebar | Content Width | Map Behavior | Input Bar |
|------------|---------|---------------|--------------|-----------|
| `<md` (mobile) | Hidden → Sheet drawer | Full width, px-4 | Inline block (h-64) | Full width, px-4 |
| `md–lg` (tablet) | Hidden → Sheet drawer | max-w-3xl centered | Inline block (h-64) | max-w-3xl centered |
| `≥lg` (desktop) | Fixed 260px visible | max-w-3xl (or 60% when map active) | Sticky right 40% panel | max-w-3xl centered |

### 2.2 Mobile Sidebar (Sheet Drawer)

**Trigger:** Hamburger icon (`Menu` from lucide-react) in top-left of main content area, visible only on `<md` screens.

**Implementation:** Use shadcn/ui `Sheet` component (side="left").

```
Trigger Button:
  Position:        fixed top-4 left-4 z-30 (md:hidden)
  Style:           h-9 w-9 rounded-lg bg-white border border-gray-200 shadow-sm
  Icon:            Menu (h-5 w-5 text-gray-600)

Sheet Content:
  Width:           w-[280px]
  Background:      bg-sidebar-bg (#f0efed)
  Content:         Same sidebar content (branding, new thread, history, user profile)
  Animation:       Slide in from left (default Sheet behavior)
```

**Desktop behavior:** Sidebar remains fixed at 260px as before. The hamburger button is hidden via `md:hidden`.

### 2.3 Main Content Area Responsive

```
Desktop (≥md):     ml-[260px] (offset for fixed sidebar)
Mobile (<md):      ml-0 (no offset, sidebar is overlay)
```

### 2.4 Floating Input Bar — Responsive

```
Desktop (≥md):
  Position:        fixed bottom-6 left-[260px] right-0
  Container:       max-w-3xl mx-auto px-6
  Shape:           rounded-full

Mobile (<md):
  Position:        fixed bottom-4 left-0 right-0
  Container:       w-full px-4
  Shape:           rounded-full
  Submit Button:   h-10 w-10 (larger for thumb tap)
```

---

## 3. Generative UI Components

### 3.1 Spatial-Split Map View (`components/ui/map-view.tsx`)

A map panel that adapts between split-view (desktop) and inline (mobile).

#### Desktop Layout (≥lg, when map is active)

```
┌──────────────────────────────────────────────────────┐
│ Sidebar │ Chat Content (60%)  │  Map Panel (40%)     │
│  260px  │ max-w-none          │  sticky top-0 h-screen│
│         │                     │  border-l border-gray-200│
└──────────────────────────────────────────────────────┘
```

**Chat area adjustment:**
```
Default:         max-w-3xl mx-auto
With map active: lg:w-[60%] lg:max-w-none lg:pr-6
```

**Map panel:**
```
Position:        sticky top-0 right-0 h-screen
Width:           lg:w-[40%]
Background:      bg-gray-50
Border:          border-l border-gray-200
Content:         Placeholder grid + floating label
Visibility:      hidden on <lg, visible on ≥lg
```

#### Mobile/Tablet Layout (<lg)

```
Position:        inline within chat feed (not sticky)
Width:           w-full
Height:          h-64
Border Radius:   rounded-xl
Background:      bg-gray-50 with subtle grid pattern
Border:          border border-gray-200
Margin:          my-4
```

#### Map Placeholder Visuals

```tsx
<div className="relative overflow-hidden rounded-xl bg-gray-50 border border-gray-200">
  {/* Grid pattern background */}
  <div className="absolute inset-0 opacity-20"
    style={{ backgroundImage: 'linear-gradient(#e5e5e5 1px, transparent 1px), linear-gradient(90deg, #e5e5e5 1px, transparent 1px)', backgroundSize: '20px 20px' }}
  />
  
  {/* Floating label */}
  <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 shadow-sm border border-gray-100">
    <span className="text-sm">📍</span>
    <span className="text-xs font-medium text-gray-700">SH-15 Polyline Data</span>
  </div>
  
  {/* Simulated route line */}
  <svg className="absolute inset-0 w-full h-full">
    <path d="M 20,120 Q 80,40 160,100 T 320,80" stroke="#3b82f6" strokeWidth="3" fill="none" strokeDasharray="8,4" opacity="0.6" />
  </svg>
</div>
```

---

### 3.2 Semantic Trust Badges (Source Card Enhancement)

Added to existing `source-carousel.tsx` cards, below the title.

#### Badge Variants

| Source Type | Badge Text | Colors |
|-------------|-----------|--------|
| PM Gati Shakti | "Verified Spatial Data" | `bg-green-100 text-green-800` |
| RTI Response | "Legally Binding" | `bg-blue-100 text-blue-800` |
| NHAI Tender | "Legally Binding" | `bg-blue-100 text-blue-800` |
| Smart Cities Dashboard | "Official Portal" | `bg-amber-100 text-amber-800` |

#### Badge Styling

```tsx
<span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 mt-1.5">
  Verified Spatial Data
</span>
```

**Specs:**
```
Shape:           rounded-full
Padding:         px-1.5 py-0.5
Font Size:       text-[10px]
Font Weight:     font-medium
Margin:          mt-1.5 (below title)
```

---

### 3.3 VLM Evidence Gallery (`components/chat/evidence-gallery.tsx`)

Renders below a paragraph in the AI answer — shows visual evidence from Vision-Language Model analysis.

#### Layout

```
Container:       grid grid-cols-2 md:grid-cols-3 gap-2 my-4
```

#### Individual Thumbnail

```tsx
<div className="relative aspect-[4/3] rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
  <ImageIcon className="h-8 w-8 text-gray-300" />
</div>
```

**Specs:**
```
Aspect Ratio:    aspect-[4/3]
Border Radius:   rounded-lg
Background:      bg-gray-100
Border:          border border-gray-200
Icon:            ImageIcon h-8 w-8 text-gray-300 (placeholder)
```

#### Severity Overlay (on first thumbnail)

```tsx
<div className="absolute bottom-2 left-2 right-2">
  <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
    <AlertTriangle className="h-3 w-3" />
    iRAP Severity: High — Surface Roughness
  </span>
</div>
```

**Overlay Specs:**
```
Position:        absolute bottom-2 left-2 right-2
Background:      bg-red-600
Text:            text-[10px] font-semibold text-white
Shape:           rounded-full
Padding:         px-2 py-1
Icon:            AlertTriangle h-3 w-3
Shadow:          shadow-sm
```

---

### 3.4 Financial Progress Bar (`components/chat/financial-bar.tsx`)

Inline budget visualization within the AI answer text.

#### Layout

```
Container:       my-4 p-4 rounded-xl bg-white border border-gray-200
```

#### Structure

```tsx
<div className="my-4 rounded-xl border border-gray-200 bg-white p-4">
  {/* Labels */}
  <div className="flex justify-between text-xs font-sans text-gray-600 mb-2">
    <span>Disbursed: <strong className="text-gray-900">₹1.8 Cr</strong></span>
    <span>Allocated: <strong className="text-gray-900">₹4.2 Cr</strong></span>
  </div>
  
  {/* Progress Bar */}
  <div className="h-2 w-full rounded-full bg-gray-100">
    <div className="h-2 rounded-full bg-gray-800" style={{ width: '43%' }} />
  </div>
  
  {/* Percentage label */}
  <p className="mt-1.5 text-[10px] text-gray-400 font-sans">43% disbursed as of Q3 FY25</p>
</div>
```

**Specs:**
```
Container:       rounded-xl border border-gray-200 bg-white p-4
Track:           h-2 w-full rounded-full bg-gray-100
Fill:            h-2 rounded-full bg-gray-800 (institutional dark)
Fill Width:      Calculated as percentage (disbursed/allocated)
Labels:          text-xs font-sans text-gray-600
Values:          font-bold text-gray-900
Sub-label:       text-[10px] text-gray-400
```

---

### 3.5 Civic Action CTA Block (`components/chat/action-block.tsx`)

Rendered at the bottom of the AI response, clearly separated.

#### Layout

```tsx
<div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
  <p className="text-sm font-sans text-gray-600 mb-3">
    Based on this verified audit, you can take official action:
  </p>
  <div className="flex flex-wrap gap-2">
    {/* Primary CTA */}
    <button className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700 transition-colors">
      <Shield className="h-3.5 w-3.5" />
      Escalate to NHAI PIU
    </button>
    {/* Secondary CTA */}
    <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
      <Mail className="h-3.5 w-3.5" />
      Notify Local Ward Member
    </button>
  </div>
</div>
```

**Specs:**
```
Container:
  Background:    bg-gray-50
  Border:        border border-gray-200
  Radius:        rounded-xl
  Padding:       p-4
  Margin:        mt-6 (clear separation from answer text)

Description:
  Font:          font-sans text-sm text-gray-600
  Margin:        mb-3

Primary Button:
  Background:    bg-gray-900 hover:bg-gray-700
  Text:          text-xs font-medium text-white
  Radius:        rounded-lg
  Padding:       px-3 py-2
  Icon:          Shield h-3.5 w-3.5

Secondary Button:
  Background:    bg-white hover:bg-gray-50
  Border:        border border-gray-300
  Text:          text-xs font-medium text-gray-700
  Radius:        rounded-lg
  Padding:       px-3 py-2
  Icon:          Mail h-3.5 w-3.5

Button Container:
  Layout:        flex flex-wrap gap-2
```

---

## 4. Component Injection Order in AI Response

The AI answer block should render components in this order:

```
1. Source Carousel (with trust badges)
2. AI Answer Paragraph 1 (serif, with citation pills)
3. Financial Progress Bar (inline after budget mention)
4. AI Answer Paragraph 2 (serif, with citation pills)
5. VLM Evidence Gallery (visual evidence)
6. Map View (inline on mobile, split on desktop)
7. Civic Action CTA Block (bottom of response)
```

---

## 5. Updated File Structure

```
components/
├── layout/
│   ├── sidebar.tsx              # Updated: extracted content for reuse
│   └── mobile-sidebar.tsx       # New: Sheet-based drawer for mobile
├── chat/
│   ├── header.tsx               # Updated: hamburger trigger on mobile
│   ├── message-feed.tsx         # Updated: integrates all generative UI
│   ├── citation-pill.tsx        # Unchanged
│   ├── source-carousel.tsx      # Updated: trust badges added
│   ├── evidence-gallery.tsx     # New: VLM thumbnail grid
│   ├── financial-bar.tsx        # New: budget progress visualization
│   ├── action-block.tsx         # New: civic escalation CTAs
│   └── input-bar.tsx            # Updated: responsive width
├── ui/
│   ├── map-view.tsx             # New: spatial-split map component
│   └── sheet.tsx                # shadcn/ui Sheet (for mobile sidebar)
app/
├── layout.tsx                   # Updated: responsive sidebar logic
├── page.tsx                     # Updated: split layout when map active
└── globals.css                  # Unchanged
```

---

## 6. Responsive Behavior Summary

### Mobile (<md, 0–767px)
- Sidebar hidden, accessible via hamburger → Sheet drawer
- Content full-width with px-4 padding
- Source cards scroll horizontally (same)
- Map renders inline as h-64 rounded block
- Evidence gallery: 2 columns
- Input bar: full-width px-4, larger submit button (h-10 w-10)
- Action block buttons stack if needed (flex-wrap)

### Tablet (md–lg, 768–1023px)
- Sidebar hidden, accessible via hamburger → Sheet drawer
- Content centered at max-w-3xl
- Map renders inline as h-64 rounded block
- Evidence gallery: 3 columns
- Input bar: max-w-3xl centered

### Desktop (≥lg, 1024px+)
- Sidebar fixed at 260px
- Content at max-w-3xl (or 60% when map active)
- Map: sticky right panel at 40% viewport width
- Evidence gallery: 3 columns
- Input bar: max-w-3xl centered, offset for sidebar

---

## 7. Animation Additions

### Map Panel Slide-In (Desktop)
```css
@keyframes slide-in-right {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```
**Duration:** 0.3s ease-out

### Evidence Gallery Thumbnails
```
Each thumbnail fades in with stagger:
  animation: fade-in-up 0.3s ease-out forwards
  Delay: index * 100ms
```

### Financial Bar Fill
```css
@keyframes fill-bar {
  from { width: 0%; }
  to { width: var(--fill-width); }
}
```
**Duration:** 0.8s ease-out, delay 0.2s (appears after container renders)

### Action Block Entrance
```
animation: fade-in-up 0.4s ease-out forwards
delay: 400ms (appears last in sequence)
```

---

## 8. Accessibility Additions

- Hamburger button: `aria-label="Open navigation menu"`
- Sheet: proper focus trap and `aria-modal="true"`
- Map placeholder: `role="img" aria-label="Map showing SH-15 road polyline data"`
- Evidence gallery images: `alt` text describing placeholder state
- Financial bar: `role="progressbar" aria-valuenow={43} aria-valuemin={0} aria-valuemax={100}`
- Action buttons: clear, descriptive text (no icon-only buttons)
- Trust badges: included in source card's accessible name
