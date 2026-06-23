# VinRecordHub — SEO Implementation Checklist

Prepared 2026-06-22 · Branch `seo/ruflo-setup`
Use with `SEO_TOPIC_PLAN.md` + `SEO_KEYWORD_MAP.csv`. Stack: static HTML on Vercel, no build step.

Legend: `[ ]` to do · `(owner)` = needs business/legal decision · `(dev)` = code change.

---

## 0. ⚠️ Gate before publishing (do this first)
- [ ] **(owner/legal)** Decide the Carfax/AutoCheck trademark position (see
  `../WEBSITE_UNDERSTANDING_REPORT.md` §8). Confirm whether any CheapVHR↔Carfax licensing exists.
- [ ] **(owner)** Approve trademark-safe wording rules (comparison-only language + disclaimer).
- [ ] **(owner)** Approve creating the content/blog system and the Tier-1 pages.

> Nothing in the content plan ships until these are settled. The plan is written to be safe
> *if* there is no license; if a license exists, copy can be loosened with proof.

---

## 1. Technical SEO fixes
- [ ] **(dev)** Rebuild `sitemap.xml`: keep `/`, drop nothing legitimate, **add** `/checkout`,
  re-weight (home 1.0; commercial pages 0.8; guides 0.6; legal 0.3) and add every new content URL.
- [ ] **(dev)** `noindex` low-value transactional pages: add `<meta name="robots" content="noindex,follow">`
  to `success.html` and `redeem.html` (or `X-Robots-Tag` in `vercel.json`).
- [ ] **(owner/dev)** Review `sample-report.html` (1 MB, branded). Options: (a) replace with a
  neutral/redacted sample, (b) `noindex` it, (c) gate it behind purchase. Decide per §0.
- [ ] **(dev)** Add a self-referencing `<link rel="canonical">` to every page (only home has one).
- [ ] **(dev)** Confirm Vercel returns proper `404` (and `410` for removed URLs) status codes.
- [ ] **(dev)** Keep CSP intact when adding pages; new inline scripts must fit existing `script-src`.
- [ ] Verify page speed/Core Web Vitals (static HTML is already fast — keep images optimized;
  the 1 MB sample page is the main offender).
- [ ] Add `lastmod` to sitemap entries and automate regeneration when content is added.

## 2. On-page SEO fixes
- [ ] **(owner/dev)** Reframe homepage `<title>`, meta, OG/Twitter, and `Service`/`Offer`/`FAQ`
  schema from "real Carfax®… same data" to "affordable vehicle history report / Carfax alternative."
  Rename schema offers to neutral product names (e.g., "Standard Vehicle History Report").
- [ ] Drop the legacy `<meta name="keywords">` on rebuilds (ignored by Google).
- [ ] Ensure one `<h1>` per page, descriptive headings, and primary keyword in title + H1 + first 100 words.
- [ ] Add an internal-link CTA block to `/checkout` on the homepage and checkout that points to
  the new cluster pages once live.
- [ ] Add descriptive `alt` text to images; use the brand consistently as "VinRecordHub".

## 3. Content creation order (from the prioritized roadmap)
**Tier 1 (build first):**
- [ ] 1 `/carfax-alternative`
- [ ] 2 `/cheaper-than-carfax`
- [ ] 7 `/cheap-vehicle-history-report`
- [ ] 8 `/affordable-vehicle-history-report`
- [ ] 11 `/vin-check`
- [ ] 12 `/vin-report`
- [ ] 19 `/buy-vehicle-history-report`

**Tier 2 (build after):**
- [ ] 6 `/vehicle-history-report` (pillar) · 4 `/autocheck-alternative` · 5 `/carfax-competitors`
- [ ] 9 `/low-cost-car-history-report` · 10 `/car-history-report` · 13 `/instant-vin-report` · 14 `/used-car-history-report`

**Tier 3 (long-term):**
- [ ] 15 `/accident-history-report` · 16 `/title-check` · 17 `/salvage-title-check` · 18 `/odometer-check`
- [ ] 3 `/cheap-carfax-report` · 20 `/how-much-does-carfax-cost`  *(highest trademark caution — ship last)*

