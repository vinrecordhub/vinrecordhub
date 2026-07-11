# VINRecordHub — 10-Dimension QA Report (Step B)

Date: 2026-07-11 · Scope: full static site + serverless API (code review) + local
rendering checks. Served locally via `python3 -m http.server 8080` from the repo
root; rendering/overflow/console-error checks used headless Chrome 138 driven by
`puppeteer-core` with proper mobile viewport emulation (`isMobile: true`, so the
`<meta viewport>` tag is honored the same way a real phone honors it — plain
`--window-size` headless screenshots were tried first and produced a false
positive on the homepage that mobile-emulated measurement disproved; that
distinction matters for how the responsive findings below were verified).
JSON-LD was parsed with `JSON.parse` across every page, not just eyeballed.
Internal links were resolved against the actual filesystem. Contrast ratios
were computed from the real OKLCH token values (OKLab → linear sRGB → WCAG
relative luminance), not estimated.

A dedicated security audit (`docs/build-run/SECURITY_AUDIT.md` +
`SECURITY_AUDIT_ADDENDUM.md`) ran in parallel and is authoritative for security;
Dimension 2 here is a lighter cross-check only, re-verified against the current
committed state (some files, notably `admin.html` and `lib/admin-auth.js`,
were patched by that work while this review was in progress — findings below
reflect the code as currently committed on `main`, HEAD `426b452`).

No source files were modified to produce this report.

---

## Dimension scores

| # | Dimension | Score |
|---|---|---|
| 1 | Functionality / regression | 86 |
| 2 | Security (cross-check) | 95 |
| 3 | Performance / Core Web Vitals | 78 |
| 4 | Accessibility (WCAG 2.1 AA) | 82 |
| 5 | SEO | 74 |
| 6 | Responsive / cross-device | 70 |
| 7 | Cross-browser | 68 |
| 8 | UI / visual design quality | 80 |
| 9 | Content correctness | 85 |
| 10 | End-to-end flows | 84 |
| **Overall** | | **80 / 100** |

---

## 1. Functionality / regression — 86/100

**Verified working, structurally sound:**
- Homepage bundle cards (`index.html:945-1004`) all link to `/checkout?bundle=bN` for b1/b3/b10/b15/b25, matching `lib/bundles.js`'s canonical `BUNDLES` map exactly.
- `checkout.html` auth-gates via `window.vrhAuth.getSession()` / `isVerified()` (`checkout.html:466-484`) before showing the bundle grid, then calls `POST /api/paypal-order` with `action: quote|create|capture`. Every field the client sends (`bundleId`, `couponCode`, `paypalOrderId`) is consumed correctly by `api/paypal-order.js`, and every field the server returns (`pricing`, `paypalOrderId`, `granted`, `balance`) is read correctly by `checkout.html`'s `api()` helper and `onApprove` handler. No shape mismatch.
- `account.html` gates with `vrhAuth.requireAuth('/login')` + `isVerified()` (`account.html:447-455`), then `POST /api/generate-report` with `{ vin, reportType, requestId }` and an `Authorization: Bearer` header — matches `api/generate-report.js:34-44` exactly, including the idempotency `requestId` field.
- Legacy `/redeem` flow (`redeem.html` → `GET /api/check-code` → `POST /api/redeem`) still works end-to-end; request/response shapes match `api/redeem.js` and `api/check-code.js`.
- **0 broken internal links** found across all 30+ HTML pages (automated resolution against the filesystem, including `.html`-less clean URLs).
- **0 JS `pageerror` exceptions** on any page when Supabase config is valid; the only exceptions seen locally (`Invalid supabaseUrl`, `vrhAuth is not defined` on `bundles.html`/`checkout.html`/`account.html`/`login.html`/`signup.html`) come from `assets/supabase-config.js` still holding its un-substituted `__SUPABASE_URL__` placeholder in this local checkout — expected in this environment, not a bug in the page logic itself (see finding below for the real issue this exposes).

**Findings:**

