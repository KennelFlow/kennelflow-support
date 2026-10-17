# Kennel One — controlled rebrand (staging only)

**Status:** Preparatory work; do **not** merge, deploy, or retire current KennelFlow addresses until the release checks below are completed.

## Approved identity

- Public-facing name: **Kennel One** (wordmark **KennelOne**).
- Chosen artwork: user-approved green K1 emblem incorporating the original floppy-ear KennelFlow dog silhouette, with dark forest-green “Kennel,” brighter green “One,” and matching cream rounded-square app icon.
- Exact source artwork and two draft icon exports were prepared as a separate asset package in the ChatGPT conversation. **The approved K1 graphics are not yet in this repository or Xcode asset catalog.** Do not substitute an unrelated logo or ship a low-resolution mockup.

## Existing infrastructure to preserve

- iOS Bundle ID: `com.kennelflow.app` (must remain unchanged to update the existing App Store listing).
- iOS project source: `~/Developer/KennelFlow-Business108/KennelFlow-Build113`, version 2.8/build 123.
- Independent staging copy: `~/Developer/KennelOne-Rebrand-Staging-Build123`. The original project is not changed.
- Production Render web service: `kennelflow-web`, deployed from `kennelflow-web-readonly`; do not change service branch yet.
- Separate staging web checkout: `~/Developer/KennelOne-Web-Rebrand-Staging` from branch `kennel-one-rebrand-preparation`.
- Keep original `KennelFlowPro.app` domain and `app.kennelflowpro.app` endpoint reachable during migration.
- Retain legacy NFC / QR URLs, deep links, existing Square endpoints, payment callbacks, cloud database connections, login cookies, customer memberships, stored data file names, purchase/product identifiers and Apple subscription groups. Branding may change; these technical identifiers should not.

## Staging changes already made

- Web: title, header/wordmark text, login copy and user-facing frontend messages changed to Kennel One. CSS header wordmark updated.
- Web validation: JavaScript syntax check passes; 20 focused existing web tests pass (0 failures), including login, record operations, employee access, numerical sorting and QR links.
- iOS staging: display name updated to **Kennel One** for Debug and Release, while preserving Bundle ID/version/build.
- iOS staging: 103 user-visible brand-name references updated in 16 Swift files; `swiftc -frontend -parse` passes for changed files.
- **Not yet** replaced staging `AppIcon.appiconset` and in-app `KennelFlowLogo` / wallpaper with approved artwork.

## Before any release or DNS cutover

1. Clear the Kennel One name for Apple App Store naming and trademark risk; independently verify the exact new domain in the registrar cart.
2. Acquire `kennelone.app` only if the owner approves the purchase and price. Preliminary .app registry RDAP returned not-found; this is *not* a checkout guarantee.
3. Export production-quality approved app icon and in-app logo, then replace iOS asset catalog and web image assets **in staging only**.
4. Compile iOS with Xcode; verify physical-device login, existing subscriptions and lifetime access, all user records, deep-link/NFC and QR scans, Square/Apple Pay, attachments, sync, and the full native management menus in TestFlight.
5. Prepare public marketing pages on `kennelone.app`, customer portal on `app.kennelone.app`, and store on `shop.kennelone.app` if confirmed as the chosen URL layout. The current Render service is a customer management portal, **not proof of a live storefront host**; verify the store platform before changing checkout links.
6. Verify DNS, HTTPS, login cookies, session persistence, CORS/CSRF, mobile universal links and redirects. Do not blindly redirect machine endpoints, NFC links or payment webhooks.
7. Verify Square and Apple Pay website domain approvals / webhooks, and preserve historical invoices and purchase records.
8. If creating a branded email (e.g. `support@kennelone.app`), provision email hosting and DNS (SPF, DKIM, DMARC) before publishing the address. Current Gmail mailbox remains `kennelflowapp@gmail.com`; changing its sender label is a separate Google Account/Gmail settings action.
9. In App Store Connect, rename existing app listing and update description, screenshots, icon via new build; keep existing product IDs and subscription entitlements. TestFlight before review.
10. Publish only after end-to-end validation, then maintain old domains and customer migration messaging (e.g. “Kennel One, formerly KennelFlow”).

## Final release gates

- Name/domain ownership verified.
- Correct green K1 assets included and tested.
- Full iOS build successfully tested in TestFlight.
- Live web, store, DNS and HTTPS verified.
- No interruption to user accounts, data synchronization, existing subscriptions or payments.
- Apple has accepted the rebranded update.

Never claim an App Store upload, domain purchase, production launch, or payment migration completed without independent verification.

## Build 124 TestFlight upload (October 16, 2026)

**Archive and Apple upload accomplished — this does NOT equal TestFlight-ready or App Store approval.**

- Kennel One 2.8 (124), bundle ID \`com.kennelflow.app\`.
- iOS simulator app compiled, installed and launched successfully; screenshot confirms Kennel One green K1 branding in dashboard.
- QR/deep-link simulator smoke test prompted **Open in “Kennel One”?**, confirming the existing application link routing remains recognized. Does not test a real assigned NFC tag or customer data.
- 14 focused website integration tests passed (including authentication/roles and generated QR decoding). Earlier all 21 website tests passed.
- Xcode signed release archive succeeded at \`~/Developer/KennelOne-Build124.xcarchive\`.
- Xcode export/upload log \`/tmp/KennelOne-Build124-Upload.log\` records **Uploading “KennelFlow.ipa” is complete**, **Uploaded package is processing**, **Upload succeeded**, and **EXPORT SUCCEEDED** (approximately 10:59 PM Eastern on October 16). An earlier upload-file entity was replaced by Apple's service; the upload workflow recovered and succeeded.
- Independent local export of the same archive succeeded; release IPA signature verified **Apple Distribution**, matching Team ID; release \`get-task-allow=false\`, and original CloudKit, Square Apple Pay and NFC entitlements intact.
- Apple reported missing dSYM files for third-party Square SDK frameworks; these were warnings, not blocking errors.
- Existing Apple subscription product identifiers for monthly, yearly and lifetime were preserved unchanged.
- **Actual App Store Connect processing completion and TestFlight tester availability NOT verified yet.**
- **Actual customer login, existing Apple purchase/restore and live assigned NFC tag on physical device NOT verified yet.** Do not treat code-level or mock test passes as proof. Confirm using authorized test devices/accounts and no real charges before public release.
- No public App Store review submission, website deployment, new domain registration, DNS change, or payment migration was made.

### Release blockers remaining

1. Confirm App Store Connect build processing completes and Build 124 becomes available to internal TestFlight testers.
2. Perform physical iPhone TestFlight tests: existing account retains dogs/kennels and other records; subscription and lifetime access restore correctly; scanning an existing printed QR code and programmed NFC tag resolves the correct saved kennel/dog; live cloud sync works; Square integration tested safely in sandbox.
3. Confirm app name **Kennel One** is available/accepted in App Store Connect and required metadata, privacy policy, terms and support branding are accurate before submitting for public App Review.
4. Do not change public domains or production payment callbacks until new domain is registered and DNS/HTTPS/redirect/Apple Pay checks have passed.
