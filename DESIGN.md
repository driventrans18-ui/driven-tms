# Driven TMS — Design System

**Version:** 0.1 (foundation, pre-refactor)
**Companions:** `AUDIT.md`, `SCHEMA-NOTES.md`
**Consumed by:** `src/` (web, Tailwind v4), `ios-driver-app/src/` (Capacitor webview, Tailwind v4)

This document is the contract. Every refactored screen must consume tokens from
here instead of literal values. New components must match the specs in §5.

---

## 1. Brand principles

Driven Transportation is a one-truck owner-operator business. The product has
to feel **professional, trustworthy, and legible in a truck cab on a sunny
afternoon.** That dictates four principles, in priority order:

1. **Clarity over cleverness.** No decorative gradients, no animations that
   delay an action, no mystery icons. Every pixel earns its place.
2. **Content first.** Chrome (borders, shadows, dividers) is minimal. Loads,
   invoices, and documents are the product; the shell recedes.
3. **One accent, used meaningfully.** Driven orange is for primary actions and
   the brand mark, nothing else. Status and state have their own semantic
   colors. Do not decorate with orange.
4. **High contrast, always.** Sunlight, reading glasses, polarized shades in
   the cab. Body copy is ≥ 4.5:1 against its surface; large text ≥ 3:1.

Corollaries:
- No shadows deeper than `shadow-2`. Real elevation comes from contrast, not
  blur.
- No rounded corners over 16px on interactive elements. Over-rounded buttons
  read as toys.
- No icon-only buttons without an `aria-label`. Ever.

---

## 2. Color tokens