- **[MEDIUM-HIGH] No error handling around Supabase client creation — silent, total auth failure if config is ever wrong.** `assets/auth.js:4-8` calls `window.supabase.createClient(window.VRH_SUPABASE_URL, window.VRH_SUPABASE_ANON_KEY)` directly inside the top-level IIFE with no `try/catch`. `assets/supabase-config.js:5-6` ships placeholder tokens (`__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__`) that some deploy-time process is expected to substitute — but there is **no build step in this repo** (`package.json` has no `build`/`postbuild` script, `vercel.json` has no `build` field, and no shell script anywhere references `__SUPABASE_URL__`). If that external substitution step is ever skipped or misconfigured, `createClient()` throws synchronously, `window.vrhAuth` is never assigned, and every page that depends on it (login, signup, checkout, account, bundles) fails completely with **no error shown to the user** — buttons just silently do nothing. This violates the project's own `error-handling.md` rule ("never swallow errors silently"). Confirmed by reproducing it locally: `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL` followed by `vrhAuth is not defined` on every auth-dependent page.
  - **Fix:** wrap the `createClient()` call in `try/catch`; on failure, set `window.vrhAuth = null` and have each page check for it and render a visible "Sign-in is temporarily unavailable" state instead of a silently broken button. Also worth documenting *where* the placeholder substitution actually happens (Vercel env-var injection at request time via an edge function, a manual pre-deploy step, etc.) since it isn't visible anywhere in this repo.

