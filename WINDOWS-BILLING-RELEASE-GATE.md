# Kennel One Windows Billing Release Gate — 2026-10-26
Status: LIVE SQUARE CATALOG CONFIGURED; Windows integration still DEVELOPMENT ONLY — not deployed or submitted to Microsoft.

Verified: 135 automated tests pass, including Apple/Google owner-only purchase-linking, revoked/expired proof rejection, and fail-closed Square checks.
Existing Square payment server /health reports production environment, webhook and cloud configured.
Recurring Square payment links require a subscription PLAN VARIATION ID, not a plan ID.
Registration, shared trials, cross-platform verification, Windows checkout and settlement are staged.
Paywall enforcement remains OFF to protect existing users.

RELEASE BLOCKERS:
1. RESOLVED: Square Developer Dashboard authenticated and live merchant plans verified on the Mac.
2. Square production monthly and annual plan variations created and verified on October 26, 2026; variation IDs saved locally in Documents/KennelOne-Windows-Release/square-subscription-catalog-20261026.json. Backend staging runtime still does not have the production token and configured plan IDs.
3. COMPLETED: live Square catalog verified monthly $10.99 and annual $99.99 static USD prices; tested generation and deletion of one recurring Square checkout link per plan. No charge was made.
4. BLOCKED: no real completed payment-to-entitlement test has run. Live checkout link creation does not prove paid-user access.
5. iOS and Android apps still require native cross-platform purchase linking. The Android source (KennelOne-Android-Build17, version 3.0.0) has no Google Play Billing dependency or purchase-token bridge; a native edit was blocked and is not represented as complete. iOS StoreKit currently verifies purchases locally and also needs a signed-proof account bridge.
6. Database migrations are not deployed and the Microsoft Store update is not submitted.
7. Microsoft Store policy 7.20 (effective October 22, 2026), section 10.8, permits secure third-party subscription billing for non-game PC apps. Mark use of a third-party purchase API in Partner Center and disclose $10.99 monthly, $99.99 yearly, $299.99 lifetime, auto-renewal, and the 14-day free trial clearly before checkout. Source: https://learn.microsoft.com/windows/apps/publish/store-policies

READ-ONLY ACCOUNT AUDIT (after secure live Square authorization):
node scripts/verify-square-production-plans.mjs
This makes GET requests to Square and NEVER creates a payment or subscription.

