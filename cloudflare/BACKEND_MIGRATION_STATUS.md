# Kennel One – Render retirement checklist

Updated October 18, 2026

## Active today
- Cloudflare Pages hosts kennelone.app, www.kennelone.app and app.kennelone.app; each has valid HTTPS.
- The existing live portal still uses its Render API bridge for authentication and data access.
- Public store checkout is on Cloudflare Pages, but its Function forwards purchase links to the Render Square service.
- Square production /health is online. QuailFlow, RabbitFlow, Yard Patrol and Kennel One routes are shared in the payment server.
- All three remaining Render web services are on the Render Hobby free tier; the account's projected bill was $0.00 after old custom-domain detachment.

## Prepared, not production-enabled
- Cloudflare Pages Functions direct Neon API with D1-backed hashed session identifiers, permission validation and file integrity checks.
- D1 database kennelone-session-vault, schema.sql applied; SESSIONS binding only in Cloudflare Pages preview configuration.
- Preview: https://backend-migration-preview.kennelone-portal.pages.dev
- New and legacy authentication paths have automated unit tests, including D1 session persistence and revocation. No actual customer account credentials have been tested on direct API.
- No production login-route cutover has been made.

## Required gates before Render shutdown
1. Test direct login against a dedicated non-production tenant with real auth, invitation acceptance, staff roles, read/write, delete, uploads, downloads, logout, concurrent sessions, and reauthentication. Back up and reconcile customer data.
2. Remove old Render-shadow login dependency for Square transactions. Migrate signed Square checkout and verification into a Cloudflare Worker/Pages Function with encrypted secrets and a production-compatible datastore. Preserve exactly-once settlement semantics and test idempotent webhook retries against Square Sandbox.
3. Account for Square endpoints used by QuailFlow, RabbitFlow, Yard Patrol and Kennel One; either migrate every route or keep their remaining services on Render. Do not silently break third-party app checkouts.
4. Confirm Square production webhook signature verification and event routing, test one true sandbox payment end-to-end, verify receipt and ledger settlement exactly once, and only then cut over payments. Never charge production cards to test.
5. Set a production D1 binding (currently preview only) after tests; roll out direct API with existing Render session fallback. Monitor for errors and keep rollback.
6. Before deleting Render, verify no customer, historical, mobile, webhook, email or backend code still calls onrender.com, and ensure DNS/email mappings remain intact.

## Safety
Do not shut off or delete Render yet. Until these gates pass, the working live customer portal/payment system would be damaged by closing those services. Do not commit tokens or credentials.


## October 18 continuation: Cloudflare Square migration stages
- Direct Kennel One catalog checkout (including server-side official product pricing) has been built in `cloudflare/public/functions/_lib/square-checkout.mjs`; the storefront Function uses it **only** when `SQUARE_DIRECT_CHECKOUT=true` and the corresponding Square runtime credentials are available. Production still uses its existing verified Render checkout bridge.
- Direct checkout preview: https://direct-square-preview.kennelone-public.pages.dev
- A completely separate Cloudflare Pages project `kennelone-payments` and D1 database `kennelone-payment-events` are created. Only Preview has an EVENTS D1 binding.
- Square payment webhook staging preview: https://payments-migration-preview.kennelone-payments.pages.dev
- Webhook staging verifies Square HMAC using the raw body and the subscribed notification URL, verifies completed Square payment/order via Square REST before queuing, and stores a single entry per payment ID in D1. **It deliberately returns 503 for unsettled completed payments** rather than acknowledging a payment without writing the downstream ledger and notifications. This is **not ready for a Square subscription URL cutover**.
- The webhook has no live Square credentials. Only synthetic test keys and mocked REST responses were used in tests. Never point production Square webhook subscriptions to this preview.
- Most recent automated test counts: portal API 16, storefront 13, webhook 8 (37 total passing).
- The preview endpoints respond with the expected safe auth, missing-secret and method rejection statuses. No real charges or production record writes occurred.
- Because Render's connected app does not expose production secret retrieval and a direct secure handoff is not completed, no production keys have been copied into Cloudflare. Configure Cloudflare encrypted secrets through an approved secure access workflow before any payment cutover.
- Other live payment integrations (QuailFlow, RabbitFlow, Yard Patrol) share the existing Square service and must be migrated or explicitly kept online before Render is retired.

### Next gated steps
1. Securely connect non-production Square credentials to Cloudflare **Preview** secrets, validate a real Square sandbox payment link and test webhook notification.
2. Implement/verify atomic ledger settlement in Neon and idempotent webhook notifications for all stores and apps; validate full payment workflow including receipt delivery.
3. Run genuine test-account (not owner/customer production) login, cloud read/write/upload and staff access against the D1-powered portal preview.
4. After an audited side-by-side comparison and controlled DNS/webhook transition, switch production with rollback and recheck all apps; only then remove Render services and close the account.