Tokens live in CSS custom properties on `:root`, with a dark-mode set on
`:root[data-theme="dark"]` (default to `prefers-color-scheme` if the user
hasn't chosen). Tailwind v4 `@theme` directive maps them to utility classes.

### 2.1 Light (default)

| Token | Value | Use |
|---|---|---|
| `--brand-500` | `#c8410a` | Primary CTAs, brand mark, logo tile |
| `--brand-600` | `#a5340a` | Brand hover, pressed |
| `--brand-100` | `#fbe9df` | Brand tint (active nav background, chips) |
| `--brand-ink` | `#ffffff` | Text on brand surfaces |
| `--surface-bg` | `#f8f7f4` | App background (cream) |
| `--surface-card` | `#ffffff` | Cards, modals, table rows |
| `--surface-elevated` | `#ffffff` | Popovers, toasts (distinguished by shadow, not fill) |
| `--surface-muted` | `#f3f2ee` | Input backgrounds, zebra stripes |
| `--border-subtle` | `#ececea` | Card borders, dividers |
| `--border-strong` | `#d4d4d0` | Focus outlines on neutrals |
| `--text-primary` | `#111418` | Headings, body |
| `--text-secondary` | `#4b5058` | Labels, table cells |
| `--text-tertiary` | `#8a8f98` | Placeholders, metadata |
| `--text-on-brand` | `#ffffff` | Text on `--brand-500` |
| `--success-500` | `#15803d` | Paid, delivered, active |
| `--success-100` | `#dcfce7` | Success pill background |
| `--warning-500` | `#b45309` | Overdue-soon, critical compliance |
| `--warning-100` | `#fef3c7` | Warning pill background |
| `--danger-500` | `#b91c1c` | Expired, delete destructive |
| `--danger-100` | `#fee2e2` | Danger pill background |
| `--info-500` | `#1d4ed8` | In-transit, sent, neutral info |
| `--info-100` | `#dbeafe` | Info pill background |
| `--nav-bg-start` | `#141830` | Dark sidebar top |
| `--nav-bg-end` | `#0a0d1c` | Dark sidebar bottom |
| `--nav-text` | `#cbd0da` | Sidebar link idle |
| `--nav-text-strong` | `#ffffff` | Sidebar link active |
| `--nav-active-bg` | `rgba(59,130,246,0.15)` | Active-item pill fill |
| `--nav-active-bar` | `#3b82f6` | Active-item left bar |

### 2.2 Dark

Every token above gets a counterpart. Preview values — tuned during Phase 1 for
contrast, but the structure is fixed:

| Token | Light | Dark |
|---|---|---|
| `--surface-bg` | `#f8f7f4` | `#0c0d10` |
| `--surface-card` | `#ffffff` | `#16181c` |
| `--surface-muted` | `#f3f2ee` | `#1c1f24` |
| `--text-primary` | `#111418` | `#f3f4f6` |
| `--text-secondary` | `#4b5058` | `#c7ccd4` |
| `--text-tertiary` | `#8a8f98` | `#8b909a` |
| `--border-subtle` | `#ececea` | `#262a31` |
| Brand tokens | unchanged | unchanged (orange stays readable on dark) |
| Semantic -100 backgrounds | light tints | 15% alpha of -500 over dark |

### 2.3 Consumption rule

- **Web and iOS JSX** → reference Tailwind utilities (`bg-surface-card`,
  `text-text-primary`, `ring-brand-500`). No hex literals. Lint rule
  (Phase 1): forbid `/#[0-9a-f]{3,8}/` in `.tsx`.
- **Existing `#c8410a` literals** (96 web + 30 iOS, AUDIT §5) are migrated
  mechanically in Phase 1.
- **Inline `style={{ background: '...' }}`** survives only where a value must
  be computed at runtime (e.g. a user-uploaded logo tint). Use CSS vars in
  those cases, not hex.

---

## 3. Typography

### 3.1 Font stack

```css
font-family:
  -apple-system, BlinkMacSystemFont,
  "SF Pro Text", "SF Pro",
  "Inter", "Inter Variable",
  system-ui, sans-serif;
```

- On iOS Capacitor: resolves to SF Pro natively. No font download.
- On web (desktop + Android): resolves to Inter (loaded as a subset woff2) or
  the OS sans fallback.
- **Remove DM Sans** from both `src/index.css:1` and
  `ios-driver-app/src/index.css:1`. It's preventing native SF Pro resolution
  on iOS and adding a blocking Google Fonts request on web.

Display (large titles, invoice totals, dashboard KPIs) uses the same stack with
`font-feature-settings: "ss01", "cv11"` when Inter, and defaults on SF Pro.

### 3.2 Size scale

All sizes in `rem` so that the OS text-size setting scales proportionally. On
iOS this is the best Dynamic Type approximation available in a webview.

| Token | Size | Line-height | Use |
|---|---|---|---|
| `text-xs` | `0.75rem` (12px) | `1rem` | Metadata, pill text |
| `text-sm` | `0.875rem` (14px) | `1.25rem` | Body small, table cells |
| `text-base` | `1rem` (16px) | `1.5rem` | Body, form inputs (iOS tap-safe) |
| `text-lg` | `1.125rem` (18px) | `1.625rem` | Card titles |
| `text-xl` | `1.375rem` (22px) | `1.75rem` | Section headings |
| `text-2xl` | `1.75rem` (28px) | `2rem` | Page titles |
| `text-3xl` | `2.25rem` (36px) | `2.5rem` | Large titles (iOS-style) |
| `text-display` | `clamp(2.5rem, 4vw + 1rem, 3.5rem)` | `1.1` | Dashboard hero, invoice totals |

### 3.3 Weight

- `400` regular — body, placeholders
- `500` medium — labels, table headers
- `600` semibold — card titles, buttons, nav-active
- `700` bold — page titles, invoice totals
- Avoid ≥ 800 weights; they render poorly on WKWebView at small sizes.

### 3.4 Tabular numerals

Apply `font-variant-numeric: tabular-nums` to all numeric cells (rates, miles,
amounts, dates). Table columns stop jittering when values change.

---

## 4. Spacing / radius / shadow / motion

### 4.1 Spacing (Tailwind defaults, 4px base)

Use `1, 2, 3, 4, 5, 6, 8, 10, 12, 16` only. No arbitrary values. Card padding
is `p-5` or `p-6`. Modal padding is `p-6`. Stack gap between form fields is
`gap-4`. Between section groups: `gap-6`. Between cards on the dashboard:
`gap-5`.

### 4.2 Radius

| Token | Value | Use |
|---|---|---|
| `radius-sm` | `6px` | Pills, small chips |
| `radius-md` | `10px` | Inputs, buttons |
| `radius-lg` | `14px` | Cards, table containers |
| `radius-xl` | `18px` | Modals, sheets |
| `radius-full` | `9999px` | Avatars, icon buttons |

No `rounded-2xl` or larger on anything interactive. Login card is the one
exception and can stay at `18px`.

### 4.3 Elevation / shadow

| Token | Value | Use |
|---|---|---|
| `shadow-0` | `none` | Flat surfaces |
| `shadow-1` | `0 1px 2px rgba(17,20,24,0.04), 0 1px 3px rgba(17,20,24,0.06)` | Cards |
| `shadow-2` | `0 4px 12px rgba(17,20,24,0.08)` | Popovers, dropdowns |
| `shadow-3` | `0 16px 40px rgba(17,20,24,0.16)` | Modals, sheets |

No shadow goes deeper than `shadow-3`. Depth comes from contrast and borders.

### 4.4 Motion

| Token | Value | Use |
|---|---|---|
| `duration-fast` | `120ms` | Hover, color change |
| `duration-base` | `200ms` | Sheet open, modal fade |
| `duration-slow` | `320ms` | Route transitions (rare) |
| `ease-standard` | `cubic-bezier(0.2, 0.0, 0.0, 1.0)` | Everything |

All motion must respect `prefers-reduced-motion: reduce` — duration becomes
`0ms`, transforms become opacity crossfades.

---

## 5. Component specs

Every component below has one job, a canonical anatomy, an enumerated state
set, and explicit accessibility requirements. Implementations live in
`src/components/ui/` (web) and `ios-driver-app/src/components/ui/` (iOS), with
identical APIs so code can be lifted between trees in Phase 3.

### 5.1 `Button`

- **Purpose:** trigger an action.
- **Variants:** `primary` (brand), `secondary` (surface), `ghost` (text-only),
  `danger` (destructive).
- **Sizes:** `sm` (36px min-h), `md` (44px min-h, default), `lg` (52px min-h).
- **States:** default, hover, active, focus-visible, disabled, loading.
- **Anatomy:** optional leading icon · label · optional trailing badge.
- **Accessibility:**
  - Never without a label; if icon-only, require `aria-label`.
  - `focus-visible` ring `2px` `--brand-500`, `offset 2px`.
  - Disabled buttons are `aria-disabled="true"`, not just visually dimmed.
  - Loading state sets `aria-busy="true"` and keeps label visible alongside
    spinner so screen readers don't lose context.
- **Touch target:** `md`+ meets 44pt on iOS. `sm` is forbidden on touch
  surfaces.

### 5.2 `Input` / `Select` / `Textarea`

- **Variants:** default, inline (no label, for dense tables), read-only.
- **States:** default, focus, error, disabled.
- **Error:** red border + helper text + `aria-describedby` pointing at helper.
- **Minimum height:** 44px on touch.
- **`type="number"` gets `inputMode="decimal"`** and `font-variant-numeric:
  tabular-nums`.
- **Date fields:** `type="date"` on web, `type="datetime-local"` where time
  matters. Do not ship a custom picker unless native is insufficient.

### 5.3 `Modal` / `Sheet`

Replaces every inline modal in the codebase today (see AUDIT §3).

- **Anatomy:** overlay · container · header (title + close) · body · footer.
- **Behavior:**
  - Opens with focus on the first focusable element inside.
  - Traps focus (`Tab` wraps within the modal).
  - Closes on Escape.
  - Closes on backdrop click (configurable).
  - Body scroll is locked (`overflow: hidden` on `<html>`).
  - Returns focus to the invoker on close.
- **iOS:** uses a bottom sheet variant by default, slides up with
  `translateY(100%) → 0` over `duration-base`. Respects safe-area inset.
- **Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
  pointing at the title.
- **Close button:** icon button with `aria-label="Close"`, 44px target.

### 5.4 `StatusPill`

Replaces the five near-duplicate `<StatusBadge>` definitions across pages.

- **Variants:** `success`, `warning`, `danger`, `info`, `neutral`, plus two
  domain-specific derivations (`load-status`, `invoice-status`) that map
  text → variant in one place.
- **Anatomy:** dot/icon · label.
- **Rule:** **always includes text.** Color alone is never the signal.
- **Size:** `text-xs`, `px-2 py-0.5`, `radius-sm`.

### 5.5 `LoadCard`

Used on both platforms.

- **Purpose:** show a single load at a glance — enough to decide "tap or skip".
- **Primary content (eye-path order):**
  1. Load number + status pill
  2. Origin → destination (city, ST)
  3. Rate + miles (right-aligned, tabular nums)
  4. Pickup / deliver datetimes (secondary)
  5. Broker name (tertiary)
- **Interaction:** whole card is tappable. No inline buttons — swipe actions
  (iOS) or row-hover actions (web) handle delete/edit.
- **Elevation:** `shadow-1`, `radius-lg`, `border-subtle`.

### 5.6 `InvoiceCard`

- **Purpose:** list invoices in the Invoices page.
- **Content:** invoice number · bill-to name · amount (display-weight) · status
  pill · due/paid date · **type badge (Factored / Direct).**
- **Type badge is mandatory.** Even a subtle chip keeps the two workflows
  from getting confused (brief constraint).

### 5.7 `BrokerCard`

- **Purpose:** quick reference on the Brokers page and driver's Brokers modal.
- **Content:** name · MC # · tap-to-call phone · email.
- **Phone is a `tel:` link with a trailing call icon** — must work with one
  hand on iOS.

### 5.8 `DocumentThumbnail`

- **Purpose:** represent a `load_documents` row in a list.
- **Anatomy:** preview (image or icon by `mime_type`) · kind pill
  (`rate_con` / `pod` / `freight` / `other`) · filename (truncated) · trailing
  delete button.
- **Tap:** opens `DocViewer` with a signed URL.

### 5.9 `RevenueMetric`

- **Purpose:** the KPI cards on the dashboard and iOS Home.
- **Anatomy:** label (small, secondary) · value (display weight, tabular
  nums) · delta vs. last period (± %, colored).
- **Empty state:** show `—`, not `$0.00` — zero and "no data" are different.

### 5.10 `FuelEntry` / `MileageLogRow`

- **Purpose:** dense, one-row representations of a fuel purchase or a mileage
  log entry (future IFTA).
- **Anatomy:** date · vendor · amount · gallons · $/gal · state · odometer.
- **Tabular nums required.** Horizontally scrollable on iOS if needed; do not
  wrap.

### 5.11 `EmptyState`

- **Purpose:** replace the bare `<p>No records.</p>` everywhere.
- **Anatomy:** illustration or icon (subtle, `--text-tertiary`) · headline ·
  one-sentence body · primary CTA that creates the thing.
- **Example:** Loads empty — "No loads yet. Start with your first pickup." →
  [+ New Load].

### 5.12 `ErrorState` / `LoadingSkeleton`

- `ErrorState`: icon · message · retry button. Never a raw error string.
- `LoadingSkeleton`: animated bars matching the shape of the target content.
  Replaces the literal `—` loading placeholders.

---

## 6. HIG-in-webview playbook (iOS)

The iOS app is a Capacitor webview. Native HIG items that don't exist in the
webview are approximated with CSS + Capacitor plugins. Specific choices:

### 6.1 Haptics on primary actions

Install `@capacitor/haptics`. Fire `Haptics.impact({ style: Medium })` on:
- Mark load delivered / check-in
- Capture POD / freight photo success
- Expense saved
- Invoice status change

Fire `Haptics.notification({ type: Success })` on completion of a multi-step
flow (scan done, email sent).

### 6.2 Pull-to-refresh

Custom hook `usePullToRefresh(onRefresh)` using Pointer Events. At the top of
the scroll container, a drag past a threshold fires `onRefresh()` and
`Haptics.impact({ style: Light })`. Used on Loads, Invoices, Home (active
load), Expenses.

### 6.3 Swipe-to-delete

Pointer-events-based horizontal swipe on list rows reveals a red delete action
behind the row. Commit past threshold. Spring-back on release below threshold.
Used on load rows, expense rows, document rows, invoice rows.

### 6.4 Safe-area insets audit

Every fixed-position element (TabBar, top header, modal bottom footer) must
use `env(safe-area-inset-*)`. The existing `TabBar.tsx` already does; audit
every other overlay in Phase 1.

### 6.5 Dark mode

Opt-in via `prefers-color-scheme: dark`, with a manual toggle in Profile that
writes `data-theme="dark"` on `<html>`. Tokens from §2.2 swap under the
attribute selector; no component code changes.

### 6.6 Dynamic Type approximation

- All sizes in `rem`, never `px` in JSX class names.
- Root font-size uses `clamp(16px, 1rem, 20px)` so the OS text-size slider
  nudges the whole scale.
- Test at 130% and 175% OS text size. Any component that breaks gets a
  `min-content` width fix, not a smaller font.

### 6.7 Keyboard avoidance

Install `@capacitor/keyboard`. In `App.tsx`, subscribe to
`keyboardWillShow` and set a CSS variable `--kbd-height` on `:root`. Any
bottom-anchored element (sheet footer, CTA over keyboard) gets `margin-bottom:
var(--kbd-height, 0)`.

### 6.8 Large-title simulation

On scroll-y = 0, show a 28px bold title at the top of the scroll container.
As the user scrolls, the title shrinks to 16px and pins to the header. Pure
CSS/IntersectionObserver; no library. Apply on Loads, Invoices, Expenses.

### 6.9 Haptic-safe tap targets

Audit every `<button>` under `ios-driver-app/src/`. Any with `py-1` or smaller
gets bumped to the `Button` `md` size (44px min-h). Star-picker icons are
packed into an `inline-flex` with 44×44 tap zones around each star.

### 6.10 Font stack

Replace the `DM Sans` `@import` in `ios-driver-app/src/index.css:1` with the
§3.1 stack. Remove the `font-family: 'DM Sans'` rule.

---

## 7. Token consumption — Tailwind wiring

```css
/* src/index.css and ios-driver-app/src/index.css */
@import "tailwindcss";

@theme {
  --color-brand-500: #c8410a;
  --color-brand-600: #a5340a;
  --color-brand-100: #fbe9df;
  --color-surface-bg: #f8f7f4;
  --color-surface-card: #ffffff;
  --color-surface-muted: #f3f2ee;
  --color-border-subtle: #ececea;
  --color-text-primary: #111418;
  --color-text-secondary: #4b5058;
  --color-text-tertiary: #8a8f98;
  --color-success-500: #15803d;
  --color-warning-500: #b45309;
  --color-danger-500: #b91c1c;
  --color-info-500: #1d4ed8;
  /* … full set per §2 … */

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 18px;
}

:root[data-theme="dark"] {
  --color-surface-bg: #0c0d10;
  --color-surface-card: #16181c;
  /* … */
}
```

Utilities become `bg-brand-500`, `text-text-primary`, `rounded-lg`,
`border-border-subtle`. JSX stops containing hex.

---

## 8. Deliverable contract for Phase 1

When Phase 1 lands, it must:

- [ ] Install tokens from §2 in both `src/index.css` and
  `ios-driver-app/src/index.css`.
- [ ] Remove DM Sans import from both.
- [ ] Ship `src/components/ui/{Button,Input,Select,Modal,StatusPill,
  EmptyState,ErrorState,LoadingSkeleton}.tsx` and mirror set for iOS.
- [ ] Refactor Dashboard and Loads (web) to consume tokens + primitives. No
  hex literals left in those two files.
- [ ] Refactor Home and Loads (iOS) to consume tokens + primitives. Install
  `@capacitor/haptics` and `@capacitor/keyboard`. Remove DM Sans.
- [ ] Keep every other page functional (orange still works, just uncoordinated
  until its turn).
- [ ] Add an ESLint rule forbidding `#[0-9a-f]{3,8}` in `src/**/*.tsx` and
  `ios-driver-app/src/**/*.tsx`, scoped to new files only during migration.

Subsequent phases pick up the remaining pages one at a time.

---

## 9. Out of scope for this document

- Manual invoice module UX (lives in DESIGN.md v0.2 once SCHEMA-NOTES.md §1–§3
  land).
- Driver Mode UX (separate doc in Phase 3).
- Email templates and PDF layout (separate doc).
- Multi-tenant / role-based UI (not needed for a one-truck operator).