TEST COMMANDS:
node --test scripts/verify-square-production-plans.test.mjs
node --test BusinessBackend/tests/*.test.mjs cloudflare/portal/tests/*.test.mjs

Only release after live verified checkout unlocks a subscribed account without duplicate billing.
Never commit secrets or enable the paywall before subscriber migration and validation.
Production checkout smoke test on October 26: Square created both links successfully, then confirmed their deletion and cancellation of the associated orders. No customer purchases were submitted. Do not interpret this as a completed payment verification.

2026-10-26 Square SANDBOX hosted-checkout verification:
- Square's Sandbox Testing Panel accepted a simulated $10.99 hosted payment; the API confirmed the payment COMPLETED and the test order OPEN with a tender. No real money moved.
- The sandbox payment had no customer_id and SearchSubscriptions returned no matching recurring subscription. This is insufficient evidence to grant Kennel One subscription access. The application correctly fails closed.
- Trying to pay the payment-link DRAFT order directly via Payments API returned HTTP 400, because the order must be OPEN. The hosted sandbox panel is the supported simulator.
- 130 automated tests now pass, including explicit protections for a missing payment customer and missing recurring subscription.
- REMAINING RELEASE BLOCKER: A fully linked payment, recurring subscription and account unlock has not been demonstrated in production. The mobile clients' shared purchase sync also must be validated before turning on the server paywall.
- No customer charges, no production migration, no Microsoft update submission.

2026-10-26 FOLLOW-UP VERIFICATION (read-only or sandbox; no live customer charges):
- Microsoft Partner Center: existing Windows package remains **In certification**; this billing branch has not been deployed or resubmitted.
- Windows 11 machine reports SVK9.KennelOne version 1.0.1 installed, status Ok. The signed package archive has a readable .msixbundle.
- Actual Square sandbox hosted $10.99 checkout reports COMPLETED payment and OPEN order with a tender but has NO payment customer ID and NO matching recurring subscription. The live Square API response, evaluated through `verifyPendingWindowsCheckout`, correctly denied entitlement (409).
- A separate API-created sandbox recurring subscription reported ACTIVE but had NO paid_until_date. `verifyActiveSquareSubscription` correctly denied entitlement. Sandbox recurring billing behavior is not production proof.
- New `BusinessBackend/tests/windows-billing-e2e.test.mjs` exercises the payment/order/active-subscription/owner+staff entitlement path with mocked Square HTTP responses and a real in-memory PostgreSQL engine, verifies idempotent settlement, and rejects missing/mismatched or ambiguous evidence. This test is NOT a live completed Square purchase.
- Microsoft Store submission can proceed through its independent certification process; do not switch on paid access restrictions or claim automatic subscription activation is production-verified.
- Remaining release blocker: a **separately authorized real production purchase** must be checked end-to-end from secure Square payment through subscription paid_until_date, stored kennel ownership, account unlock and renewal/cancellation handling. Do not initiate a real charge without purchaser approval. Production DB migrations and cross-platform proof linking remain gated.

2026-10-26 WINDOWS TRIAL-TO-CHECKOUT UX RELEASE FIX:
- During an active 14-day trial, the kennel owner can now choose monthly, annual or lifetime checkout instead of waiting for the trial to expire. Employees never see purchase actions, and already-paid owners cannot be charged twice through this UI.
- Billing text now distinguishes a card-free trial (no automatic charge) from an immediately charged Square purchase, and clearly describes renewal/cancellation of recurring plans.
- New browser-logic regression checks in cloudflare/portal/tests/billing-trial-ui.test.mjs cover trial owner, unpaid owner, paid owner and employee permissions.
- Full isolated suite: 136/136 passing on October 26, 2026. Changes committed to staging branch only; no Microsoft submission replaced, no production deploy, no customer charges.
- Square merchant self-payment is not a valid $10.99 production purchase test (see Square Payment Terms); require an unrelated willing customer completing an actual purchase, with their payment details entered privately into Square checkout, before considering production payment-to-access verified.

2026-10-26 VERIFIED WINDOWS SQUARE RENEWAL STAGING (NOT DEPLOYED):
- Added additive DB migration 015_windows_renewal.sql. It binds a completed Square checkout to one verified Square purchase ID, refuses reassignment and authorizes only the original kennel owner to refresh it. Do not apply 015 without prerequisite migrations 012 through 014.
- Added backend POST /v2/billing/refresh: retrieves the previously verified Square subscription for the logged-in owner, checks the original Square order/payment/customer and current Square subscription/plan/paid_until_date, and extends only the exact bound entitlement after live verification. No browser-supplied subscription ID or paid status is trusted.
- Added Windows portal + authenticated same-origin gateway route to refresh an existing Square subscription. Existing paid owners aren't offered another checkout and employees cannot trigger refresh.
- Rejects missing/ambiguous subscriptions, canceled/expired periods, refunded original payments, mismatched owner/purchase IDs, and outdated renewals; duplicate refresh doesn't create another entitlement. Renewal checks are on-demand when an owner uses the refresh action. Continuous automatic renewal processing and webhook-driven cancellation/refund reconciliation are NOT yet implemented.
- Full local suite: 146/146 passed. All tests are isolated/mocked or local DB; this is not a successful live production purchase-to-access test.
- Keep billing enforcement OFF and do not deploy Windows billing migrations or updated portal until a real unrelated buyer purchase, confirmed paid-through subscription, receipt linkage, renewals/cancellations/refunds and existing subscriber migration have passed production validation.

2026-10-26 SQUARE WEBHOOK RECONCILIATION STAGING (UNDEPLOYED):
- Added migration 016_square_webhooks.sql after 015. Signed Square subscription.created/subscription.updated events cause a fresh Square API lookup before an existing, already-linked Windows purchase can change state. Event IDs are deduplicated in the billing event table. Previously refunded entitlements cannot be reactivated by delayed subscription events.
- Signed refund.created/refund.updated events fetch the current refund AND payment from Square. Only COMPLETED refunds with matching payment/order/location can revoke a previously settled Windows purchase. The update is idempotent. A browser request cannot supply an arbitrary paid state or subscription ID to this flow.
- Public Windows portal webhook route forwards original raw JSON bytes and Square HMAC signature to the backend. Only backend key verification is authoritative. The configured Square public notification URL (not internal Neon URL) is used as the HMAC signature basis.
- Added sandbox/mock request-security, SQL state-transition, original purchase refund, and gateway tests. Full local suite 154/154 passing. These verify local behavior; NO production deployment, real buyer charge, Square webhook subscription registration, or end-to-end live delivery has occurred.
- Production prerequisites remain: install ordered SQL migrations and restrictive DB roles; configure backend Square location, production token, two variation IDs, webhook signature secret, and exact public notification URL; deploy backend + Windows portal; register webhook event types with Square; test independent buyer checkout/paid-through access, renewal, cancellation, and refund; backfill existing mobile purchases; enable billing enforcement only after all validation. Do not replace Microsoft Store certification submission during these tasks.

2026-10-26 APPLE DIRECT APP STORE CONNECT SETUP (PARTIAL, NO SERVER DEPLOY):
- App Store Connect verified an Account Holder/Admin session for Kennel One. A dedicated In-App Purchase server key named "KennelOne Billing Server" was generated and its private .p8 downloaded once to the Mac, moved to a restricted local directory (mode 0600), and successfully parsed with OpenSSL. Do not upload this private key to Git or share it in chat. Keep a secure backup.
- The Apple In-App Purchase integrations screen now shows one active key. This is an In-App Purchase server key, distinct from the separate App Store Connect API team key.
- Apple's actual Kennel One app is Apple app ID 6809212861, bundle ID com.kennelflow.app (immutable internal identifier, despite public Kennel One branding). The Apple monthly/yearly subscription products and the lifetime non-consumable are Approved, with IDs matching BusinessBackend/billing.mjs. Monthly has a configured two-week introductory free offer.
- Apple's production AND sandbox App Store Server Notification URLs are currently blank. Do not set an unimplemented endpoint. Create a signed-payload-verifying App Store Server Notifications V2 handler, deploy and test it first, then register the HTTPS URLs in App Information and request a test notification.
- Apple's public Root CA G2 and G3 certificates were downloaded to the Mac and validated as DER certificates. The private key and roots are NOT yet deployed to Neon and a live authenticated App Store Server API call was NOT verified.
- Maintain disabled billing enforcement until the real receipt-to-account link, renewals, refunds and existing customer migration are verified. No new customer charges and no Apple backend production deployment were performed by this setup.

2026-10-26 APPLE SERVER NOTIFICATIONS V2 STAGING (NOT LIVE):
- Added BusinessBackend/billing-apple-webhook.mjs: verify Apple's signed top-level notification JWS and nested transaction JWS with Apple's trusted roots, verify bundle/environment/app ID, then fetch authoritative current Apple transaction/subscription status. Supported states include active, verified grace, expired, revoked and refunded, plus lifetime non-consumables.
- Added unauthenticated Apple-delivery HTTP routes /v2/billing/webhook/apple and /v2/billing/webhook/apple/sandbox. Both require Apple's cryptographically verified signed payload; a caller-reported paid flag cannot grant an entitlement. TEST notifications receive a harmless response.
- Added migration 017_apple_notifications.sql: update ONLY already-linked Apple purchase IDs; never create entitlements from an unsolicited event; deduplicate event UUIDs; ignore stale updates; keep refund/revocation terminal to avoid delayed-event reactivation. SQL tested against isolated Neon rehearsal database, including renewals, duplicates, refunds, expired and reactivation attempts; synthetic rows were rolled back.
- Node checks: 21 targeted Apple, Google and Square verifier tests passed, including 9 new Apple notification tests. This is synthetic/mock coverage, not a signed live Apple notification.
- Changes pushed only to staging branch kennelone-unified-billing-20261025, at commits e28756d5c80d453ae1519cd284dfc8036609af13 and eb1394cd07d830aa1ccc18ce590f4181d21eb199. The later commit protects terminal refund/revocation state.
- Production Neon function has NOT been redeployed. Server key and Apple root certificates remain in restricted local Mac storage; Apple provider environment settings are not installed on the live function, and Apple's production/sandbox notification URLs remain unconfigured.
- Release gates: provision verified Apple secrets securely, build and deploy the versioned Neon backend with existing legacy API preserved, stage-test Apple-generated signed notifications with App Store Server API and sandbox URL, link existing owner receipts and reconcile paying users, then run controlled production verification. Keep enforcement OFF until complete.
