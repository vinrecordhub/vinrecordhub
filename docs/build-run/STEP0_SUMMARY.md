# Build Run — Step 0: Project Map & Brief Reconciliation

Date: 2026-07-11 · Branch: `main` @ `ab92a04` (pulled, up to date)
Source brief: `VINRecordHub_Build_Brief.md`

---

## 1. What exists today

**Stack (confirmed):**
- **Frontend:** plain HTML pages at repo root, all CSS/JS inline per page. **No framework, no React, no build step.** GSAP loaded from jsDelivr on some pages.
- **Hosting:** Vercel — `vercel.json` does clean URLs, routes, and strong security headers (CSP, HSTS, XFO…). CSP currently allowlists PayPal, GTM, Tawk.to, jsDelivr.
- **Backend:** 8 Vercel serverless functions in `api/` (Hobby plan limit is 12 — commit `6e83c7c` explicitly worked to stay under it).
- **DB:** Supabase, accessed **server-side only** via service key. Tables in evidence: `orders`, `redemption_codes`. One migration file (`db/migrations/`). **RLS state unknown from the repo** — clients never touch Supabase today, so it may never have been configured.
- **Auth: none.** No customer accounts anywhere. Admin panel is gated by a static `ADMIN_TOKEN` query param.
- **Report generation:** CheapVHR API via Fixie proxy (`lib/report-service.js`), email via Resend.
- **No `.env` in the repo** — I have no live Supabase/PayPal/Paddle credentials locally; `vercel dev` will need env pulled or stubbed.

**Payment — the important finding:**
- `checkout.html` (live source of the deployed site) runs **PayPal**: client-side JS SDK, client-side price computation (incl. coupons), client-side capture, then POSTs to `/api/fulfill-order`, which re-verifies the order + amount against PayPal's API server-side and generates/emails the report.
- `api/paddle-webhook.js` also exists: a complete **Paddle** webhook handler with HMAC-SHA256 signature verification, dedupe-by-transaction-id, and Paddle price IDs mapped to the current 3 plans. **But no page loads Paddle.js** — nothing client-side ever starts a Paddle checkout.
- Project `CLAUDE.md` documents Paddle as the current direction ("orders.paypal_order_id stores the Paddle transaction ID").
- **Both providers expose verifiable signed webhooks**, so the brief's hard requirement is satisfiable either way. But which rail to build the credit system on is a real fork — see §3.

**Theming today:**
- Dark-only, but **already ~90% tokenized**: every page has a `:root` block of oklch custom properties (`--bg`, `--surface`, `--text`, `--muted`, `--accent`…). Only a handful of stray hex values.
- However the token sets are **per-page and inconsistent** (index/checkout share one palette: navy bg + orange accent; blog has its own set; admin/success/redeem/terms/privacy each have their own `:root`). Phase 1 = unify into one shared semantic token sheet + add light values + FOUC-safe toggle.
- No `prefers-color-scheme` handling, no `data-theme` anywhere.

**Coupons & codes (two separate systems):**
1. Coupon codes `TESTONLY` / `LAUNCH50` / `WELCOME20` — hardcoded in `checkout.html` *and* re-validated in `fulfill-order.js`. Price-reducing only. (Brief calls these "Saudi coupon codes" — no Saudi-specific codes exist in the repo.)
2. `redemption_codes` table + `/redeem` page + `api/redeem.js` — prepaid codes that directly generate a free report. This is effectively a proto-credit and must be reconciled with (or migrated into) the new credit ledger. Noted for the security audit: the redeem flow has no rate limiting and a non-conditional "mark used" update (concurrent double-redeem race).

**SEO/content:** 20+ blog pages exist under `/blog/` with their own CSS; sitemap.xml present. A prior report (`WEBSITE_UNDERSTANDING_REPORT.md`) flags a **trademark risk** in current Carfax®/AutoCheck® marketing copy — Phase 4 pages will use nominative "comparison/alternative" language accordingly.

---

## 2. How the four phases slot in

- **Phase 1 (theme):** consolidate the per-page `:root` blocks into one shared `/assets/tokens.css` with the brief's semantic names, dark on `:root`, light on `[data-theme="light"]`, inline pre-paint script in every `<head>`, toggle in nav. Low-risk; mostly mechanical.
- **Phase 2 (design):** the named React Bits components **do not exist in this repo** and can't run here anyway (no React, no build step). Plan: implement **vanilla ports** of the effects worth keeping (aurora hero, star-border CTA, glow cards, bento features, typewriter tagline) as small self-hosted JS/CSS modules, token-driven, lazy-mounted, `prefers-reduced-motion`-safe. CSP must be extended only for what's self-hosted (nothing external needed).
- **Phase 3 (credits/auth):** add Supabase Auth (email/password + Google) client-side via a self-hosted `supabase-js` bundle + anon key (CSP addition: `connect-src` to the Supabase project URL). New schema: `profiles`, `credit_transactions` (append-only ledger), RLS deny-by-default, `SECURITY DEFINER` spend/grant functions. Credit grant only from the verified payment webhook; spend only from a new server-side report endpoint. Delivered as **SQL migration files for your review — I will not touch the live Supabase schema** (I also have no credentials to). New endpoints must keep total functions ≤ 12.
- **Phase 4 (SEO):** new money/comparison pages following the existing blog template system; Product/Offer + FAQPage schema on `/bundles`.

---

## 3. Contradictions & decisions needed before build (per brief: "correct me if wrong")

| # | Brief assumes | Reality | Needs your call |
|---|---|---|---|
| 1 | Payment = Moyasar/Stripe, "confirm which is live" | **PayPal live on checkout; complete Paddle webhook exists but is unused by any page** | Which rail carries the credit bundles: finish the Paddle migration (overlay checkout + 5 new Paddle prices + existing verified webhook) or stay on PayPal (keep checkout, add PayPal signed webhook for grants)? |
| 2 | React Bits components "available locally" | **Absent from repo; site has no React/build step** | Vanilla ports (recommended) vs. pure-CSS simplification vs. you point me at where they live |
| 3 | (implied) purple+orange become the brand accents | Current dark brand accent is orange/gold on navy | Apply purple+orange to **both** themes (token spec implies this) or light-mode only? |
| 4 | "Existing Saudi coupon codes" | Only TESTONLY/LAUNCH50/WELCOME20 + the separate redemption-codes system | Confirm what should survive: keep coupons as fiat-price-reducers at checkout (per brief) and treat `redemption_codes` as legacy to migrate/retire? |
| 5 | — | No local env/credentials; live schema/RLS state unverifiable from repo | Migrations + config changes ship as reviewable files/instructions; Google OAuth client + Supabase dashboard config will need you |

**Non-blockers (noted, will handle):** function-count ceiling (consolidate endpoints); `fulfill-order` trusts client-picked plan+coupon but does verify amount server-side (will be replaced by the credit flow anyway); redeem race + missing rate limits (security audit scope); trademark copy risk (Phase 4 wording).
