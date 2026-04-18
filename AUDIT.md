# Driven TMS — UX & Engineering Audit

**Date:** 2026-04-18
**Scope:** Web app (`src/`), iOS driver app (`ios-driver-app/`, Capacitor), Supabase schema (`supabase/migrations/`)
**Branch:** `ux-overhaul-2026` (this document is the first artifact)

---

## 1. Executive summary

Driven is a working one-truck owner-operator TMS. The feature surface is
broad — loads, invoices, expenses, compliance, filings, IFTA-adjacent tracking,
a driver iOS companion — and every feature ships useful functionality today.
What has drifted is the **foundation**: there is no design-token layer, no
shared component library between web and iOS, modal/focus patterns are
inconsistent, and the invoice schema can't represent the most important
business fact (factored vs. direct). The codebase is small enough (~6k LOC of
page code) that a structured refactor is feasible in a few focused passes.

### What's healthy

- Data model is clean: UUID PKs, CASCADE on child tables, created_at timestamps
  everywhere, a Storage bucket for documents, dedicated compliance and reminder
  tables with a proper Postgres enum.
- Navigation is simple and predictable: 14 top-level web routes, 5 iOS tabs.
- Visual language is already mostly cohesive — a single brand orange
  (`#c8410a`), cream background (`#f8f7f4`), warm card palette.
- React Query is used consistently for data; no ad-hoc fetch patterns.
- Supabase + Capacitor stack is well-suited to a one-person operation: no
  server to run, push straight to TestFlight.

### What needs work (short version)

- **Design tokens do not exist** — `#c8410a` appears 96 times across 18 files
  in `src/`, 30 times across 12 files in `ios-driver-app/src/`. Rebranding or
  theming would be a find-replace.
- **Accessibility is a blind spot** — `aria-label` appears exactly once in the
  web app (`src/pages/Loads.tsx`), modals have no focus traps, no Escape
  handlers, no focus rings beyond Tailwind defaults.
- **iOS webview is missing most HIG affordances** — no haptics, no
  pull-to-refresh, no swipe actions, no dark mode, no Dynamic Type, DM Sans is
  loaded instead of letting SF Pro resolve from the system stack.
- **Invoice model can't distinguish factored from direct** — single flat table,
  no line items, no `invoice_type`, no `factoring_reference`. This blocks the
  manual-invoicing module deliverable.
- **Company identity is incomplete** — `company_settings` has company_name,
  logo, factoring_email, and nothing else. No MC#, no DOT#, no address. You
  can't legally render an invoice PDF from it.
- **Performance will break at scale** — no pagination on any table page;
  `Invoices`, `Loads`, and `Expenses` all fetch the entire dataset.

---

## 2. Sitemap

### Web app — 14 routes (`src/App.tsx:27–39`)

| Route | Component | Purpose | LOC |
|---|---|---|---|
| `/login` | `Login` | Email/password auth → Supabase | 107 |
| `/dashboard` | `Dashboard` | KPI cards, weekly revenue/miles/RPM, compliance alerts | 268 |
| `/loads` | `Loads` | CRUD loads with status tabs, city autocomplete, ratings | 725 |
| `/invoices` | `Invoices` | CRUD invoices linked to load + broker/customer, status tabs | 365 |
| `/expenses` | `Expenses` | Categorized expense entries, fuel-specific fields | 303 |
| `/trucks` | `Trucks` | Fleet records with compliance sub-tab | 276 |
| `/trailers` | `Trailers` | Trailer records | 192 |
| `/drivers` | `Drivers` | Driver records with compliance sub-tab | 279 |
| `/brokers` | `Brokers` | Broker contacts with MC# | 253 |
| `/customers` | `Customers` | Direct-bill customer records | 250 |
| `/maintenance` | `Maintenance` | Service history per truck | 265 |
| `/compliance` | `Compliance` | Expirations dashboard across drivers/trucks/company | 270 |
| `/filings` | `Filings` | Tax deadlines (IFTA, 2290, UCR) | 185 |
| `/settings` | `Settings` | Company name, logo, factoring email | 187 |

### iOS driver app — 5 tabs + modals (`ios-driver-app/src/screens/`)

| Tab | Purpose | LOC |
|---|---|---|
| `Home` | Active load, HOS timer, earnings summary, upcoming expirations | 243 |
| `Loads` | All assigned/in-transit/delivered loads, detail sheets, DocScan, stamped photo | 888 |
| `Expenses` | Category-filtered expense entry, fuel fields | 220 |
| `Invoices` | Delivered-load invoice view (broker/customer, status, notes) | 433 |
| `Profile` | Driver identity, HOS status, sign-out, Brokers modal | 96 |

