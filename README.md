# Kennel One — website & store staging (October 2026)

This branch prepares the Kennel One rebrand of the existing KennelFlow marketing website, online NFC hardware shop, and customer management portal. The existing Apple app/bundle ID, customer data, Square integrations, and physical hardware remain compatible.

- Marketing website: the approved Kennel One K1 mountain/forest artwork, current App Store download link, updated public copy and support email.
- Hardware shop: all nine existing product SKUs with unchanged cents/quantities, renamed storefront labels, original hardware compatibility notice, and Square-hosted checkout.
- Customer portal: renamed UI and downloaded CSV prefix, with existing authentication, database and NFC URI links preserved.
- App Store listing: ID 6809212861. A public app update is pending Apple's review; do not claim the new branded app version is live before Apple approval.
- No production deployment, DNS cutover, checkout origin/redirect changes, or Square account changes are authorized by this staging branch alone. The existing production domains remain functional during migration.
- Staged owner-requested software price targets ($10.99/month, $99.00/year, $299.99 lifetime) must be checked in App Store Connect before publishing. Hardware catalog pricing is unchanged.
- Privacy policy, hardware shipping/returns and refund policy require final owner/legal approval before publishing this staging website.
- Test the marketing/shop changes with node --test tests/kennel-one-rebrand.test.mjs; portal with cd KennelFlowWeb && npm test; backend with cd BusinessBackend && npm ci && npm test.
- New domain kennelone.app, new subdomains/SSL and Square/Apple Pay validation are pending proof of registrar ownership. Keep existing kennelflowpro.app / app.kennelflowpro.app as aliases and all legacy QR deep links operational.

---

## Legacy development history

# KennelFlow Website — Build 1

This is a responsive static website prototype for KennelFlow.

## Included pages
- Home
- Features
- Smart Kennels
- Shop
- Pricing
- Support
- Privacy Policy
- Terms
- Download
- Checkout prototype

## Store status
The cart, quantity management, local browser storage, checkout order summary, and shipping form are functional front-end features. Live Square web payment processing is intentionally not enabled in Build 1. Connect Square after product prices, shipping rules, taxes, inventory, and return policies are finalized.

## Run locally
Open `index.html` in a browser, or serve the folder with any basic static server.

## Deployment
This project can be hosted on GitHub Pages, Render Static Sites, Vercel, Netlify, or another static web host.

## Brand
The user-provided KennelFlow logo is in `assets/kennelflow-logo.jpeg` and is treated as the brand source of truth for this build.


Build 4 update:
- Homepage audience messaging now includes Boarding Facilities, Pet Grooming Salons & Pet Groomers, Government Agencies, and Veterinary & Shelter Teams, with Law Enforcement removed.


Build 5 update:
- Smart Kennels page now shows a scannable KennelFlow download QR code with centered logo, replacing the old NFC holder placeholder.


Build 6 update:
- App Store QR is now a non-active placeholder until the KennelFlow App Store listing is live.


Build 7 update:
- Home page returned to the cleaner six-card layout with a larger KennelFlow logo; expanded audience-specific cards remain on Features.

Build 8 update:
- Store pages upgraded with secure Square-hosted checkout support and a companion server update package. Existing Build 7 Home design is preserved.
