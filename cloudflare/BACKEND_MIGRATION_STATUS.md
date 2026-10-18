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

## Latest tested settlement and notifications stage — October 18, 2026
- Cloudflare payments staging now has an explicit, disabled-by-default Neon service-ledger gate, a tested PostgreSQL function `cloudflare/payments/db/settle-service-payment-v1.sql`, and a server-only Neon HTTP adapter. **Do not apply SQL to any production database before matching its current schema and testing in an isolated Neon branch.**
- Local PostgreSQL WASM integration tests ran the actual function with disposable test records. Verified: one inserted ledger row, exact replay idempotency, payment-ID conflict, amount mismatch, canceled checkout, missing checkout, duplicate-record integrity and sandbox/production separation.
- Webhook integration tests now exercise signed synthetic Square events through payment verification to real local PostgreSQL settlement, then D1 event state. All test credentials are synthetic.
- Optional merchant email notifications use Resend server-side and a per-payment idempotency key. The dispatch function is enabled only by `ENABLE_STORE_NOTIFICATIONS=true`; this is **off in production**. Requests with an uncertain notification age greater than 23 hours fail closed for manual reconciliation rather than risking emails after Resend's 24-hour idempotency window.
- A separate health endpoint reports configuration booleans, never secret values: https://payments-migration-preview.kennelone-payments.pages.dev/health. It verified preview event storage connected and all payment credentials/feature gates disabled.
- Connected Neon workspace could not be positively verified as the one used by the production backend, so **no remote Neon SQL or branch changes were made**.
- Tests: Portal 16, storefront 13, payments 35 (including real local PostgreSQL). Run all three suites and check live sites/Render before any production change.

**Remaining release gates:** secure sandbox Square credentials in Cloudflare Preview, verified Neon test-branch schema and function, real Sandbox Square hosted checkout + signed webhook and ledger exactly-once test, email/SMS delivery including other stores, app login and records using disposable tenant, managed production payment secret transfer and webhook URL cutover with rollback. Other apps' routes (QuailFlow, RabbitFlow, Yard Patrol) still require parity before any Render deletion.


## Production payment availability observation
- During post-migration read-only checks on October 18, 2026, the production Render Square `/health` endpoint timed out after 20 seconds on one request; the immediate retry completed in under one second with `ok:true`, `environment:production`, and `webhookConfigured:true`. Render event history did not show a server failure. This is consistent with, but does not prove, a free-instance cold start.
- Until direct Square checkout is live and verified, first-visit purchases may experience the remaining Render wait. **Do not stop Render or remove the existing Square webhook URL.**
- The staging payment preview `/health` confirmed D1 event storage connected, all payment credentials absent, and settlement disabled. Zero real or synthetic payment-event rows were stored remotely.
- Latest tests on October 18: portal 16, public-store checkout 13, payments 35 = 64 passed. Changes saved in the `kennelone-cloudflare-migration` GitHub branch. Production was not switched.


## Continuation audit: direct portal parity, preview bindings, public copy
- Expanded Cloudflare direct portal routes: `/api/signup`, `/api/password`, `/api/business-profile` and per-kennel `/private-messages` GET/POST. Owner and member authorization is checked before forwarding, with Neon retaining final authority.
- Added `cloudflare/portal/tests/parity.test.mjs` covering schema validation, secure Neon forwarding, password changes, owner-only account edits, private-message tenant boundaries and invalid request rejection.
- Confirmed in the Cloudflare dashboard that the Pages **Preview** environment has `SESSIONS` D1 binding and **Production** has no new D1 binding. Validated direct Preview runtime, not only local tests.
- Deployed updated portal backend **Preview only**; intentionally left live customer authentication bridged to Render. The temporary binding diagnostic was removed and the Preview redeployed cleanly.
- Fixed the public NFC scanner text to display 'Kennel One' instead of the former app name. Preserved compatibility-critical NFC URI prefixes and deterministic record IDs so existing programmed tags and customer data still work.
- Redeployed the static customer-portal assets to production with the proven legacy API bundle; verified the live scanner reads 'Kennel One', and unauthenticated `/api/me` still rejects with 401.
- Updated public-site README to reflect Cloudflare live hosting instead of prelaunch/old domains. All user-visible marketing pages continue to use Kennel One branding.
- Retested direct backend `/v2/capabilities` and production/public host responses. No production transaction or customer database writes were made.
- Tests now passing: portal 22, storefront 13, payment settlement/webhook 35 (70 overall).

### Why full Render retirement remains blocked
- Only the wrong/unverified Neon project is visible from the connected Neon app. Production payment ledger credentials and correct database identity have **not** been verified; do not run SQL against the wrong Neon project.
- Existing connected management tools do not expose a safe, approved transfer for Square production and Sandbox secrets to Cloudflare Preview. Do not embed or print tokens into code, logs or chat.
- Other applications still share Render's Square backend. QuailFlow, RabbitFlow and Yard Patrol checkout/status/webhook endpoints require full migration and testing before turning that service off.
- Production signed Square webhooks and email/SMS receipts must pass end-to-end Sandbox tests with the correct provider configuration before replacing production endpoint URLs.
- Therefore **do not close the Render account or shut down its portal, Square production or sandbox services** yet. Frontends on Cloudflare already work; replacing an active backend without the missing credentials would interrupt logins or real payments.


## Verified production Neon database connection (2026-10-18, read-only)
**STATUS: VERIFIED. The earlier connection-identity blocker is resolved.** No production database writes were performed.

