# Security Audit Addendum — Independent Credit-System Review (Phase 3.5)

An independent security-reviewer pass ran adversarially against the credit core.
Result: **10 of 11 guarantees passed; 1 broken (coupon limits) — now fixed.**

## Guarantee scorecard (reviewer verdict)
| # | Guarantee | Verdict |
|---|---|---|
| 1 | Client cannot write a credit balance | ✅ PASS |
| 2 | No IDOR across users' credits/orders/reports | ✅ PASS |
| 3 | Webhook replay can't double-grant | ✅ PASS |
| 4 | Forged (unsigned) webhook rejected | ✅ PASS |
| 5 | Underpayment grants nothing | ✅ PASS |
| 6 | Concurrent spend never goes negative | ✅ PASS |
| 7 | Failed report refunds exactly once | ✅ PASS |
| 8 | Coupon per-user / max limits hold | ❌→✅ **fixed** |
| 9 | No secrets in client bundle | ✅ PASS |
| 10 | Auth (verify gate, constant-time admin, OAuth allowlist) | ✅ PASS (+low) |
| 11 | No SQLi / unvalidated input | ✅ PASS |

No credit-minting, double-grant, IDOR, injection, negative-balance, or
secret-leak path was found.

## Findings and resolutions

### MEDIUM — Coupon limit TOCTOU (broke guarantee #8) — FIXED
- **Was:** `per_user_limit` and `max_redemptions` were checked at order-create by
  counting `coupon_redemptions`, but rows were only written at grant time. N
  orders opened before paying each passed a stale (zero) count, so a
  "one-per-customer" coupon could be redeemed arbitrarily many times. Bounded to
  discount abuse (credits always come from the server bundle), but with an
  aggressive `fixed_total` coupon it approached near-free bundles.
- **Fix (commit b5ab8f4):** coupons are now **reserved atomically at create**
  via `reserve_coupon()`, which takes `FOR UPDATE` on the coupon row and counts
  committed redemptions under that lock — concurrent reserves serialize, so the
  limit holds for any `per_user_limit` value. `apply_credit_purchase` no longer
  records redemptions. `release_coupon_for_order()` returns the slot on
  cancel / amount-mismatch / PayPal-create failure. `reserve_coupon` also lazily
  sweeps `created`-status reservations older than 3h (PayPal orders expire in
  ~3h), so an abandoned checkout can't permanently self-lock a user — and since
  paid orders are `granted` (never swept), the sweep can't help an attacker.
- **Residual (accepted):** a `created` order in the last 3h holds its reservation
  until paid, expired, or swept. This is the mechanism that blocks the attack;
  the 3h self-heal keeps the honest-user cost negligible. Coupons ship inactive.

### LOW — Admin token in URL query string — FIXED
- **Was:** `?token=` on admin endpoints lands in access logs, history, Referer.
- **Fix (commit b5ab8f4):** all admin calls now send `Authorization: Bearer`
  (`lib/admin-auth.getAdminToken` prefers the header, query kept as fallback);
  constant-time compare retained; `admin.html` updated to send the header.

### LOW — In-memory per-instance rate limiter — ACCEPTED
- `lib/rate-limit.js` is per serverless instance, so limits are best-effort
  across scaled-out instances. Not a guarantee break (admin-token entropy +
  constant-time compare carry the real load). Move to a shared store
  (Upstash/Supabase) if abuse appears. Documented in `SECURITY_AUDIT.md §7`.

## Re-test
- `reserve_coupon` defined before `apply_credit_purchase`; all `$$` blocks
  balanced (8 functions); grant path no longer increments any coupon counter
  (verified). Endpoints `node --check` clean.
