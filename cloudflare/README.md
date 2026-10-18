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


## Kennel One direct store checkout and payment webhook staging
The public checkout's direct Square integration is feature-gated behind `SQUARE_DIRECT_CHECKOUT=true`. Use Cloudflare secrets `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` and `SQUARE_ENVIRONMENT` (sandbox/production), with optional `STORE_FLAT_SHIPPING_CENTS` and `STORE_SUCCESS_URL`. Do not change production configuration until Sandbox test payments and downstream notifications/ledger settlement pass. With the feature gate off, the live storefront retains its existing Render bridge.

The separate `cloudflare/payments` project contains an HMAC-verifying Square webhook staging implementation, D1 event schema, and mock tests. Deploy to a **preview** only; it is deliberately not an active webhook receiver for completed payments because downstream settlement/notification is not ported. Webhook preview requires `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_URL` (exact subscription URL), `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT`, and a D1 `EVENTS` binding. A 503 on an unsettled webhook is **intentional**; activating this endpoint for production would not be acceptable.

Local checks: `cd cloudflare/public && npm test`, `cd cloudflare/payments && npm test`, `cd cloudflare/portal && npm test`. Production payment checkout routes and legacy app webhooks remain on Render.

### Atomic payment settlement and order notifications (staging)
`cloudflare/payments/db/settle-service-payment-v1.sql` is a **not-applied** PostgreSQL function for the existing Kennel One Square checkouts ledger. It locks the pending checkout, validates amounts and payment identities, creates deterministic payment records and marks the checkout completed within one PostgreSQL transaction. Test only against a disposable branch. It requires the Cloudflare payment Function's encrypted `DATABASE_URL` secret and a matching backend schema.

Merchant order-email notifications are available via Resend only when `ENABLE_STORE_NOTIFICATIONS=true` and encrypted `RESEND_API_KEY`, `ORDER_NOTIFICATION_EMAIL` and `RESEND_FROM_EMAIL` are set. No notification or customer email is sent unless Square's completion is independently confirmed. Production remains disabled; SMS and other stores still require migration.

**No production cutover is authorized by the existence of the code.** The live Square webhook is still on Render. Do not set production payment environment secrets or enable webhook routes before testing with isolated Square Sandbox plus matching Neon database.


## Portal direct API parity and safe live static fix
The direct Cloudflare portal API now includes signup, password updates, business-profile edits, and authorized private messages in addition to records, employees, invitations and D1 sessions. These were verified with regression tests and a Preview deploy. Only Preview is bound to the new `SESSIONS` D1 database; production continues through the existing legacy API bridge pending real-account end-to-end tests and Square cutover.

The live NFC scanner branding was corrected to Kennel One separately from the backend change; existing protocol identifiers are compatibility-critical and must not be renamed without an NFC/data migration plan.

### Shared Square payment checkout preview
The separate `cloudflare/payments` Pages project now contains the QuailFlow and RabbitFlow `/store/create-checkout` handlers and Yard Patrol `/yardpatrol/create-checkout`, `/yardpatrol/checkout-status`, and `/yardpatrol/cancel-checkout` equivalents. These are deliberately not wired into production. In Preview, secrets are absent, so purchase requests fail closed. Catalog prices are from trusted server-side mappings, not client cart values. The real Yard Patrol customer portal and its PostgreSQL data are still hosted on Render and require a separate migration and live-data reconciliation.
