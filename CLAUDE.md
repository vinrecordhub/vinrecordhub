# Project Instructions

## Commands

```bash
# Dev
vercel dev               # local dev server (uses Vercel serverless runtime)

# Deploy
vercel deploy            # preview deploy
vercel deploy --prod     # production deploy

# Install deps
npm install
```

## Architecture

- HTML pages at repo root (`index.html`, `checkout.html`, etc.)
- Serverless API handlers in `api/` — each file is a Vercel function
- No build step. Static HTML + serverless JS only.

## Key Decisions

- Paddle webhooks always return HTTP 200 (even on errors) to prevent Paddle retries; errors logged for manual review
- `orders.paypal_order_id` column stores the Paddle transaction ID (column predates the Paddle migration)
- CheapVHR API calls must go through the Fixie proxy (`FIXIE_URL`) in production — direct calls are blocked by CheapVHR's IP allowlist
