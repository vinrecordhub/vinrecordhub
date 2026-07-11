# VINRecordHub — Full-System Security Audit (Step A)

Date: 2026-07-11 · Scope: whole attack surface after the credit-system build.
Adversary model: modern automated attacker — credential stuffing, webhook
replay/forgery, automated fuzzing, IDOR sweeps, and prompt-injection into any
AI-touching surface. Method: code review + local static analysis + an
independent security-reviewer sub-agent pass on the credit core.

Legend: ✅ pass · 🔧 fixed in this run · ⚠️ residual (owner action)

---

## 1. Credit integrity (the core guarantee)

| Attack attempted | Result |
|---|---|
| Client writes its own `credit_balance` / inserts a ledger row | ✅ blocked. RLS is deny-by-default; `credit_transactions`, `profiles`, `credit_orders`, `reports` expose **SELECT-own-rows only**. `revoke insert,update,delete … from anon, authenticated` and the definer functions are `revoke … from public/anon/authenticated` + `grant execute … to service_role`. There is no client write path. |
| Read another user's credits/orders/reports (IDOR) | ✅ blocked. Every policy is `using (auth.uid() = user_id)`. The server endpoints additionally re-check `orderRow.user_id === user.id` before acting. |
| Forge the balance by tampering the ledger | ✅ blocked. `credit_transactions` has an append-only trigger (`forbid_ledger_mutation` rejects UPDATE/DELETE for all roles); balance is a trigger-materialized sum guarded by `CHECK (credit_balance >= 0)`. |
| Overspend via concurrent report calls (1 credit, N requests) | ✅ exactly one succeeds. `spend_credit_for_report` inserts a `-1` ledger row; the `apply_credit_tx` trigger updates `profiles` and the `CHECK (>=0)` aborts the losing transaction. Per-request `requestId` → unique `idempotency_key` also makes accidental double-submits spend once. |
| Report fails mid-call → keep the credit | ✅ refunded exactly once. `refund_report_credit` only acts on a still-`pending` report and dedupes on `idempotency_key = 'refund:report:<id>'`. |

## 2. Payment path

| Attack | Result |
|---|---|
| Replay the PayPal webhook to mint credits | ✅ blocked. Both the webhook and the capture endpoint call `apply_credit_purchase`, which locks the order row `FOR UPDATE` and inserts the grant with `idempotency_key = 'paypal_capture:<captureId>'` (`ON CONFLICT DO NOTHING`). A second delivery returns `duplicate_capture`, grants nothing. |
| Forge a webhook without a valid signature | ✅ blocked. `paypal-webhook.js` calls PayPal's `verify-webhook-signature` API with `PAYPAL_WEBHOOK_ID`; non-`SUCCESS` → 401. Verification-service outage returns 500 so PayPal retries (no silent accept). |
| Pay less than the bundle price | ✅ blocked. Price is computed server-side from `lib/bundles` + the coupons table; the client only sends a `bundleId`. `apply_credit_purchase` compares the captured amount to `amount_due_usd` (±$0.01) and marks the order `failed` on mismatch. |
| Pay in a cheap currency | 🔧 fixed. Both grant paths now refuse any capture whose `currency_code !== 'USD'`. |
| "payment succeeded" from client JS grants credits | ✅ impossible. No client callback grants anything; only a server-verified capture or the signed webhook do. |
| Coupon mints credits / drives a free path | ✅ blocked. Coupons only reduce fiat price and floor at $0.01 (PayPal can't do $0). `TESTONLY` ($1 fixed) was deliberately **not** migrated. Redemption count/`per_user_limit` enforced at quote/create and incremented inside the grant. |

## 3. Auth, sessions, OAuth

- ✅ Supabase Auth (email/password + Google). Spend and purchase both require `email_confirmed_at` (server-checked in `generate-report.js` and `paypal-order.js`, not just the UI).
- ✅ Access token verified server-side via `supabase.auth.getUser(token)` — the client can't spoof identity by editing a Bearer token.
- 🔧 Open-redirect on `?next=` in login/signup restricted to same-origin relative paths.
- ⚠️ **Owner:** lock the Supabase redirect allowlist to `https://vinrecordhub.com/account` + `/reset-password` only, and turn on "Confirm email" (see `DEPLOY_CHECKLIST.md`). OAuth redirect safety ultimately depends on that allowlist.
- ⚠️ Login brute-force / credential stuffing: mitigated by Supabase's built-in auth rate limits — confirm they're at defaults or tighter in the dashboard.

## 4. Admin surface

- 🔧 All admin endpoints (`admin-orders`, `ga-stats`, `resend-order`, `admin-coupons`) now use a **constant-time** `ADMIN_TOKEN` compare (`lib/admin-auth`), replacing `!==` (timing-oracle) and the ad-hoc check. CORS tightened from `*` to the site origin.
- ✅ Service key stays server-side; admin pages are `noindex` and disallowed in `robots.txt`.
- ⚠️ `ADMIN_TOKEN` is a single shared static secret — acceptable for a solo operator; if the team grows, move admin behind Supabase Auth with an `is_admin` claim.

## 5. Input validation / injection

- ✅ No SQL string-building anywhere — all DB access is parameterized (supabase-js query builder / `rpc` params). The definer functions validate VIN (`^[A-HJ-NPR-Z0-9]{17}$`) and report type server-side too.
- ✅ VIN/email/coupon/bundle inputs sanitized at the boundary (`lib/sanitize`, `admin-coupons` validators, bundle id is an enum).
- 🔧 Reflected XSS in the TikTok OAuth error page fixed (HTML-escaped).
- ✅ Report HTML from CheapVHR is delivered as an email attachment / sandboxed sample iframe, not injected into the app DOM.

## 6. Secrets & headers

- ✅ Client-file grep found **no** service key, PayPal secret, Resend/CheapVHR key, or admin token. `supabase-config.js` carries only URL + anon key placeholders (anon key is public-by-design; RLS is the guard).
- ✅ Strong headers already in `vercel.json` (HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy). CSP extended with `*.supabase.co` (+ `wss:`) for auth only — no `unsafe-eval`; the aurora is self-hosted so no new script origin was added.

## 7. Abuse / rate limiting

- ✅ `paypal-order` (10/min), `generate-report` (6/min), `redeem`/`check-code` (5–10/min), admin (20/min) all rate-limited per IP.
- ⚠️ The limiter is in-memory per serverless instance — best-effort across a scaled-out deployment. Acceptable at current volume; move to a shared store (Upstash/Redis) if abuse appears.

## 8. AI-adversary surface

- No LLM/prompt-processing endpoint exists in the app, so there is no prompt-injection sink. The only free-text that gets reflected (TikTok OAuth error) is now escaped. The Tawk.to chat widget is a third-party script (CSP-allowlisted) with no server-side AI integration.

---

## Residual items for the owner (none block review)
1. Supabase dashboard: enable email confirmation; lock OAuth redirect allowlist; verify auth rate limits.
2. Register the PayPal webhook and set `PAYPAL_WEBHOOK_ID`; without it the webhook safely rejects everything (verification fails closed).
3. Consider a shared-store rate limiter and (eventually) real admin auth.

Independent second-pass findings from the security-reviewer sub-agent are folded into `docs/build-run/SECURITY_AUDIT_ADDENDUM.md`.
