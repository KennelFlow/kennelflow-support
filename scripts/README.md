# Kennel One release smoke check

Run `node scripts/kennelone-release-smoke.mjs` from the repository root. It performs **read-only requests** and requires no API tokens, customer login, or production writes.

The suite checks:

- The main `kennelone.app` HTTPS website, www redirect and support contact.
- The preserved `kennelflowpro.app` website and requested subscription prices.
- The live customer portal's health and anonymous access controls.
- Production and isolated Sandbox payment service health and environment labels.
- Apple's publicly listed app name/version and the public marketing indexing flag.

`PASS` = public check passed; `PENDING` = known launch gate awaiting Apple approval or owner-reviewed policy/indexing; `FAIL` = verified public check failed or timed out. The process exits nonzero for a `FAIL` so it can be used in a QA job without automatically changing production.

**Important limits:** Health endpoints do not prove a payment actually settled, that a webhook is perfectly deduplicated, or that authenticated app/cloud synchronization works. No test here validates CloudKit role permissions, device NFC, StoreKit, or App Store Connect review state beyond the public listing. Do not enable indexing before legal and privacy review.
