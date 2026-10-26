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
