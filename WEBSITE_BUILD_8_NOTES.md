KennelFlow Website Build 8

Store improvements:
- Redesigned the Shop page for KennelFlow NFC hardware.
- Preserved current Build 7 product prices.
- Added stock/value badges and clearer facility bundle descriptions.
- Improved cart quantity/remove controls.
- Added a real secure-checkout workflow that redirects buyers to Square-hosted checkout.
- Added order-success.html.
- Added checkout status/error handling.
- Added server-side product/price validation to prevent browser price tampering.
- Added optional flat-shipping configuration on the Render server.
- Requests Square automatic tax application for eligible configured taxes.
- Added CORS support for the KennelFlow GitHub Pages website.
- Existing KennelFlow app payment endpoint remains preserved.

No Square access token or other private payment secret is stored in the website.
