# Kennel One Windows Billing Release Gate — 2026-10-26
Status: LIVE SQUARE CATALOG CONFIGURED; Windows integration still DEVELOPMENT ONLY — not deployed or submitted to Microsoft.

Verified: 124 Business API and portal automated tests pass, plus 4 plan-audit tests.
Existing Square payment server /health reports production environment, webhook and cloud configured.
Recurring Square payment links require a subscription PLAN VARIATION ID, not a plan ID.
Registration, shared trials, cross-platform verification, Windows checkout and settlement are staged.
Paywall enforcement remains OFF to protect existing users.

RELEASE BLOCKERS:
1. Square Developer Dashboard on the Mac remains signed out.
2. Square production monthly and annual plan variations created and verified on October 26, 2026; variation IDs saved locally in Documents/KennelOne-Windows-Release/square-subscription-catalog-20261026.json. Backend staging runtime still does not have the production token and configured plan IDs.
3. COMPLETED: live Square catalog verified monthly $10.99 and annual $99.99 static USD prices; tested generation and deletion of one recurring Square checkout link per plan. No charge was made.
4. BLOCKED: no real completed payment-to-entitlement test has run. Live checkout link creation does not prove paid-user access.
5. iOS and Android apps still require cross-platform purchase linking validation.
6. Database migrations are not deployed and the Microsoft Store update is not submitted.

READ-ONLY ACCOUNT AUDIT (after secure live Square authorization):
node scripts/verify-square-production-plans.mjs
This makes GET requests to Square and NEVER creates a payment or subscription.

TEST COMMANDS:
node --test scripts/verify-square-production-plans.test.mjs
node --test BusinessBackend/tests/*.test.mjs cloudflare/portal/tests/*.test.mjs

Only release after live verified checkout unlocks a subscribed account without duplicate billing.
Never commit secrets or enable the paywall before subscriber migration and validation.
Production checkout smoke test on October 26: Square created both links successfully, then confirmed their deletion and cancellation of the associated orders. No customer purchases were submitted. Do not interpret this as a completed payment verification.
