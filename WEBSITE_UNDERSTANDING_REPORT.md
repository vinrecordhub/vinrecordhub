# VinRecordHub — Website Understanding Report

Prepared 2026-06-22 during the SEO/Ruflo setup. Branch: `seo/ruflo-setup`.
Source of truth: the repo at commit `c221fb2` plus live metadata in the HTML files.

---

## 1. What the website does

VinRecordHub sells **vehicle history reports** keyed off a car's **VIN**. A buyer enters a
VIN, pays a one-off fee, and receives a report by email within ~60 seconds. There is **no
subscription** and **no customer login** — it's a transactional, pay-per-report storefront.

**Pricing (from homepage schema):**
- Standard report — **$9.99**
- Second report type — **$9.99**
- Combo (both) — **$14.99**

### Tech stack
| Layer | Tech |
|-------|------|
| Frontend | Plain **HTML** pages at repo root, inline CSS/JS. **No framework, no build step.** |
| Hosting/routing | **Vercel** (`vercel.json`: clean URLs, security headers, route rewrites) |
| Backend | **Vercel serverless functions** in `api/` (one file = one function) |
| Shared logic | `lib/` — `report-service.js`, `rate-limit.js`, `sanitize.js` |
| Database | **Supabase** (`@supabase/supabase-js`) — `orders` table, migrations in `db/migrations` |
| HTTP client | `undici` (with `ProxyAgent` via **Fixie** static-IP proxy) |
| Report data provider | **CheapVHR API** (`api.cheapvhr.com/v1`) — generates the actual reports |
| VIN decode | **NHTSA vPIC** (`vpic.nhtsa.dot.gov`) — free, client-side allowed in CSP |
| Payments | **Paddle** (primary, webhook-driven) + **PayPal** (legacy `fulfill-order`) |
| Email delivery | **Resend** |
| Chat | **Tawk.to** |
| Analytics | **Google Tag Manager / GA** + a self-hosted stats endpoint (`api/ga-stats.js`) |

### Pages / routes (from `vercel.json` + repo)
| Route | File | Purpose | Indexable |
|-------|------|---------|:---------:|
| `/` | `index.html` (1392 lines) | Landing page / sales page | ✅ |
| `/checkout` | `checkout.html` | VIN entry + payment | ✅ (thin) |
| `/success` | `success.html` | Post-payment confirmation | ✅ (should be noindex) |
| `/redeem` | `redeem.html` | Redeem a prepaid code | ✅ (should be noindex) |
| `/terms` | `terms.html` | Legal | ✅ |
| `/privacy` | `privacy.html` | Legal | ✅ |
| `/admin` | `admin.html` | Internal order admin | ❌ noindex (correct) |
| `/sample-report` (file) | `sample-report.html` (**1 MB**) | Example report | ⚠️ see risk |

### API routes (`api/`)
| Endpoint | Role |
|----------|------|
| `paddle-webhook.js` | Receives Paddle events → generates report(s) → emails buyer. Always returns 200. |
| `fulfill-order.js` | Legacy PayPal flow: verify payment → generate → email. |
| `redeem.js` | Validate redemption code → generate report → email. |
| `check-code.js` | Validate a redemption code (read-only). |
| `resend-order.js` | Admin: re-deliver a report (reuses existing CheapVHR report id, free). |
| `admin-orders.js` | Admin: list orders (token-gated, service key stays server-side). |
| `ga-stats.js` | Analytics from Supabase order data. |
| `tiktok/` | TikTok-related integration. |

### Flows
- **Payment flow:** Buyer picks plan on `/checkout` → pays via Paddle (or PayPal legacy) →
  webhook verifies signature (HMAC-SHA256) → maps Paddle price ID to plan/report types.
- **Report generation:** `lib/report-service.js` calls CheapVHR `GET /{type}/vin/{VIN}/html`
  (costs 1 credit, 20/type/day limit) through the **Fixie proxy** (CheapVHR IP-allowlists).
  Existing reports for the same VIN are reused for free when recent. Report ids persist in
  Supabase so re-delivery is free.
