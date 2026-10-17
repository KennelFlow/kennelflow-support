# Kennel One release validation — October 17, 2026

This report distinguishes verified checks from pending approvals. It is a staging-branch report, not authorization to merge or deploy.

## Verified today

- Native archive: Kennel One 2.8 (128), existing com.kennelflow.app bundle identifier; code signature valid.
- Native code: iPad simulator application build succeeded from the 2.8/128 source.
- Native UI: iPad and iPhone simulator application launched, preserving the approved Kennel One mountain background, logo, dashboard and bottom navigation. A later staged iPhone rebuild showed the complete Smart Kennel Scan title; this revised simulator build has **not** been uploaded to Apple.
- QR deep link: the iOS system displayed the expected first-use “Open in Kennel One?” prompt. A completed in-app physical scan is still unverified.
- iOS native tests: 20/20 passed, including maintenance migration, recurrence, editing, QR routing, PDF, and persistence.
- Customer portal tests: 21/21 passed, including 46 shared record collections, numeric ordering, conflict protection, daily duties, calendar, QR and authorization.
- Business API tests: 42/42 passed, including row-level isolation, employee roles, invitations, file permissions, revisions and business profile editing.
- Marketing/store rebrand tests: 8/8 passed, including SKU/price catalog parity and maintained purchase endpoints.
- Total automated tests: 91/91 passed.
- Staged legal-page typo corrected; regression test added.
- Customer portal at https://app.kennelflowpro.app served HTTPS 200 and Kennel One title.
- Public marketing site at https://kennelflowpro.app served HTTPS 200 but still carried the previous KennelFlow name.
- Production and sandbox payment /health responded HTTP 200, with correct environment, cloud and webhook configuration readiness. No charges were made.
- Database connections were available on production and isolated test branches; both exposed 11 application tables. No customer data was edited.
- Public Apple App Store metadata on October 17 still showed KennelFlow 2.7. Build 128's prior reported review state is not independently confirmed by this check.
- Subscription UI uses StoreKit product identifiers and displays prices from Apple, so the source cannot confirm configured App Store amounts or localized pricing.
- The Kennel One staging pull request is #10 and remains unmerged.

## Release gates still open

1. Verify App Store Connect review status for 2.8 (128), subscriptions, one-time full access and manual-release settings directly in the Apple account.
2. Confirm full manual device regression on real iPhone and iPad: screen-by-screen Add/Edit/Delete/Save, all sheet backgrounds, scanning physical QR/NFC, Apple Pay, subscription purchase/restore, notifications, accessibility and existing customer migrations.
3. Confirm two-way changes between app and website with a disposable test account, including conflict protection, after checking no real customer records will be changed.
4. Run isolated Square Sandbox payment, webhook replay and exactly-once ledger verification; the health check alone does NOT prove settlement or idempotency.
5. Review/approve site privacy, terms, shipping, returns and warranty policies. Current staging legal pages intentionally carry review notices.
6. Verify Kennel One support email can receive mail. Preserve the known working legacy contact until mail delivery and migration are confirmed.
7. Verify availability/ownership, trademark clearance and planned DNS/HTTPS/redirects for any new Kennel One domain; preserve existing domains and webhook callback URLs.
8. Review physical-stock labels and photos against items sold before replacing inventory images.
9. Produce and validate three real in-app demo videos; do not misrepresent screenshot slideshows as live demonstrations.
10. Keep staging PR #10 unmerged until the above release blockers are resolved and business owner approves public website/brand switch.

## Pricing for review

- Monthly: $10.99
- Annual: $99.00
- One-time full access: $299.99

These are requested prices, not independently confirmed App Store Connect amounts.

## Shipping policy

Do not alter production payment behavior, existing app bundle identifier, CloudKit data ownership, working QR/NFC payloads, customer accounts or live marketing domains during staging.
