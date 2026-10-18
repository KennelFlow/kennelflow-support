# Kennel One migration to Cloudflare Pages

## Safety
Do not switch customer-facing DNS before Cloudflare Pages previews load correctly and an owner-verified end-to-end test of login, record saves, Square payment callbacks, customer records, and legacy redirects. Existing production services must remain live for rollback.

## Public marketing website (static, no backend)
Source: `deploy/kennelone-public` in this repo, with a same-origin Square checkout proxy in `cloudflare/public/functions`.
Create a Cloudflare Pages project `kennelone-public` via Git integration or Wrangler direct upload, then use:
`cd cloudflare/public && npx wrangler pages deploy ../../deploy/kennelone-public --project-name kennelone-public --branch=main`
Verify all pages: /, /shop.html, /support.html, /privacy.html, /terms.html, /checkout.html.
When verified, add `kennelone.app` and `www.kennelone.app` custom domains in Pages. Apex requires Cloudflare zone activation, with Namecheap NS changes and preservation of all current DNS and email records.

## Business portal (static frontend + compatibility API)
Source: `cloudflare/portal/public` and Pages Functions in `cloudflare/portal/functions`.
`cd cloudflare/portal && npx wrangler pages deploy public --project-name kennelone-portal --branch=main`
The Pages Function bridges same-origin /api requests to the current Render backend, preserving cookies. It is a temporary bridge, not the final backend migration. Users see the login page without Render's sleeping splash, but a first API request may still take longer while Render wakes. Do not shut down the Render business service until its auth sessions, entire API surface, and payment endpoints have moved and been tested.

## Payments
Square and its production webhook remain on Render until independently migrated and verified against a sandbox. Preserve the existing Square callback URLs and secret keys; do not change customer checkout routes prematurely.

The public storefront sends POST /store/create-checkout to a Cloudflare Pages Function on its own origin. That Function delegates to the existing Square payment service (no card numbers are processed here). Do not disable payments.kennelone.app until Square production and sandbox are moved and audited.

## Local checks
`cd cloudflare/portal && npm test`
`npx wrangler pages dev public` (local preview; verify /api same-origin behavior).
Do not commit environment secrets or access tokens.

`cd cloudflare/public && npm test`

## Direct portal API migration (controlled rollout)
Source: cloudflare/portal/functions/api/[[path]].js. Without encrypted KO_SESSION_KEY, routes still use the legacy Render bridge. With a valid hex-encoded 256-bit KO_SESSION_KEY (Pages environment *secret*), newly authenticated sessions use AES-GCM protected host-only HttpOnly cookies and call the existing Neon API directly. Render sessions continue as fallback. Production checkout calls still use Render (and create a short-lived legacy shadow session), until Square webhook/payment services have been ported and reconciled. Never stop Render before that phase is independently verified.

To test on a separate Preview branch, use a 32-byte random hex KO_SESSION_KEY in Preview secrets only; do not commit secrets. Test invalid credentials against the live Neon API, and test full login/records using dedicated sandbox tenants before activating in Production. Do not enable in Production until payment operations and old-session preservation are verified.

### D1 session store
Cloudflare D1 'kennelone-session-vault' (binding SESSIONS) can replace KO_SESSION_KEY entirely. The browser receives a random host-only HttpOnly cookie; the database stores its hash, the upstream Neon token, and an expiration timestamp (8 hours). Login purges expired records, logout removes the session and calls Neon logout. Never expose the D1 database contents in logs or static assets. The database schema is in `cloudflare/portal/schema.sql`. Enable the binding in *preview* first, test live-login and authenticated data, then separately enable in production. Existing Render sessions fall back until expiry. Keep Square's Render backend until independently migrated.