- **Auth:** **No customer auth.** Admin is protected by a server-side token only.
- **Fulfillment recovery:** VIN + report ids stored so failed deliveries can be re-sent free.

---

## 2. Target customer

- **Used-car buyers** doing due diligence before purchase (private-party or dealer).
- **Budget-conscious shoppers** who balk at Carfax/AutoCheck's ~$40+ single-report pricing
  and search for a "cheaper" or "alternative" option.
- **Private sellers** who want a report to build buyer trust.
- **Small/independent dealers** needing occasional reports without a subscription.

Intent is **high and transactional** — these people are minutes away from buying a car and
want a report *now*.

## 3. Main conversion goal

**One thing:** get the visitor to enter a VIN and complete a one-off purchase on `/checkout`
(standard / second-type / combo). Secondary: redeem a prepaid code. There is no signup,
newsletter, or upsell funnel — so SEO must drive *purchase-ready* traffic, not just clicks.

---

## 4. Existing SEO strengths

- ✅ Clean, semantic URLs via `cleanUrls` + route rewrites (`/checkout`, not `.html`).
- ✅ Solid `<head>` on the homepage: title, meta description, keywords, canonical,
  Open Graph + Twitter cards, theme-color, favicons.
- ✅ **Structured data** on the homepage: `WebSite` + `SearchAction`, `Service` with
  `Offer` pricing, and a `FAQPage` block — good rich-result potential.
- ✅ `robots.txt` present and sane (`Disallow: /admin`, `/api/`) + sitemap reference.
- ✅ Strong security headers / CSP in `vercel.json` (Google treats HTTPS+headers as a plus).
- ✅ Fast by construction: static HTML, no JS framework, no hydration cost.

## 5. SEO weaknesses

- ❌ **Single-page site for organic purposes.** Only `/` targets commercial keywords. No
  blog, guides, comparison pages, or VIN-education content → almost no long-tail surface.
