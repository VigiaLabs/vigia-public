# Core Module 2: Design System & Typography Engine

> Locked-down styling system so no team member goes rogue with aesthetics

---

## Current State

Fonts (Inter + Merriweather) are configured in `app/layout.tsx` via `next/font/google` CSS variables. Tailwind v4 `@theme` block in `globals.css` defines custom colors (`cream`, `sidebar-bg`) and animations. However, there is no centralized design token file, no component variant system, and no documentation of the color/spacing/typography contract.

## Design Philosophy: "Perplexity Light Mode"

This is NOT ChatGPT. NOT a SaaS dashboard. It is a **minimalist knowledge-article platform** that feels editorial and trustworthy.

## Token Definitions (globals.css @theme)

### Colors — Already Defined ✓
```css
--color-cream: #f9f9f8;        /* Main content background */
--color-sidebar-bg: #f0efed;   /* Sidebar background */
```

### Colors — MISSING (Must Add)
```css
--color-surface: #ffffff;       /* Cards, elevated surfaces */
--color-border: #e5e7eb;       /* gray-200 equivalent */
--color-border-subtle: #f3f4f6; /* gray-100 for very subtle dividers */
--color-text-primary: #111827;  /* gray-900 */
--color-text-secondary: #4b5563; /* gray-600 */
--color-text-muted: #9ca3af;   /* gray-400 */
--color-accent: #1f2937;       /* gray-800 — institutional dark */
--color-trust-green: #dcfce7;  /* Trust badge bg */
--color-trust-blue: #dbeafe;   /* Legal badge bg */
--color-trust-amber: #fef3c7;  /* Official badge bg */
--color-severity-red: #dc2626; /* iRAP severity */
```

### Typography — Already Defined ✓
```css
--font-sans: var(--font-inter), system-ui, sans-serif;
--font-serif: var(--font-merriweather), Georgia, serif;
```

### Typography Rules (STRICT)

| Context | Font Variable | Tailwind Class | Weight | Size |
|---------|--------------|----------------|--------|------|
| All UI chrome | `--font-sans` | `font-sans` | 400–600 | text-sm to text-base |
| AI answer paragraphs | `--font-serif` | `font-serif` | 400 | text-base, leading-relaxed |
| AI answer headings | `--font-serif` | `font-serif` | 700 | text-lg |
| Citation pills (always) | `--font-sans` | `font-sans` | 500 | text-xs |
| Source card titles | `--font-sans` | `font-sans` | 500 | text-sm |
| Financial labels | `--font-sans` | `font-sans` | 400 | text-xs |

**RULE: `font-serif` is ONLY used inside AI-generated answer blocks. Nowhere else.**

### Animations — Already Defined ✓
```css
--animate-fade-in-up: fade-in-up 0.4s ease-out forwards;
--animate-slide-in-left: slide-in-left 0.3s ease-out forwards;
--animate-slide-in-right: slide-in-right 0.3s ease-out forwards;
--animate-fill-bar: fill-bar 0.8s ease-out 0.2s forwards;
```

### Spacing Scale (Use Tailwind defaults)
No custom spacing. Use standard Tailwind 4/8/12/16/24/32/48px scale.

### Border & Shadow Rules
```
Default border:    border-gray-200 (1px solid #e5e7eb)
Subtle border:     border-gray-100 (header dividers only)
Card shadow:       shadow-sm (barely visible)
Input focus:       shadow-md + ring-1 ring-gray-200
Elevated (modals): shadow-lg (rare)
```

### Border Radius Scale
```
Pills/badges:      rounded-full
Cards:             rounded-xl
Buttons:           rounded-lg
Input bar:         rounded-full
Containers:        rounded-xl
```

## Critical Gaps to Fix

1. **No semantic color tokens in @theme** — Team will hardcode hex values. Must add `--color-surface`, `--color-border`, `--color-text-*`, `--color-trust-*` to globals.css.
2. **No dark mode consideration** — Even if not implementing now, the token structure should support it. Use CSS variables so a future `@media (prefers-color-scheme: dark)` block can override.
3. **No component variant documentation** — Buttons have no defined variants (primary=`bg-gray-900 text-white`, outline=`border border-gray-300 bg-white`). Must document.
4. **No focus-visible styles** — Accessibility requires visible focus rings. Add global `focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2` to interactive elements.
5. **No `prefers-reduced-motion` for individual animations** — Currently blanket-disables all animations. Should allow essential transitions (opacity) while disabling transforms.

## Implementation Steps

1. Add missing color tokens to `globals.css` `@theme` block
2. Create `lib/utils.ts` with `cn()` helper (clsx + tailwind-merge pattern)
3. Document button variants: primary, outline, ghost, destructive
4. Add global focus-visible styles in globals.css
5. Refine reduced-motion to preserve opacity transitions

## Dependencies to Add

```json
{
  "tailwind-merge": "2.6.0"
}
```

(For the `cn()` utility that merges Tailwind classes without conflicts)
