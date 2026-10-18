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