- **[LOW] `vercel.json` mixes the legacy `routes` array with modern `headers`, `cleanUrls`, and `trailingSlash` properties** (`vercel.json:1-46`). Older Vercel platform versions documented these as mutually exclusive. Direct inspection of the installed CLI (`vercel@54.15.0`, `@vercel/routing-utils`'s `getTransformedRoutes`) shows the current tooling merges `cleanUrls` → `trailingSlash` → `routes` → `redirects` → `headers` → `rewrites` into one list without erroring, so this is very likely fine on the current platform version — but it's a legacy pattern that used to be a hard deploy error, so it's worth one real `vercel deploy` smoke test before relying on it, and migrating the two `routes` entries into `rewrites` would be more future-proof and is the currently-recommended style.

---

## 2. Security — cross-check only — 95/100

A full adversarial audit already ran (`SECURITY_AUDIT.md`, `SECURITY_AUDIT_ADDENDUM.md`) and fixed: coupon-limit TOCTOU, admin token moved to `Authorization: Bearer` (constant-time compare, `lib/admin-auth.js`), non-USD capture rejection, reflected XSS on the TikTok OAuth error page, and open-redirect on `?next=`. Re-verified against the current committed code:

- **No secrets in client files.** Grepped every `.html`/`assets/*.js` for `SUPABASE_SERVICE_KEY`, `PAYPAL_SECRET`, `RESEND_API_KEY`, `CHEAPVHR_API_KEY`, `ADMIN_TOKEN` — zero hits outside comments referencing `process.env.*` names server-side. `assets/supabase-config.js:5-6` carries only the URL + anon key placeholders, which is correct (anon key is public-by-design; RLS enforces access).
- **Admin pages excluded from indexing** two ways: `admin.html:13` has `<meta name="robots" content="noindex, nofollow"/>` and `robots.txt:3` disallows `/admin`; `vercel.json:26-31` also sets `X-Robots-Tag: noindex, nofollow` on `/admin`.
- **Admin auth confirmed current:** `admin.html` sends `Authorization: Bearer <token>` on every admin API call (`admin.html:623,656,671,991,1021,1053,1132`); `lib/admin-auth.js:15-19`'s `getAdminToken()` prefers the header and falls back to `?token=` only for backward compatibility; the compare itself (`isValidAdminToken`) is `crypto.timingSafeEqual`. All four admin handlers (`admin-orders.js`, `admin-coupons.js`, `resend-order.js`, `ga-stats.js`) route through `isAuthorizedAdmin()`.
- **Forms validate input client- and server-side**: VIN regex (`^[A-HJ-NPR-Z0-9]{17}$`) appears in `index.html`, `account.html`, `redeem.html` client-side *and* is re-validated server-side in `lib/sanitize.js:sanitizeVin` / the DB RPCs, so client validation isn't the only gate.
- CORS headers on every `api/*.js` file are correctly scoped to `https://vinrecordhub.com` (not `*`); since the frontend only ever calls `/api/...` as a same-origin relative path, this only matters as a hardening measure against third-party sites calling the API directly, which is the intent.

No new issues found in this cross-check. Deducting a few points only because this is deliberately a shallow pass — treat `SECURITY_AUDIT.md`'s own residual/owner items (Supabase redirect allowlist, `PAYPAL_WEBHOOK_ID` registration, shared-store rate limiter) as the authoritative outstanding list.

---

## 3. Performance / Core Web Vitals — 78/100

**Working well:**
- The WebGL aurora (`assets/fx-aurora.js`) loads `defer`, self-removes on `prefers-reduced-motion`/`Save-Data`/no-WebGL, and only runs its `requestAnimationFrame` loop while the hero canvas is actually intersecting *and* the tab is visible (`fx-aurora.js:110-118`) — correctly non-blocking and lazy.
- **Correction to the review brief:** `index.html` does **not** load GSAP. Checked directly (`grep gsap index.html` → no hits); GSAP is only loaded on `admin.html`, `redeem.html`, `terms.html`, `privacy.html`, `success.html`, and the `blog/*.html` pages, not the homepage. The homepage's scroll-reveal (`initScrollReveal`, `index.html:1324-1338`) and hero animations are pure CSS + native `IntersectionObserver`. GA (`gtag.js`, `async`) and Tawk.to (loaded on `window.load`, `index.html:1194-1200`) are already correctly deferred off the critical path.
- `index.html`/`checkout.html`/`account.html`/`bundles.html` all use the `preload` + `onload="this.rel='stylesheet'"` async-swap pattern for Google Fonts (e.g. `index.html:160-161`) with a `<noscript>` fallback — the correct non-render-blocking pattern.
- The walkthrough video (`index.html:926-934`) uses `preload="none"` and only sets `.src` once its `IntersectionObserver` fires — correct.
- Images have explicit `width`/`height` (`index.html:769, 826, 837…`) matching the frontend rule.

**Findings:**

- **[MEDIUM] All 26 `blog/*.html` pages render-block on the Google Fonts stylesheet**, unlike the rest of the site. `blog/carfax-vs-autocheck.html:24` (and identically in every other blog page, including `blog/index.html:24`): `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter…">` with no `preload`/`onload` swap, versus `checkout.html:25-26` / `index.html:160-161` which do it correctly. Since the blog is the largest single section of the site (26 pages, the majority of the SEO surface), this is a systemic, easy-to-fix regression versus the site's own established pattern.
  - **Fix:** apply the same `preload as="style" onload="this.rel='stylesheet'"` + `<noscript>` pattern to all `blog/*.html` `<head>` blocks (or self-host Inter to remove the third-party round-trip entirely).
- **[LOW]** Every blog page also loads three.js (ES module, correctly deferred by module semantics), GSAP core, and GSAP ScrollTrigger unconditionally near the end of `<body>` (e.g. `blog/carfax-vs-autocheck.html:129-133`) purely for decorative hero/scroll-reveal motion. Not render-blocking (placed after content, so it doesn't delay first paint), but it's non-trivial JS weight (three.js + GSAP + ScrollTrigger) paid on every single blog page load for a fade-up effect that already fails-safe to fully-visible content without it (`blog-anim.js:5`). Worth a lighter-weight alternative if blog page weight becomes a concern, but not urgent.
- **[LOW]** `og-image.png` is **1.7MB** — large for an Open Graph preview image. Doesn't affect on-page Core Web Vitals (only fetched by social-media crawlers, not the browser rendering the page), but it's worth re-exporting at normal web compression (target <300KB) since large OG images can slow or fail link-preview generation on some platforms.
- **[LOW]** `vinny-wave.svg` in the hero is marked `loading="lazy"` (`index.html:826`) despite being above the fold. Lazy-loading an above-the-fold element is a minor anti-pattern (delays its own paint slightly); harmless in practice since it's a tiny SVG, but worth removing the attribute for correctness.

---

## 4. Accessibility (WCAG 2.1 AA) — 82/100

**Verified, not just assumed:** the review brief noted tokens were "math-verified AA in both themes" — recomputed independently by converting the real OKLCH values in `assets/theme.css` to linear sRGB and then WCAG relative luminance. All spot-checked pairs pass comfortably:

| Pair | Dark | Light |
|---|---|---|
| `--text` on `--bg` | 18.99:1 | 15.78:1 |
| `--text-muted` on `--bg` | 8.05:1 | 7.28:1 |
| `--text-faint` on `--bg` (smallest-used label/placeholder color) | 6.66:1 | 5.63:1 |
| `--accent-primary` on `--bg` | 8.51:1 | 5.50:1 |
| `--on-cta` on `--cta` (button text) | 8.99:1 | 6.01:1 |
| `--danger` on `--bg` | 6.09:1 | — |

All comfortably clear 4.5:1 (normal text) — no contrast regressions found in real usage, including the smallest/faintest label color and button text-on-fill.

**Also confirmed good:**
- `:focus-visible{outline:2px solid var(--accent);outline-offset:3px}` present on every page checked — no `outline:none` without replacement anywhere.
- `prefers-reduced-motion` is honored broadly and consistently: `index.html:755-761`, `bundles.html:256-259`, `assets/fx.js:6`, `assets/fx-aurora.js:13`, `blog/blog-3d.js:9,77`, `blog/blog-anim.js:6`.
- Theme toggle (`data-theme-toggle`) has `aria-label` that's kept in sync with actual state by `assets/theme.js:16-20`'s `apply()`.
- Modals have `role="dialog" aria-modal="true" aria-label="…"` (mobile nav menu, sample-report modal).
- Form inputs have associated `<label for="…">` (checkout coupon, account VIN input, login/signup fields, redeem form).

**Findings:**

- **[MEDIUM] `account.html`'s four major section headings are `<div>`s, not heading elements**, breaking the page's heading outline for screen-reader users who navigate by heading (WCAG 1.3.1 Info and Relationships): `account.html:219` (`Credit Balance`), `230` (`Generate a Report`), `258` (`Transaction History`), `269` (`Order History`) are all `<div class="card-title">`. The page has exactly one real heading (`<h1>My Account</h1>`) and then four visually-styled-but-not-marked-up section titles that a screen reader's heading-navigation shortcut will skip entirely.
  - **Fix:** change these to `<h2 class="card-title">…</h2>` — purely a tag swap, the CSS class already controls the visual style so nothing else needs to change.
- **[LOW-MEDIUM] No focus trap or focus restoration on the two custom modals.** The mobile nav drawer (`.m-menu`, e.g. `index.html:788-797`) and the sample-report modal (`#reportModalBackdrop`, `index.html:1143-1154`) both use `role="dialog" aria-modal="true"` but their open/close handlers (`openM()`/`closeM()`, `openSampleReport()`/`closeSampleReport()`) only toggle a CSS class — they don't move focus into the dialog on open, trap Tab/Shift+Tab inside it, or return focus to the triggering button on close. A keyboard user can Tab out of an "open" modal into hidden background content behind it.
  - **Fix:** on open, move focus to the first focusable element (or the close button) and trap Tab within the dialog; on close, return focus to whatever element opened it.

---

## 5. SEO — 74/100

**Strong technical foundation, verified programmatically:**
- **28/28 JSON-LD blocks across the whole site parse as valid JSON** (`JSON.parse` on every `<script type="application/ld+json">`, zero syntax errors).
- The 5 newest blog posts and `/bundles` all carry the schema types the brief asked for: `bundles.html` → `Product` ×5 + `FAQPage`; `blog/carfax-vs-autocheck.html`, `blog/how-many-vin-reports-do-i-need.html`, `blog/bulk-vin-reports-for-dealers.html`, `blog/buy-10-vehicle-history-reports.html`, `blog/carfax-autocheck-bundle.html` → `Article` + `FAQPage` + `BreadcrumbList` each.
- **Zero duplicate `<title>`, zero duplicate canonical URLs, zero duplicate meta descriptions** across all 30+ indexable pages (checked programmatically, not sampled). The 9 pages with no meta description are exactly the noindexed transactional pages (account/admin/checkout/login/redeem/reset-password/sample-report/signup/success) — correct, not a gap.
- `sitemap.xml` includes all 25 blog posts + `/bundles` with reasonable `lastmod`/`priority`; `robots.txt` correctly disallows `/admin`, `/api/`, `/account`, `/checkout`, `/login`, `/signup`, `/reset-password`, `/success`, `/redeem`.
- `sample-report.html` is correctly `noindex, nofollow` (its `<meta>` tag has `content` before `name`, which is why a naive `grep 'name="robots" content='` misses it — worth normalizing attribute order for readability, but not a functional issue).

**Findings:**

- **[HIGH] Trademark/data-source overclaim is still present in five places, including both social-share meta tags** — this is the exact risk flagged for this review, and it wasn't fully cleaned up. Compare to how carefully the blog already handles this same topic (`blog/cheap-carfax-report.html:65`: *"No. VinRecordHub is an independent service and not affiliated with Carfax."*; `blog/carfax-competitors.html:67`: *"we don't claim to resell any competitor's report"*) — the homepage doesn't match that discipline:
  - `index.html:20` — og:description: *"Get **real** Carfax® & AutoCheck® vehicle history reports for just $9.99. **Same data**, delivered in 60 seconds."* (shown on every social share of the homepage)
  - `index.html:28` — twitter:description: *"**Real** Carfax® & AutoCheck® vehicle history reports for $9.99."*
  - `index.html:1101` — visible, on-page: *"Get the **exact same** Carfax® & AutoCheck® data at a fraction of the retail price."*
  - `index.html:109` (FAQPage JSON-LD) and `index.html:1121` (the same text rendered in the visible FAQ accordion) — *"…while delivering the **same comprehensive vehicle data**."*
  - Compounding this: the homepage's "sample report" (`sample-report.html`) is what appears to be a captured real CARFAX report page (its own `<title>` is *"CARFAX Vehicle History Report for this 2024 Toyota Camry…"*, and it carries CARFAX's own CSS class names like `cfx-card__shadow`). Showing this as the demo of what a VINRecordHub report looks like reinforces the "real Carfax" claim very concretely and is worth a legal/brand review independent of this QA pass.
  - **Fix:** replace "real"/"exact same"/"same … data" with something like "access to Carfax® & AutoCheck® report data" or "the same categories of vehicle history data" — softer, still compelling, and consistent with the disclaimer already on the same page (`index.html`'s own footer: *"VINRecordHub is not affiliated with, endorsed by, or sponsored by Carfax, AutoCheck, or Experian."*). Apply the fix in the OG/Twitter meta tags first since those are what gets seen and screenshotted most widely.

---

## 6. Responsive / cross-device — 70/100

Measured with real mobile-viewport emulation (`isMobile: true`, 360/768/1280px), not just a narrow desktop window — see the methodology note at the top, since a naive desktop-mode screenshot produced a misleading result on the homepage that this review discarded after re-verifying (`document.documentElement.scrollWidth === clientWidth === 360` on `/`, confirming no real bug there).

**Working well:**
- 44×44px touch targets are a consistent, deliberate pattern: `.btn-logout`, `.btn-resend`, `.fi`, `.bundle-card`, `.rt-card`, form inputs, and the mobile burger all set explicit `min-height:44px` (or width/height:44px), reused identically across `account.html`, `checkout.html`, `bundles.html`.
- The 5-across bundles grid collapses correctly and was confirmed to render without overflow at all three widths: `.bundles-grid`/`.bundle-grid` → 3 columns ≤1100px, 2 columns ≤960/700px, 1 column ≤600/360px (`index.html:387-389`, `bundles.html:235-246`).
- No horizontal overflow on `/`, `/blog`, `admin.html`, `redeem.html`, `success.html`, `bundles.html`, `checkout.html`, `account.html`, `login.html`, `signup.html` at 360/768/1280px (measured `scrollWidth === clientWidth` on all of them).

**Findings:**

- **[HIGH] Confirmed horizontal overflow at 360px width on blog posts containing a `<table>`** — this is a measured, reproducible defect, not a screenshot artifact. `blog/blog.css:82-83` styles `table{width:100%;…}` with no responsive handling; a `<table>`'s cells have their own minimum content width that `width:100%` cannot shrink below, so on a narrow viewport the table (and, because it's inline content inside `.post-main`, everything in that same content column) is forced wider than the screen. Measured directly via `document.documentElement.scrollWidth` at 360px viewport width:

  | Page | scrollWidth | clientWidth | Overflow |
  |---|---|---|---|
  | `blog/carfax-vs-autocheck.html` | 457px | 360px | 97px |
  | `blog/carfax-competitors.html` | 376px | 360px | 16px |
  | `blog/how-much-does-carfax-cost.html` | 376px | 360px | 16px |
  | `blog/odometer-check.html` | 376px | 360px | 16px |
  | `blog/title-check.html` | 376px | 360px | 16px |
  | `blog/salvage-title-check.html` | 376px | 360px | 16px |

  **22 of the 26 blog pages contain a `<table>`** (`grep -l "<table" blog/*.html`), so this very likely reproduces across most of them at phone width — the six above were spot-checked and all failed identically. This causes real horizontal scrolling/clipped content on the majority of the blog section on an actual phone.
  - **Fix:** wrap tables in a horizontally-scrollable container, matching the pattern already used elsewhere in this codebase (`account.html`'s `.table-scroll{overflow-x:auto}` around `.hist-table`) — either add that wrapper `<div>` around every `<table>` in the blog templates, or simpler, add `.post-main{overflow-x:auto}` / a `table{display:block;overflow-x:auto}` rule to `blog/blog.css` so it self-heals across all 22 affected posts without touching each HTML file.

---

## 7. Cross-browser — 68/100

- **[MEDIUM-HIGH] The entire color system has zero fallback for browsers without `oklch()`/`color-mix()` support.** `assets/theme.css` defines every single color token — background, text, accent, borders, shadows, status colors, both themes — exclusively in `oklch(...)`, and `color-mix(in oklab, …)` is used ~100+ more times across component CSS for opacity blends (translucent borders, glows, hover states). Browser support for both is good among current-generation browsers (Chrome/Edge 111+, Safari 16.4+, Firefox 113+ — all shipped since spring 2023), but there is no `@supports` fallback and no fallback color declared before any `oklch()`/`color-mix()` rule anywhere in the codebase. On any browser predating that support window (older Safari on iOS <16.4, older Android System WebView, any pre-2023 browser still in the wild on lower-end/older devices), CSS custom properties resolve to invalid values and the entire page loses its color system — not a degraded look, effectively unstyled/unreadable in the worst case, since text/background contrast is entirely token-driven.
  - **Fix, in order of effort:** (a) at minimum, decide this is an accepted risk only after checking real traffic browser-version share in analytics; (b) better, add sRGB hex fallbacks immediately before the `oklch()` declarations in `:root` and `[data-theme="light"]` (browsers ignore the second, valid declaration and fall back to the first automatically — no `@supports` block needed, this is the standard fallback pattern for CSS custom properties/colors).
- **[LOW]** `backdrop-filter: blur(20px) saturate(1.8)` is used on every nav bar (`.nav-shell`) with no fallback rule. This degrades gracefully (the nav's own `background` color, itself `oklch`-based, still renders — just without the blur), so this is a much smaller risk than the color-token issue above, but it inherits the same "no `oklch()` fallback" problem underneath it.
- **[LOW]** Optional chaining (`?.`) is used in inline `<script>` blocks without a module/transpile step (e.g. `index.html:1265-1266`'s `d?.Results?.[0]`, `res?.Results`). This is ES2020 syntax — safe on all evergreen browsers since 2020, but on an unsupported browser this throws a hard parse error that breaks the *entire* inline script block (not just that line), which on `index.html` includes VIN validation and the checkout redirect. Lower risk than the color-token issue since ES2020 has much broader support than OKLCH color, but same category of "modern-syntax, no fallback" risk.
- **Handled well:** WebGL (aurora, blog 3D hero) has real feature detection and removes itself cleanly on unsupported browsers/no-WebGL (`assets/fx-aurora.js:16-18`, `blog/blog-3d.js:94-96` try/catch), leaving the CSS gradient fallback in place — this is the correct pattern, and is exactly what's *missing* for the OKLCH color system.
- No CSS nesting (`&`) syntax found anywhere — not a risk.

---

## 8. UI / visual design quality — 80/100

Reviewed both themes via rendered screenshots (dark default and `[data-theme=light]`, `localStorage['vrh-theme']`) plus code review of `theme.css`/`fx.css`.

- Dark theme (default) renders as a cohesive, well-executed purple-primary / orange-CTA design across the homepage — hero aurora, glow-cards, star-border VIN button, bento feature grid, pricing cards with 3D hover tilt all render correctly and match the intended "modern SaaS" language. The prior "convert to theme tokens" pass (tasks #10-17) has clearly paid off: no raw hex/color literals leaking into component CSS was found during this review — everything routes through `var(--...)` tokens.
- New pages (login, signup, account, bundles, checkout) are visually consistent with the homepage: same nav shell/blur/logo treatment, same card/border/shadow language, same purple-accent + orange-CTA split used consistently (accent for links/highlights, `--cta` for every primary action button).
- The bundles grid's "Most Popular"/"Best Value" badges, feature-card glow-on-hover, and FAQ accordion all function as designed in code review.

**Findings:**

- **[MEDIUM]** The confirmed table-overflow bug from Dimension 6 is also, squarely, a visual-design defect: on a phone, ~22 blog posts show a horizontal scrollbar and/or clipped paragraph text right up against the point where the table appears — a visibly broken layout on the majority of the site's highest-page-count section. Not re-scored twice, but flagged here since it's the single biggest visual-quality issue found.
- **[LOW]** Minor inconsistency: `account.html`'s section titles (`.card-title`) look identical in weight/size to real `<h2>`s elsewhere on the site but aren't actual headings (see Dimension 4) — a visual/semantic mismatch a design-system audit would normally catch.
- **[LOW]** `redeem.html` and `admin.html` intentionally override `--accent`/`--a-*` to the site's orange (`--accent-secondary`) instead of the default purple, with a comment explaining why ("orange is this page's CTA-converting accent"). This is a deliberate, documented design choice, not a bug — noted here only because it's the one place on the site where the accent color differs from the rest of the site's purple-primary convention, and it's worth confirming that's still the intended brand decision.

---

## 9. Content correctness — 85/100

**Pricing verified exactly consistent everywhere it appears — checked programmatically across the entire site, not sampled:**

| Bundle | Total | Per-report | Savings | Consistent everywhere? |
|---|---|---|---|---|
| 1 credit | $9.99 | $9.99 | — | ✅ |
| 3 credits | $19.99 | $6.66 | 33% | ✅ |
| 10 credits | $54.99 | $5.50 | 45% | ✅ |
| 15 credits | $74.99 | $5.00 | 50% | ✅ |
| 25 credits | $99.99 | $4.00 | 60% | ✅ |

Verified matching across `index.html` (JSON-LD offers + pricing cards), `bundles.html` (JSON-LD Product offers + bundle cards ×2 locations), `checkout.html`'s client-side `BUNDLES` display object, the server-side source of truth `lib/bundles.js`, and every blog post that mentions a specific price (`blog/how-many-vin-reports-do-i-need.html`, `blog/buy-10-vehicle-history-reports.html`, `blog/bulk-vin-reports-for-dealers.html`, `blog/low-cost-car-history-report.html`, `blog/index.html`) — **zero mismatches found**.

- **0 broken internal links** across the entire site (automated check).
- No typos found in the pages reviewed in depth (homepage, checkout, account, bundles, the 5 newest blog posts).

**Findings:**

- **[HIGH, cross-referenced with Dimension 5]** The "real Carfax" / "exact same … data" language (`index.html:20,28,1101,109,1121`, detailed in Dimension 5) is also a content-*accuracy* issue, not just a trademark-risk one: VINRecordHub sources reports through a third-party API (`CHEAPVHR_API_KEY` / `api.cheapvhr.com`, per `lib/report-service.js`), not a direct Carfax/AutoCheck data feed, so "exact same data" is a claim the business likely can't fully stand behind even setting the trademark question aside. Same fix as Dimension 5.

---

## 10. End-to-end flows — 84/100

Traced signup → verify-email gate → buy credits → generate report as a static reading of the JS against the actual `api/*.js` handlers (no live Supabase/PayPal/CheapVHR credentials available in this environment, per the assignment — code-level trace only):

1. **Signup** (`signup.html:211-248`) → `vrhAuth.signUpEmail()` → on success shows the "check your email" state. ✅ matches Supabase's `signUp()` contract.
2. **Verify-email gate**: enforced in *three* independent places — `checkout.html:475-484` (client-side gate before showing the buy UI), `account.html:453-455` (client-side banner), and server-side in both `api/paypal-order.js:63` and `api/generate-report.js:32` via `isEmailVerified(user)` — so even if a client-side gate were bypassed, the server rejects the purchase/spend with `403 email_unverified`. ✅ defense in depth confirmed, not just a UI gate.
3. **Buy credits**: `checkout.html`'s `renderPayPal()` → `createOrder` calls `action:'create'` → `api/paypal-order.js` opens a `credit_orders` row *before* creating the PayPal order (so the webhook can correlate via `custom_id`) → `onApprove` calls `action:'capture'` → both the client-capture path and the PayPal webhook path converge on the same `apply_credit_purchase()` RPC, which the security audit confirmed is idempotent on capture id. ✅ traced correctly, ids line up (`orderRow.id` as `customId` in `lib/paypal.js`'s `createOrder`, matched back via `custom_id` in `api/paypal-webhook.js:38`).
4. **Generate report**: `account.html:414-422` posts `{ vin, reportType, requestId }` with a client-generated UUID (`crypto.randomUUID()`, with a fallback for older browsers at `account.html:422`) → `api/generate-report.js` derives `idempotencyKey = spend:${user.id}:${requestId}` so an accidental double-submit only spends once. Every element ID the JS references (`vinInput`, `genResult`, `balanceValue`, `historyTable`/`historyBody`, `ordersTable`/`ordersBody`) exists in the HTML — no dangling ID references found.
5. **No broken handoffs found** between any of these steps — request/response field names match on both sides in every case checked.

**Findings:**

- **[MEDIUM-HIGH, cross-referenced with Dimension 1]** The one real handoff risk is the `assets/auth.js` → `window.vrhAuth` initialization step itself (detailed in Dimension 1): every one of the five steps above *depends* on `window.vrhAuth` existing, and there's no fallback if it doesn't. This is the single point where the whole flow can fail invisibly.
- **[LOW]** `checkout.html:444-445` stashes a pending VIN in `sessionStorage['vrh-pending-vin']` set from the homepage's `?vin=` query param, and reads it back after purchase to deep-link into `account.html?vin=...` — this works, but `account.html`'s own JS never actually reads a `?vin=` query param to pre-fill `#vinInput`, so the deep link currently lands on the account page without pre-filling the VIN the user already typed on the homepage. Minor UX gap, not a broken flow (the user still has their credits and can re-type the VIN), but it's a handoff that was clearly intended to pre-fill and doesn't.
  - **Fix:** in `account.html`'s `init()`, read `new URLSearchParams(location.search).get('vin')` and set `vinInput.value` if present and valid.

---

## Top 10 must-fix issues, ranked

1. **[HIGH — Responsive]** ~22 of 26 blog posts overflow horizontally at phone width because `<table>` elements aren't wrapped for scroll (`blog/blog.css:82-83`). Confirmed via direct measurement, up to 97px of clipped content. → Dimension 6.
2. **[HIGH — SEO/Content/Trust]** "Real Carfax," "exact same … data," and "same comprehensive vehicle data" still appear in the homepage's og:description, twitter:description, a visible H2, and the FAQ (both JSON-LD and rendered) — the exact risk this review was asked to check for, still present in 5 places (`index.html:20,28,109,1101,1121`), and reinforced by a sample report that appears to be a captured real CARFAX page. → Dimensions 5 & 9.
3. **[MEDIUM-HIGH — Functionality/Robustness]** `assets/auth.js:4-8` has no error handling around Supabase client creation; a misconfigured or unsubstituted `assets/supabase-config.js` placeholder silently breaks every auth-dependent page site-wide with zero user-facing error, and there's no visible deploy-time mechanism in this repo that performs that substitution. → Dimensions 1 & 10.
4. **[MEDIUM — Cross-browser]** The entire color system (`assets/theme.css`) is 100% `oklch()`/`color-mix()` with no fallback for pre-2023 browsers — an all-or-nothing risk rather than graceful degradation. → Dimension 7.
5. **[MEDIUM — Performance]** All 26 blog pages render-block on Google Fonts instead of using the `preload`+swap pattern already established on the rest of the site (`index.html:160-161` vs `blog/carfax-vs-autocheck.html:24`). → Dimension 3.
6. **[MEDIUM — Accessibility]** `account.html`'s four card sections use `<div class="card-title">` instead of `<h2>`, breaking the page's heading outline for screen readers (`account.html:219,230,258,269`). → Dimension 4.
7. **[LOW-MEDIUM — Accessibility]** Mobile nav drawer and sample-report modal have no focus trap / focus restoration, letting keyboard users tab into hidden background content. → Dimension 4.
8. **[LOW — Functionality]** `vercel.json` mixes legacy `routes` with `headers`/`cleanUrls`/`trailingSlash`; current CLI tooling merges them without error, but it's worth one real deploy smoke test and migrating toward `rewrites` for forward compatibility. → Dimension 1.
9. **[LOW — UX]** Checkout's post-purchase deep link (`?vin=`) doesn't actually get read by `account.html`, so the VIN a user typed on the homepage isn't pre-filled after buying credits. → Dimension 10.
10. **[LOW — Performance]** `og-image.png` is 1.7MB (target <300KB); `vinny-wave.svg` is marked `loading="lazy"` despite being above the fold in the hero. → Dimension 3.

---

## Positive confirmations worth noting (ruled out as non-issues)

- Homepage does **not** overflow horizontally at 360px — an initial desktop-mode headless screenshot suggested it did, but mobile-viewport-emulated measurement (`scrollWidth === clientWidth === 360`) disproved that; flagged here explicitly so it isn't mistakenly "fixed" against a phantom bug.
- Homepage does **not** load GSAP, contrary to the review brief's assumption — already optimized.
- `sample-report.html` **is** correctly `noindex, nofollow` — a naive grep for `name="robots" content="..."` missed it only because that page's tag has `content` before `name` in attribute order.
- 0/0 broken internal links, 0/28 invalid JSON-LD blocks, 0 duplicate titles/canonicals/descriptions, 0 pricing mismatches — all checked exhaustively, not sampled.
- Color contrast tokens independently recomputed from source OKLCH values and confirmed AA-compliant (5.5:1–19:1 range) on every pair checked, in both themes.

---

## Resolution status (applied after the report, commit 4403982)

| # | Finding | Status |
|---|---|---|
| 1 | Blog tables overflow at phone width | ✅ fixed — `table{display:block;overflow-x:auto}` in blog.css |
| 2 | Homepage "real Carfax / same data" overclaim | ✅ fixed — softened og/twitter/H2/FAQ to nominative language |
| 3 | auth.js no error handling on createClient | ✅ fixed — guarded; sets `vrhAuth=null` + `data-auth-unavailable` |
| 4 | No oklch()/color-mix() fallback | ✅ fixed — `@supports not (color:oklch())` hex block (both themes) |
| 5 | Blog fonts render-blocking | ✅ fixed — preload+swap on all 26 blog pages |
| 6 | account.html section titles are `<div>` | ✅ fixed — now `<h2 class="card-title">` |
| 7 | Modals lack focus trap/restore | ✅ fixed — focus-in, Tab-trap, return-focus on mobile nav + sample modal |
| 8 | vercel.json mixes routes/headers | ⏸ deferred — works on current tooling; owner verifies on deploy |
| 9 | account.html doesn't read `?vin=` | ✅ fixed — pre-fills the deep-linked VIN |
| 10 | og-image 1.7MB; hero mascot lazy | ◑ partial — lazy removed; og-image re-export left to owner (needs image tooling) |

All HIGH and MEDIUM findings resolved. Deferred items are LOW and owner-gated.