Brokers and Login are not tabs; Brokers is a modal over Profile, Login is the
unauthenticated root. Navigation is React state in `ios-driver-app/src/App.tsx`,
not a native stack or router.

---

## 3. Web UX — per-page findings

These are not bugs; the pages all work. They are inconsistencies that cost the
user fluency and make the codebase harder to evolve.

### Dashboard (`src/pages/Dashboard.tsx`)
- **Primary action:** none. All cards are read-only or navigational. That's
  correct for a dashboard, but there's no "what next" hinting (e.g. "3
  invoices overdue — review").
- Uses four separate count queries via `Promise.all`. Fine at one truck; becomes
  wasteful at scale (see §7).
- Compliance alerts banner is prominent (red/orange) — good; but relies on
  color alone to convey severity.

### Loads (`src/pages/Loads.tsx`) — 725 LOC
- Longest file in the codebase; modal, detail panel, and table logic are all
  inline. Should be decomposed into `LoadTable`, `LoadDetailPanel`, `LoadModal`.
- Status tabs use the free-text `loads.status` column whose CHECK constraint was
  dropped (`supabase/migrations/20260417000000_enable_rls_policies.sql:148–163`).
  Nothing stops a typo from creating an orphan status bucket.
- Star-picker buttons are `text-2xl` with minimal padding — tap target well
  under 44×44 on touch.
- Delete-document button at `src/pages/Loads.tsx` is the only element in the
  whole web app with an `aria-label`.

### Invoices (`src/pages/Invoices.tsx`) — 365 LOC
- **Major gap:** no distinction between factored and direct invoices. The brief
  is explicit that this is the primary business need.
- `billTo` toggle (broker XOR customer) at line 54–56 is UI-only — schema allows
  both to be set simultaneously.
- Row-select pattern differs from Loads: Invoices uses a side panel, Loads uses
  a modal. Same action, different affordance.
- No invoice PDF generation; no email send; no "duplicate previous".

### Expenses (`src/pages/Expenses.tsx`)
- Fuel-specific fields (gallons, price_per_gal, odometer) are present on every
  form even for non-fuel categories. Should be conditional.
- No IFTA-oriented aggregation ("fuel $ by state this quarter").

### Trucks / Trailers / Drivers / Brokers / Customers
- All five follow the same modal-on-create / side-panel-on-select pattern. Good
  pattern but it's copy-pasted five times — candidate for a generic `EntityPage`.
- Drivers has an "Export" button that appears to be a placeholder.

### Maintenance, Compliance, Filings
- Maintenance is the simplest CRUD; minimal issues.
- Compliance is the most sophisticated page (per-entity sub-expiration tracking,
  severity banners). `useEntityNames()` fetches all drivers + all trucks on
  every render — N+1 shaped, fine today, bad at 500+ items.
- Filings has no tabs or filters; list grows unbounded.

### Settings (`src/pages/Settings.tsx`)
- Only three editable fields: company_name, factoring_email, logo.
- Missing everything required to render a legal invoice PDF (see §8 and
  SCHEMA-NOTES.md).

### Login (`src/pages/Login.tsx`)
- Clean, minimal. No issues beyond the global hardcoded-color and
  missing-focus-ring problems.

### Global patterns (applied to all pages)
- Button styles are re-declared inline on every page — `px-3 py-2 rounded-lg
  bg-[#c8410a] text-white hover:bg-[#b23808]` with small variations. No shared
  `<Button>` primitive.
- Modals are dismissed by backdrop click. None install an Escape keydown handler
  or a focus trap. Tab can walk behind the modal.
- Loading is represented by the literal string `—` in most places; there are no
  skeleton components.
- Error states are `<p className="text-red-600">` inline. No `role="alert"`.
- Empty states are a generic `<p>No records.</p>` — no call-to-action, no icon,
  no empty-state component.

---

## 4. iOS (Capacitor webview) — HIG gaps

This is a React web app inside WKWebView, not a native Swift app. Several items
in the brief (true large-title navigation bars, native swipe-to-delete,
true Dynamic Type) are out of reach without a rewrite. The items below are the
ones we **can** close in the webview.