- ❌ **Sitemap is nearly empty** (3 URLs: `/`, `/privacy`, `/terms`) and mis-prioritized
  (privacy/terms shouldn't be the only siblings of the homepage). `/checkout` not listed.
- ❌ **Only the homepage has structured data.** No `BreadcrumbList`, no `Article`/`FAQ`
  schema on any other page (none exist yet).
- ❌ **Keyword meta tag** is used (ignored by Google) while higher-value on-page content for
  alternative/comparison intent is missing.
- ❌ **Thin/duplicate-risk transactional pages** (`/success`, `/redeem`) are indexable but
  have no SEO value and should be `noindex`.
- ❌ **No internal linking structure** — without content pages there's nothing to link, so
  no topical authority is being built.

## 6. Technical SEO issues

| Issue | Severity | Fix |
|-------|:--------:|-----|
| Sitemap missing real pages + future content | High | Regenerate sitemap; automate as pages are added |
| `/success`, `/redeem` indexable | Medium | Add `<meta name="robots" content="noindex">` (or `X-Robots-Tag`) |
| `sample-report.html` is 1 MB and indexable | High | See §8 (trademark) — gate/noindex/replace |
| No canonical on non-home pages | Medium | Add self-referencing canonicals to every page |
| No `BreadcrumbList` schema | Low | Add once a content hierarchy exists |
| Keyword meta tag (legacy) | Low | Harmless but useless; drop on rebuilds |
| No 404/410 handling noted | Low | Confirm Vercel default 404 returns proper status |

---

## 7. Content gaps (the real opportunity)

VinRecordHub has **commercial pages but no content engine**. Every high-intent searcher
comparing options, checking what a VIN reveals, or hunting a "cheaper than Carfax" option
hits a wall — there's no page to rank. The gap, by cluster:

1. **Alternative / comparison** — "carfax alternative", "cheaper than carfax",
   "autocheck alternative", "carfax competitor". *Highest commercial value.*
2. **Affordability** — "cheap vehicle history report", "affordable / low cost car history report".
3. **VIN education** — "VIN check", "VIN report", "where is my VIN", "decode a VIN".
4. **Report-type intent** — "accident history report", "title check", "salvage title check",
   "odometer / mileage check".
5. **Buyer guides** — "how to check a used car before buying", "is a vehicle history report worth it".

---

## 8. ⚠️ Trademark / legal risk (read before publishing anything)

This is the most important finding and it conflicts with the project's own stated rules
("don't pretend to be Carfax; don't claim partnership unless proven").

**Current live wording overclaims a Carfax/AutoCheck relationship:**
- Homepage `<title>`: *"VINRecordHub — Carfax® & AutoCheck® Reports from $9.99"*.
- Meta/OG/Twitter: *"real Carfax® & AutoCheck® vehicle history reports"*, *"Same data,
  delivered in 60 seconds."*
- `Service`/`Offer` schema names offers literally **"Carfax® Report"** and **"AutoCheck® Report"**.
- FAQ schema: *"VINRecordHub … provides access to Carfax® & AutoCheck® reports through our platform."*
- `sample-report.html` (**1 MB**) reproduces what reads as an actual **CARFAX-branded report**
  (30+ "CARFAX" strings incl. "CARFAX Vehicle History Report", CARFAX guarantee/disclaimer text).

**Why this is a problem:** Carfax® and AutoCheck® are registered trademarks. Marketing that
implies you *are* them, *resell* them, or deliver "the same data" — without a proven license —
invites trademark/false-advertising complaints and Google "deceptive content" risk. The
actual data provider is **CheapVHR**, not Carfax/AutoCheck directly.

**Recommended repositioning (used throughout the SEO plan):**
- Brand as an **affordable vehicle history report** service and a **Carfax alternative** —
  comparison/nominative language is generally permissible ("compare options",
  "an alternative to Carfax"), claiming to *be*/*resell* them is not.
- Replace offer names with neutral product names ("Standard Vehicle History Report", etc.).
- Confirm with the business whether any CheapVHR↔Carfax licensing actually exists. **If it
  does not, the "real Carfax / same data" claims and the branded sample report should be
  revised by the owner / legal before scaling SEO.** This report does not change that copy;
  it flags it.

> I did **not** edit any live marketing copy. This is a recommendation for you/legal to act on.

---

## 9. Recommended fixes (priority order)

1. **Decide the trademark position** (legal) → unblocks safe copy across the site. *(owner)*
2. **Add an SEO content system** (blog/guides) — see §11 and `seo/SEO_IMPLEMENTATION_CHECKLIST.md`.
3. **Rebuild the sitemap** to include real pages + new content; automate it.
4. `noindex` the transactional pages (`/success`, `/redeem`); review `sample-report.html`.
5. **Reframe homepage + checkout copy** to "affordable / alternative" language.
6. **Add structured data** to new content (`Article`, `FAQPage`, `BreadcrumbList`).
7. **Build internal links** from content → `/checkout` (the money page).
8. Set up **Search Console + analytics** tracking for the new content cluster.

## 10. Pages that should be created first

(See full plan + tiers in `seo/SEO_TOPIC_PLAN.md`.) Top 5:
1. **Carfax alternative** comparison page (`/carfax-alternative`).
2. **Cheaper than Carfax** / affordable report page (`/cheaper-than-carfax`).
3. **Free VIN check vs paid VIN report** guide (`/vin-check`).
4. **AutoCheck alternative** comparison page (`/autocheck-alternative`).
5. **What a vehicle history report shows** buyer guide (`/what-is-a-vehicle-history-report`).

## 11. Does the site support content pages today?

**Not yet, but adding them is trivial** because it's static HTML on Vercel:
- Create a `/blog/` (or `/guides/`) directory of HTML pages, or a small data-driven generator.
- Add matching routes to `vercel.json` (or rely on `cleanUrls`).
- Build **one reusable page template** (shared header/footer/CTA + per-page `<head>` + schema).
- Extend the sitemap as pages are added.

Detailed recommendation is in `seo/SEO_IMPLEMENTATION_CHECKLIST.md`. **No content pages have
been created yet — awaiting your approval (per the brief).**
