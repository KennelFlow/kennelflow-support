# Kennel One — QA and release notes (2026-10-17)

This is an engineering verification log, not a claim of public release.

## Confirmed
- iOS version 2.8 Build 128 signed archive exists with the existing `com.kennelflow.app` bundle ID. Its prior App Store submission was recorded as Waiting for Review; the public listing remains 2.7 at the latest public check.
- Xcode iOS native maintenance tests: 20 passing, 0 failing, including legacy maintenance migration, QR route compatibility, saved records, repeat reminders, and PDF reports.
- Web management UI: 21 passing, 0 failing, covering auth, sync conflicts, natural numeric sort, QR, calendar, duties, and record handling.
- Business backend: 42 passing, 0 failing, covering isolation, SQL permissions, invitations, revisions, employee roles, account changes, and file protection.
- Website and store staging checks: 8 passing, 0 failing, covering catalog-price parity, links, approved artwork, checkout endpoint stability, and legal wording.
- The iPad and iPhone simulator apps compiled and launched; iPhone screenshots identified two small-screen dashboard defects.
- Source-only visual fix: make `Smart Kennel Scan` fit its card, remove a decorative chart behind the Expenses label. Rebuilt and verified on the iPhone simulator. This source-only fix was NOT present in the already submitted Build 128.
- Production website, live management portal, and both production/Sandbox payment health URLs returned HTTP 200 over HTTPS in checks. Payment health reported configured webhook and cloud integration, which is readiness, not proof of an actual card charge.
- Live portal returned 200 on /health and 401 on unauthenticated /api/me and /api/records, correctly denying anonymous account/record access.
- Production and isolated test database branches were accessible read-only, each with 11 application tables.
- Isolated test database contained 3 completed Sandbox checkouts and 3 `Square Sandbox — TEST ONLY` payment ledger records with 3 distinct references at the time of the check. No real charges were initiated.

## Held / next release gates
- Build 128 is already submitted to Apple and was previously verified Waiting for Review; its existing review submission was not changed. Build 129 containing only the two dashboard layout corrections archived successfully, passed code-signature validation, and uploaded successfully to App Store Connect on October 17, 2026 at approximately 11:45 AM Eastern. Apple reported the uploaded package is processing. TestFlight availability and public review status of Build 129 are NOT yet confirmed.
- The public marketing website still displays KennelFlow while the management portal displays Kennel One. Kennel One public website changes remain in the staging branch / pull request, not merged.
- Privacy, returns, shipping, hardware, warranty, and terms still need final policy review before rebranding the customer-facing store.
- Confirm ownership/availability of any new domain; do not purchase or modify DNS without an approved target. Preserve existing working `kennelflowpro.app`, `app.kennelflowpro.app`, customer logins, API and webhook URLs.
- Confirm new support email can receive mail, and verify official App Store Connect subscription pricing, Apple review/release state, and any future App Store listing updates through authorized Apple access.
- Automated simulations are not full real-device NFC, Apple Pay, StoreKit, or two-way production sync validation; keep these as explicit tests before final sign-off.
- Final App Store release is not complete while the public listing remains 2.7.


## Follow-up checks and deliverables
- October 17: three 1080-by-1920, nine-second H.264 MP4 promotional **screen tours** were generated from genuine app screenshots and verified by decoding a video frame. Clips: KennelOne-Overview.mp4, KennelOne-Daily-Care.mp4 and KennelOne-Smart-Kennels.mp4. Copies are in a KennelOne-Marketing-Videos folder on the owner's Mac Desktop. These are *not* recordings of live interactions, and should not be described as Apple App Preview recordings.
- October 17: authoritative Google registry RDAP returned HTTP 404 for `kennelone.app`. That is not confirmation of checkout availability, domain purchase, ownership, DNS, or trademark rights. No purchase was made; current working domains and customer records were left untouched.
- The connected Gmail account is the legacy KennelFlow support account; receiving mail at the proposed new Kennel One support address was not independently verified. Preserve the old support contact until mailbox validation.
- An opt-in condition-based release watch is active, checking Apple's public listing periodically, alerting only for verified changes. It does not submit builds or modify production.

## Continued verification
- Build 129 itself passed 20/20 native iOS XCTest cases in addition to compiling, archiving, code-signing and uploading successfully. Its small-iPhone simulator screenshot was visually inspected after the layout fixes.
- Isolated Square Sandbox branch checkout-to-ledger reconciliation joined on Square payment IDs embedded in the recorded reference: all 3 completed Sandbox orders match **exactly one** test ledger row each. No production charge or write.
- Public US App Store page shows current in-app pricing as $10.99 monthly, $99.00 yearly, $299.99 lifetime, matching owner targets. App Store still publicly shows version 2.7 during the check.
- Public Apple privacy label currently says "Data Not Collected." The backend holds off-device account and operational data, so an App Privacy disclosure audit is required before marking this release fully ready; see `docs/KennelOne-App-Privacy-Disclosure-Review.md`.
- Registry RDAP reported `kennelone.app` not found/unregistered on 2026-10-17. No purchase or DNS change was attempted.
- The authorized Mac test-only /tmp Xcode DerivedData directories were cleared after testing; signed 128 and 129 archives, source staging, screenshots, and upload logs remain preserved.

## Afternoon update (supersedes older deployment status above)
- Version 2.8 Build 130 was archived and uploaded; all 20 native tests passed. Apple processing and TestFlight readiness are not confirmed. The public App Store listing still shows KennelFlow 2.7.
- GitHub Pages is serving Kennel One branding and current subscription prices from main commit b446d61 at kennelflowpro.app. Its deployment succeeded and eight safe-rebrand tests passed; checkout endpoint, product identifiers, and customer portal were preserved.
- The authoritative domain is kennelone.app. Its public DNS and Render TLS are correctly configured. Both hostnames have certificates, while the local Mac router may still cache a parked IP. Forced-target HTTPS returns 200 at the apex and 301 at www.
- The separate Render marketing site was redeployed to match the current support email. The staged full privacy draft is not published or approved, and indexing remains off.
- Both production and isolated Sandbox payment services returned healthy responses. Three completed isolated Sandbox checkouts matched distinct Sandbox ledger references without new payment charges.
- Employee permissions, authenticated cross-device use, NFC, and Apple Pay remain release acceptance tests. Do not label them completed based on unit tests alone.