- Live Render `kennelflow-web` deployed branch `kennelflow-web-readonly` hard-codes the Neon API endpoint for branch `br-long-night-b5uhw0hi`. The Cloudflare portal direct API uses the same endpoint.
- The connected Neon account's primary/default branch has **exactly** `br-long-night-b5uhw0hi`, and database `neondb`. `/v2/capabilities` responded HTTP 200 with 46 collections and payments support.
- The Render production Square server's `KENNELFLOW_SQUARE_DATABASE_URL` specifies endpoint `ep-sparkling-breeze-b5k3sscf-pooler.c-7.us-east-2.aws.neon.tech/neondb`. The connected Neon project reports endpoint `ep-sparkling-breeze-b5k3sscf` attached to the exact same production branch. Database credentials were never printed or saved, and the dashboard was remasked after inspection.
- The Square server also has a **separate** `DATABASE_URL` for Yard Patrol; it is unrelated to the Kennel One Neon payment ledger and must not be used for its migration.
- Read-only Neon SQL confirms 12 public tables, including `app_users`, `kennels`, `kennel_memberships`, `kennel_records`, and `kennelflow_square_checkouts`.
- Baseline record counts: 1 business, 1 account, 1 membership, 287 kennel records (283 active and 4 soft-deleted), 1 active `payments` type ledger record, and 0 `kennelflow_square_checkouts` rows. The latter is not a count of all Square charges; it is a specific business-checkout tracking table.
- Confirmed production column names and data types for both `kennel_records` and `kennelflow_square_checkouts` match the expected source schema. No private customer data was extracted, and no SQL DDL was applied.

The database-connection verification gate is complete. **Do not infer that end-to-end payment migration is complete.** Real Cloudflare login, record synchronization, Square Sandbox webhook settlement, notification delivery, shared-app parity, and rollback validation are still necessary before turning Render off.

## Cross-app payment checkout staging — October 18 continuation
- The Cloudflare payment preview now contains server-priced Square-hosted link handlers for QuailFlow and RabbitFlow. QuailFlow preserves its disabled-by-default sales gate; product SKUs, names, cents, shipping configuration, and redirect URLs match the existing Render checkout service.
- Added Yard Patrol Square checkout creation, invoice-verified payment status and Square checkout cancellation in Cloudflare staging, using independent amount/order/location verification and origin validation.
- Added existing Kennel One single NFC item-name alias to merchant-order notification recognition so previously created Square orders remain identifiable after any future migration.
- Added unit/integration regression tests for all three app checkout routes. Latest totals: payment staging 50 tests; portal 22; public storefront 13 = **85 automated tests**.
- Cloudflare preview deployed at https://payments-migration-preview.kennelone-payments.pages.dev. New checkout endpoints reject real requests without runtime Square credentials. Cloudflare staging D1 remains isolated; production Render Square is untouched.
- **Do not cancel Render yet:** Yard Patrol also has a separate PostgreSQL-backed customer/business portal with sync, access codes, leads and customer requests (from SquarePaymentServer/yardpatrol-portal.js). This database and its routes are NOT yet migrated. QuailFlow/RabbitFlow merchant email and SMS notifications also need reliable event processing. These are additional, independently verifiable release gates, not covered merely by the checkout unit tests.
- No credential transfer, production Square webhook rerouting or production Neon DDL was performed.

## Yard Patrol portal migration staging — October 18 follow-up
- The separate Render Yard Patrol portal database still reports expiration on October 27, 2026; its original records remain readable.
- Existing dedicated Neon destination `yardpatrol_portal` contains the exact-matched initial copy (2 business, 1 customer portal, 0 leads). Source must be rechecked for changes before cutover.
- Implemented Pages Functions for `/yardpatrol/portal/*`, `/yardpatrol/inbox/*`, and `/yardpatrol/leads`, covering portal sync/login/rotate/delete, requests, inbox and lead management with parameterized Neon SQL and existing access-code hashing.
- Replaced the legacy hardcoded recovery token path with a separately configured one-time server-side `YARDPATROL_OWNER_RECOVERY_KEY` secret, intentionally unconfigured in Preview.
- Added Cloudflare D1-backed public lead-rate-limiting table `yardpatrol_lead_limits`, verified present in isolated payment-event D1 database. The initial schema-file attempt had a transient authentication error; a direct D1 command subsequently succeeded.
- Added PostgreSQL PGlite integration tests using only fabricated records and codes; `cloudflare/payments` has 59 passing tests. Total tests across three projects: 22 portal + 13 storefront + 59 payment/portal = 94.
- Deployed only to https://payments-migration-preview.kennelone-payments.pages.dev. `/yardpatrol/portal/health` returns HTTP 503 intentionally because its `YARDPATROL_DATABASE_URL` secret has not been installed, so no customer writes can occur. Production Render remains active.

### Still required before safe Render retirement
1. Securely bind `YARDPATROL_DATABASE_URL` to the Neon `yardpatrol_portal` connection for Cloudflare Preview or the temporary Render backend, with allowed secret management. Do not reveal credentials in chat, shell history, Git or logs.
2. Test the Cloudflare preview against an isolated database/tenant, then compare live copies and finalize the switch before October 27.
3. Set `YARDPATROL_OWNER_RECOVERY_KEY` via audited credential provisioning and test one-time recovery.
4. Run full Square-hosted Sandbox checkout, verified webhook receipt, atomic ledger, and merchant notification tests. Securely provision Square, Neon and email provider secrets in Preview. Complete QuailFlow and RabbitFlow notification, and Yard Patrol service payment parity. Only then activate production webhooks.
5. Verify live login, file sync and cloud records for Kennel One; keep rollback until complete.

This code is staged and has **not** made a production payment or customer record change.