## 4. Internal linking plan
- [ ] **Hub-and-spoke:** make `/vehicle-history-report` the pillar; every report-type, VIN, and
  affordability page links **up** to it; the pillar links **down** to all of them.
- [ ] **Alternative cluster:** `/carfax-competitors` and `/how-much-does-carfax-cost` link down to
  `/carfax-alternative`, `/cheaper-than-carfax`, `/autocheck-alternative`.
- [ ] **Every content page** includes a VIN-CTA link to `/checkout` (the only conversion goal).
- [ ] Add a footer "Guides" section linking the pillar + top cluster pages site-wide.
- [ ] Use descriptive anchor text (the target's primary keyword), not "click here".
- [ ] Cross-link siblings (e.g., `/title-check` ↔ `/salvage-title-check`; `/vin-check` ↔ `/vin-report`).

## 5. Schema markup suggestions
- [ ] Keep homepage `WebSite` + `Service` + `FAQPage` (after wording fix).
- [ ] Each guide/blog page: `Article` (or `BlogPosting`) + `FAQPage` for its FAQ block.
- [ ] Each comparison page: `FAQPage`; optionally a `Product`/`Offer` for the report being sold.
- [ ] Add `BreadcrumbList` once `/guides/...` or `/blog/...` hierarchy exists.
- [ ] **Do not** use `Organization` or `sameAs` claims implying Carfax/AutoCheck affiliation.
- [ ] Validate everything in Google's Rich Results Test before deploy.

## 6. Sitemap recommendations
- [ ] One `sitemap.xml` listing home, commercial pages, all live content pages, and legal pages.
- [ ] Exclude `/admin`, `/api/*`, `/success`, `/redeem`, and any `noindex` URLs.
- [ ] Add `<lastmod>` and realistic `<changefreq>`/`<priority>`.
- [ ] Regenerate the sitemap as part of shipping each content page (script or manual checklist item).

## 7. Robots.txt recommendations
- [ ] Keep `Disallow: /admin` and `Disallow: /api/`.
- [ ] Optionally `Disallow: /success` and `/redeem` (belt-and-suspenders with `noindex`).
- [ ] Keep the `Sitemap:` line; ensure it matches the live sitemap URL.
- [ ] Do **not** block `/blog/` or `/guides/` — those must be crawlable.

## 8. Analytics / Search Console checklist
- [ ] **(owner)** Verify the domain in **Google Search Console**; submit `sitemap.xml`.
- [ ] **(owner)** Verify **Bing Webmaster Tools** too (used-car buyers skew Bing/Edge on desktop).
- [ ] Confirm GA/GTM fires on new content pages (CSP already allows GTM/GA).
- [ ] Add an event for **VIN-CTA clicks** per content page (ties content → `/checkout` intent).
- [ ] Track `/checkout` starts and completed orders by landing page (Supabase `orders` already
  stores order data — attribute first-touch landing page where possible).
- [ ] Monitor Search Console: impressions/clicks/position per cluster; refresh underperformers at 8–12 weeks.

---

## How to add the content/blog system (recommended)
Because this is static HTML on Vercel, the cleanest approach is a **flat folder of HTML pages
from one reusable template** — no framework needed:

```
/guides/                         (or /blog/)
  carfax-alternative.html
  cheaper-than-carfax.html
  vin-check.html
  ...
/partials/  (optional)
  head.html         <- per-page <title>/meta/canonical/schema slot
  header.html
  footer-cta.html   <- shared VIN CTA -> /checkout
```
- Add routes to `vercel.json` (or rely on `cleanUrls` so `/guides/vin-check` serves the file).
- Build **one template** with: shared header/footer, a VIN-CTA block, and per-page slots for
  `<title>`, meta description, canonical, H1, body, and JSON-LD schema.
- If hand-maintaining 20 files gets heavy, add a tiny **build step** (e.g., a Node script that
  renders Markdown + front-matter into the template) — but only if needed; the plan works
  without one.
- Extend `sitemap.xml` for each new page.

> **No content pages have been created** — this is the recommended structure, pending approval (§0).
