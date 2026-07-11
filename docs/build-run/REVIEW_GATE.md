# Review Gate (Step C) — STOP before push

Build, full-system audit, and 10-dimension QA are all green. **Nothing has been
pushed.** 11 local commits sit on `main` ahead of `origin/main`, awaiting your
explicit green light.

## What to review first (highest-signal files)
| Area | Files |
|---|---|
| Credit DB model (RLS, ledger, definer fns, coupon reservation) | `db/migrations/2026-07-11-credit-system.sql` |
| Payment endpoints | `api/paypal-order.js`, `api/paypal-webhook.js`, `api/generate-report.js` |
| Coupons admin API | `api/admin-coupons.js` |
| Shared libs | `lib/bundles.js`, `lib/paypal.js`, `lib/supabase-server.js`, `lib/admin-auth.js` |
| Buy flow | `checkout.html`, `bundles.html` |
| Account / auth | `account.html`, `login.html`, `signup.html`, `reset-password.html`, `assets/auth.js` |
| Theme system | `assets/theme.css`, `assets/theme.js` |
| FX | `assets/fx-aurora.js`, `assets/fx.js`, `assets/fx.css` |
| Homepage | `index.html` |
| Reports | `docs/build-run/SECURITY_AUDIT.md`, `SECURITY_AUDIT_ADDENDUM.md`, `QA_REPORT.md` |

## Scores
- Security: 10/11 guarantees passed on first review; the one failure (coupon
  TOCTOU) is fixed and re-verified. No credit-minting / double-grant / IDOR /
  injection / negative-balance / secret-leak path.
- QA: 80/100 overall. All HIGH and MEDIUM findings fixed. Remaining items are LOW
  and owner-gated (below).

## Deliberately NOT changed (need your call)
1. **`sample-report.html`** appears to be a captured real CARFAX page (its own
   title/CSS classes). It concretely reinforces the "real Carfax" positioning.
   This is a legal/brand decision — I softened the homepage copy but left this
   asset alone per the brief ("don't change the sample report"). Recommend legal
   review or replacing it with a neutral branded sample.
2. **`vercel.json`** mixes `routes` with `cleanUrls`/`headers`. Works on current
   Vercel tooling; migrating `routes`→`rewrites` is safer but I can't smoke-test
   a deploy from here. Verify on first `vercel deploy`.
3. **`og-image.png` (1.7 MB)** — re-export < 300 KB (needs image tooling you have).

## Owner actions before this works live (full list in DEPLOY_CHECKLIST.md)
- Run the migration in Supabase; set anon URL/key in `assets/supabase-config.js`.
- Enable email confirmation; lock the OAuth redirect allowlist to
  `/account` + `/reset-password`.
- Register the PayPal webhook → set `PAYPAL_WEBHOOK_ID`; the webhook fails closed
  until then.

## To ship
Say the word and I'll push all 11 commits to `origin/main`. Until then I hold.
