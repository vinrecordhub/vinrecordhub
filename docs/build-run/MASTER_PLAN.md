# Build Run — Master Plan & Orchestration Log

Run started 2026-07-11. Orchestrator: Claude Fable 5 (master agent).
Brief: `VINRecordHub_Build_Brief.md` · Step 0 map: `docs/build-run/STEP0_SUMMARY.md`

## Locked decisions (user, 2026-07-11)
1. **Payment rail: PayPal** — keep PayPal checkout; move order creation/capture server-side; add signed PayPal webhook as the only credit-grant source; retire `paddle-webhook.js` + legacy `fulfill-order.js` at cutover.
2. **Components: vanilla JS ports** of the React Bits effects, self-hosted, token-driven, no build step.
3. **Brand: purple primary + orange secondary in both themes** (dark keeps navy base).
4. **Coupons: database-driven** — redeemed at checkout, fiat-price only, scoped per bundle ("categorical"), admin CRUD incl. max-redemption counts. `redemption_codes` stays honored as legacy; not part of the new flow.

## Run order
| Stage | Scope | Executor | Commit |
|---|---|---|---|
| Phase 1 | Semantic tokens, light palette, FOUC-free toggle, all pages | Fable direct (core pages + tokens); frontend sub-agent for mechanical conversion of secondary/blog pages, verified by Fable | `feat(theme)` |
| Phase 2 | Aurora hero, star-border CTAs, glow cards, bento, typewriter — vanilla ports | Fable direct (design-critical per brief) | `feat(design)` |
| Phase 3 | Supabase Auth, credit ledger + RLS + SECURITY DEFINER fns (SQL files only), server-side PayPal order+capture, signed webhook grant, DB coupons + admin CRUD, /bundles + homepage section + checkout, account area | Fable direct (security-critical per brief) | `feat(credits)` |
| Phase 3.5 | Adversarial pass on credit system (brief §3.5 checklist) | Fable direct | fixes folded in |
| Phase 4 | SEO money/comparison pages, Product/Offer + FAQPage schema, interlinking | Fable + content sub-agent where parallel | `feat(seo)` |
| Step A | Full-system A–Z security audit, written report, fix, re-test | Fable direct + security-reviewer sub-agent as second pair of eyes | `fix(security)` |
| Step B | 10-dimension QA, scored report, fixes | QA sub-agents (dimension sweeps) + Fable verification | `fix(qa)` |
| Step C | **STOP.** Present for review. No push without explicit green light. | — | — |

## Hard constraints
- Client can never write a credit balance; grants only via verified webhook; spends atomic server-side.
- No live Supabase schema changes from this machine — migrations ship as reviewable SQL in `db/migrations/`.
- ≤ 12 Vercel functions (Hobby). Budget: retire 2 legacy (paddle-webhook, fulfill-order), add 4 (paypal-order, paypal-webhook, generate-report, admin-coupons) → 10 total.
- No FOUC; WCAG AA both themes; reduced-motion fallbacks; never block LCP on WebGL.
- Local commits per phase; **no pushes** until user green light (Step C).

## Environment limits (accepted)
- No `.env` / live credentials locally → E2E against live Supabase/PayPal is out of scope until user runs it; QA uses static serving + code-level verification + local simulation of webhook payloads.
- Google OAuth client + Supabase dashboard config (providers, redirect allowlist, email verification) documented for the user in `docs/build-run/DEPLOY_CHECKLIST.md` (written during Phase 3).