| HIG expectation | Status | Notes |
|---|---|---|
| Safe-area insets | ✅ | `env(safe-area-inset-*)` applied on `TabBar` and screen padding |
| 44pt minimum tap target | ⚠️ | Star picker, some icon buttons, close (`✕`) buttons fall under |
| Pull-to-refresh | ❌ | React Query refetches only on mount/focus — no PTR gesture |
| Swipe-to-delete | ❌ | No gesture handlers anywhere |
| Haptic feedback | ❌ | `@capacitor/haptics` not in `ios-driver-app/package.json` |
| Dark mode | ❌ | No `dark:` utilities, no `prefers-color-scheme` CSS |
| Dynamic Type | ❌ | All sizes are fixed `text-sm`/`text-base`/etc., no `clamp()` or rem scaling |
| Keyboard avoidance | ❌ | No `@capacitor/keyboard` plugin, no CSS inset handling |
| SF Pro | ⚠️ | DM Sans is loaded first from Google Fonts (`ios-driver-app/src/index.css:1`); system fallback resolves SF Pro only if DM Sans fails |
| Native nav bar with large title | ❌ | Not available — webview can only approximate via CSS |
| Scroll momentum | ⚠️ | Default WKWebView behavior; no `-webkit-overflow-scrolling: touch` audit |

### Custom native plugin
- `ios-driver-app/ios-plugins/DocScan/DocScanPlugin.swift` wraps
  `VNDocumentCameraViewController`. This is the only actual native code in the
  repo. Keep it; it's the right pattern for the one case where native matters.

### Shared code between web and iOS
- **None at the source level.** Two separate React trees, two separate
  `package.json`s, two separate Supabase clients pointing at the same project.
- Consequence: `LoadCard`, `CityAutocomplete`, `DocViewer` exist in both trees
  with near-identical but drifting implementations.

---

## 5. Design-token drift

There is no theme file, no Tailwind config, no CSS variable layer. Colors are
spelled out as hex literals in JSX.

### Hardcoded color occurrences

| Color | Meaning | Web count | iOS count |
|---|---|---:|---:|
| `#c8410a` | Brand orange (CTA, accent) | 96 across 18 files | 30 across 12 files |
| `#f8f7f4` | Page background cream | 4 | 1 |
| `#b23808`, `#a13008` | Hover variants (implied) | sparse, inconsistent | sparse |

Any rebrand, dark mode, or high-contrast mode is a mass find-replace today.

### Typography
- Web: DM Sans loaded from Google Fonts (`src/index.css:1`), declared in `body`
  (`src/index.css:15–21`).
- iOS: same DM Sans. Prevents native SF Pro from being used.

### No shared primitives
- No `Button`, `Input`, `Select`, `Modal`, `Badge`, `Card`, or similar in
  either tree. Every page re-declares classes.

---

## 6. Accessibility

### Web
- `aria-label` appears **once** in `src/` (on a delete-doc button in
  `src/pages/Loads.tsx`). The `src/assets/vite.svg` hit is incidental.
- No `role="alert"` anywhere.
- Modals:
  - No focus trap.
  - No Escape-key handler (dismiss is backdrop-click only).
  - No scroll lock on `body` when modal is open.
- Inputs have visible labels but no `htmlFor`/`id` pairing audited;
  screen-reader pairing is unverified.
- Status pills rely on color + text. Text is present, so not critical, but icons
  would reinforce.
- Focus rings: Tailwind defaults only. Some custom buttons strip outlines
  without replacement.

### iOS
- Same markup problems; compounded by touch-target size issues.
- No VoiceOver audit has been performed.

**Severity call:** Major, not Critical. The user is currently the sole operator,
so the immediate business impact is limited. But the next hire (bookkeeper,
part-time dispatcher) is blocked by this — and it's cheap to fix once tokens
and a `Modal` primitive exist.

---

## 7. Performance

### Known red flags
- **No pagination.** `Invoices`, `Loads`, `Expenses` tables all do
  `supabase.from('x').select('*').order('created_at', { ascending: false })`
  with no `range()`. At one truck over one year this is fine; at 2,000 loads
  it starts to matter.
- **Over-wide nested selects.** `Invoices` pulls `*, loads(...), brokers(...),
  customers(...)` for every row including fields the table doesn't show.
- **N+1 shape in Compliance.** `useEntityNames()` fetches all drivers and all
  trucks to build a lookup map on every render.
- **Dashboard uses four count queries in parallel.** Could collapse to one RPC.
- **No optimistic updates.** Every delete waits for a round-trip before the
  row disappears.
- **No request deduplication across pages.** Each page defines its own
  `queryKey` for brokers, customers, loads — React Query will cache but the
  keys differ (`brokers-simple` vs `brokers`), so two fetches happen.

### Not red flags
- Bundle size (Vite + Tailwind 4, small app).
- Render frequency (React Query is well-tuned).
- Image loading (logos are cached signed URLs).

