# Kennel One migration to Cloudflare Pages

## Safety
Do not switch customer-facing DNS before Cloudflare Pages previews load correctly and an owner-verified end-to-end test of login, record saves, Square payment callbacks, customer records, and legacy redirects. Existing production services must remain live for rollback.

## Public marketing website (static, no backend)
Source: `deploy/kennelone-public` in this repo.
Create a Cloudflare Pages project `kennelone-public` via Git integration or Wrangler direct upload, then use:
`npx wrangler pages deploy deploy/kennelone-public --project-name kennelone-public --branch=main`
Verify all pages: /, /shop.html, /support.html, /privacy.html, /terms.html, /checkout.html.
When verified, add `kennelone.app` and `www.kennelone.app` custom domains in Pages. Apex requires Cloudflare zone activation, with Namecheap NS changes and preservation of all current DNS and email records.

## Business portal (static frontend + compatibility API)
Source: `cloudflare/portal/public` and Pages Functions in `cloudflare/portal/functions`.
`cd cloudflare/portal && npx wrangler pages deploy public --project-name kennelone-portal --branch=main`
The Pages Function bridges same-origin /api requests to the current Render backend, preserving cookies. It is a temporary bridge, not the final backend migration. Users see the login page without Render's sleeping splash, but a first API request may still take longer while Render wakes. Do not shut down the Render business service until its auth sessions, entire API surface, and payment endpoints have moved and been tested.

## Payments
Square and its production webhook remain on Render until independently migrated and verified against a sandbox. Preserve the existing Square callback URLs and secret keys; do not change customer checkout routes prematurely.

## Local checks
`cd cloudflare/portal && npm test`
`npx wrangler pages dev public` (local preview; verify /api same-origin behavior).
Do not commit environment secrets or access tokens.
