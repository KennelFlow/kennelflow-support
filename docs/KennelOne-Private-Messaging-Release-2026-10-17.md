# Kennel One — private employee messaging release gate

## Work completed (staged native Build 131 / backend migration 011)
- Native source: `~/Developer/KennelOne-Build131-PrivateMessaging`, archive `~/Developer/KennelOne-Build131-PrivateMessaging.xcarchive`. Existing Build 130 archive and App Store submission preserved.
- Build 131 removes the public CloudKit employee PIN publish/claim route from the app and instead links staff onboarding to the authenticated Business Account invitation flow. Employee messages use the authenticated Business session, not public CloudKit.
- Backend `BusinessBackend/api.mjs` adds GET and POST `/v2/kennels/:id/private-messages`. The sender is derived from verified bearer authentication, not client-supplied employee identity.
- PostgreSQL migration `011_private_messages.sql` adds `business_private_messages` plus restricted stored functions. Force RLS; only authorized tenant members may send; only sender and recipient may read. Invalid membership fails closed. Message-ID retries are idempotent, and conflicting retries are rejected.
- Staged backend tests: 58 pass, 0 fail (including real SQL access-control integration using ephemeral PGlite).
- Native 2.8 Build 131: iOS simulator build passes; 20/20 XCTest cases pass; signed device archive successfully created.
- Migration 011 was applied to Neon development and then production, transactionally; production checks confirmed forced RLS, 2 policies, zero messages, API role has no direct SELECT or INSERT on table but may execute the controlled stored functions.
- Production Neon function `kennelflowapi` **has not been redeployed**, so production does not yet expose the private-messages HTTP route. Existing production login/sync and payment endpoints were preserved.

## Remaining release-critical dependencies
1. Obtain the latest production Neon `kennelflowapi` function package or verified adapter source matching deployment 8. The older Android build 17 function entrypoint is dated October 8, predates current deployment, and must **not** replace the live adapter. Deploy the revised backend without losing any legacy endpoints, then test token auth, owner/staff/viewer roles and cross-kennel isolation against a disposable test tenant.
2. Only after API verification, deliver Build 131 to TestFlight and verify it appears. Apple App Store Connect currently requires sign-in; never claim TestFlight processing or review status from `xcodebuild` upload alone.
3. Verify CloudKit production schema/permissions for any *older* employee identity records. Stopping further public publishing does not erase old data or revoke legacy ACLs. Changing CloudKit schema needs controlled owner account access.
4. Test real-device NFC scanning, Apple Pay, app subscriptions, messaging, device-to-cloud sync and restoration. A simulator cannot substitute for physical NFC/Apple Pay.
5. Complete owner-reviewed privacy policy, App Store privacy-label disclosures, purchase terms and search-engine indexing. Public App Store still listed KennelFlow 2.7 at latest check.

No actual customer data, payment ledger entries, or production messages were changed during these staging checks.

## Later verification: Build 131 uploaded
- Apple Xcode export and App Store Connect upload succeeded: `~/Developer/KennelOne-Build131-Upload.log` contains `Upload succeeded`, `Uploaded KennelFlow`, and `EXPORT SUCCEEDED`. There were two non-blocking warnings for third-party Square SDK dSYMs. **Processing/TestFlight status remains unverified** without an authenticated App Store Connect view.
- The paired physical iPhone 17 Pro Max reports `Kennel One` version `2.8` build `131` installed via read-only `devicectl device info apps`. Installation source was not determined. The device and its stored data were not modified during this check.
- Code signature of Build 131 archive validated successfully; simulator installation and process launch succeeded. The signed archive, native source, and all testing/upload logs were retained after cleaning only disposable Build 131 DerivedData.
- Focused backend draft pull request [#11](https://github.com/KennelFlow/kennelflow-support/pull/11) was created, based on the current `main` branch, with all required backend files. This PR was not merged; the live website and payments remain unchanged.
- Existing hourly Kennel One release watch now includes Build 131 processing/availability (only verified changes, no inferred TestFlight status).