---

## 8. Data model summary

Full detail is in `SCHEMA-NOTES.md`. Headline gaps:

1. **Invoice type is not modeled.** No `invoice_type` column, no
   `factoring_reference`, no line items. Blocks the manual-invoicing module.
2. **Load status is unconstrained.** The CHECK was dropped in migration
   `20260417000000_enable_rls_policies.sql:148–163`. Schema enforces nothing.
3. **Company identity is incomplete.** `company_settings` lacks MC#, DOT#,
   EIN, address, phone. Can't render a legal invoice PDF.
4. **IFTA miles-per-state is not tracked.** `compliance_items` tracks the IFTA
   decal expiration, `tax_deadlines` tracks the filing due date, but there is
   no mileage-by-state table to file against.
5. **No audit log.** Status changes on loads and invoices are untraced.
6. **RLS is effectively off.** Every table has `using(true) with check(true)`.
   Acceptable for a single-seat app, but a migration path matters.

---

## 9. Severity-ranked issue list

Format: `[Severity] Description — file:line — fix anchor`

### Critical (blocks a stated business goal)

- **[C1]** Invoice schema cannot represent factored vs. direct.
  - `supabase/migrations/*` — no migration adds `invoice_type`.
  - Fix: SCHEMA-NOTES.md §1.
- **[C2]** `company_settings` is missing MC#, DOT#, address, phone — cannot
  render a legal invoice PDF.
  - `supabase/migrations/20260417300000_customers_settings_logo.sql:27–34`
  - Fix: SCHEMA-NOTES.md §3.
- **[C3]** No invoice line items. Direct invoicing requires at least
  `description`, `miles`, `rate`, `accessorial`, `amount` per row.
  - Fix: SCHEMA-NOTES.md §2.

### Major (degrades UX or blocks scale)

- **[M1]** No design tokens; 96 hardcoded brand-color literals on web + 30 on iOS.
  - Fix: DESIGN.md §2.
- **[M2]** No shared `Button`, `Modal`, `Input`, `StatusPill` primitives.
  - Fix: DESIGN.md §5.
- **[M3]** iOS webview missing haptics, pull-to-refresh, dark mode, Dynamic
  Type, keyboard avoidance.
  - Fix: DESIGN.md §6 (HIG-in-webview playbook).
- **[M4]** Modals have no focus trap, no Escape handler, no scroll lock.
  - Affects every page with a modal (all CRUD pages).
  - Fix: DESIGN.md §5 (`Modal` spec).
- **[M5]** `loads.status` has no CHECK constraint; typos create orphan buckets.
  - `supabase/migrations/20260417000000_enable_rls_policies.sql:148–163`
  - Fix: SCHEMA-NOTES.md §4.
- **[M6]** No pagination on Invoices / Loads / Expenses tables.
  - Fix: post-refactor phase; tracked here for visibility.
- **[M7]** iOS and web duplicate `LoadCard`, `CityAutocomplete`, `DocViewer`
  with drifting implementations.
  - Fix: extract a `packages/shared` workspace in a later phase, or copy
  carefully during refactor.

### Minor (polish, tracked for completeness)

- **[m1]** Dashboard uses four parallel count queries; collapse to one RPC.
- **[m2]** DM Sans loaded ahead of SF Pro in `ios-driver-app/src/index.css:1`.
- **[m3]** `Loads.tsx` is 725 LOC; decompose.
- **[m4]** Drivers has a non-functional Export button (`src/pages/Drivers.tsx`).
- **[m5]** `aria-label` usage ≈ zero; add to every icon-only button.
- **[m6]** No `role="alert"` on error messages.
- **[m7]** Loading state is the literal `—`; replace with `LoadingSkeleton`.
- **[m8]** Empty states have no CTA or iconography.
- **[m9]** Filings has no filters; add year/status chips.
- **[m10]** Fuel-specific fields are shown on non-fuel expense forms.

---

## 10. What this audit does not cover

Out of scope per phase agreement:
- **Before/after screenshots.** Nothing has been refactored yet.
- **Driver Mode design.** Deferred to Phase 2+.
- **Manual invoice module spec.** Lives in DESIGN.md once tokens are set.
- **Security/secret scan.** Would run as a separate review pass.
- **Bundle analysis.** Not needed until tokens land.

Next step after this document is reviewed: Phase 1 — apply tokens across `src/`
and `ios-driver-app/src/`, refactor Dashboard + Loads as the pattern-setting
screens, extract `Button` / `Modal` / `StatusPill` primitives.
