# Credit System — Deploy Checklist (owner actions)

Everything below needs your credentials/dashboards; the code is ready and waiting on these. Do them in order.

## 1. Supabase — schema
- [ ] Open the Supabase SQL editor and run `db/migrations/2026-07-11-credit-system.sql` (review it first — it creates `profiles`, `credit_transactions`, `coupons`, `coupon_redemptions`, `credit_orders`, `reports`, enables RLS on everything incl. legacy tables, and installs the SECURITY DEFINER functions).
- [ ] Verify with: `select * from public.coupons;` → should show LAUNCH50 / WELCOME20 / TESTONLY (all ACTIVE, scoped to checkout plans — they replace the codes previously hardcoded in checkout.html, so behavior is unchanged).
- [ ] **Disable TESTONLY from the admin panel before real traffic** — it sets any single-report/combo price to $1.

## 2. Supabase — Auth configuration (Dashboard → Authentication)
- [ ] Providers → Email: ON, **Confirm email: ON** (required — spending is gated on verified email).
- [ ] Providers → Google: ON. Create an OAuth client in Google Cloud Console (type: Web application):
      - Authorized JavaScript origins: `https://vinrecordhub.com`
      - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
      Paste client id + secret into Supabase.
- [ ] URL Configuration:
      - Site URL: `https://vinrecordhub.com`
      - Redirect URLs (exact allowlist, nothing else): `https://vinrecordhub.com/account`, `https://vinrecordhub.com/reset-password`
- [ ] Auth → Rate limits: keep defaults or tighten (they gate brute-force login).

## 3. Client config file
- [ ] Edit `assets/supabase-config.js`: set your project URL and **anon** key (never the service key — the anon key is public by design; RLS is the guard).

## 4. Vercel — environment variables
Existing (verify still set): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `ADMIN_TOKEN`, `CHEAPVHR_API_KEY`, `FIXIE_URL`, `RESEND_API_KEY`.
New:
- [ ] `PAYPAL_WEBHOOK_ID` — see step 5.
- [ ] (optional) `PAYPAL_ENV=sandbox` for a test deploy; unset/`live` in production.
Removed (can delete after deploy): `PADDLE_WEBHOOK_SECRET` (Paddle handler retired).

## 5. PayPal — webhook registration
- [ ] developer.paypal.com → your live app → Webhooks → Add:
      URL `https://vinrecordhub.com/api/paypal-webhook`, event **Payment capture completed**.
- [ ] Copy the generated Webhook ID into Vercel as `PAYPAL_WEBHOOK_ID`.

## 6. Post-deploy smoke test (sandbox first if possible)
1. Sign up with a fresh email → confirm the verification email arrives and the link lands on /account.
2. Buy the 1-credit bundle → credits appear after payment (webhook + capture both grant idempotently).
3. Generate a Carfax report with a real VIN → email arrives, balance drops to 0.
4. Try to generate again → clean "insufficient credits" error, balance stays 0.
5. Admin panel → coupons tab → activate WELCOME20, set max redemptions, re-test checkout with it.

## Notes / decisions embedded in the build
- Coupons floor at $0.01 — PayPal can't process $0; a truly free grant must be an `admin_adjust` ledger entry, never a checkout path.
- `TESTONLY` ($1 fixed price) is migrated as a checkout-only `set_price` coupon; the bundle flow and admin validation both refuse `set_price` on bundles (a $1 25-credit bundle would be a credit-minting hole). Disable it from the admin panel before launch.
- Legacy `redemption_codes` (/redeem) still works for already-sold codes; it's now RLS-locked server-side like everything else.
- Legacy `orders` table untouched; new purchases live in `credit_orders`.
