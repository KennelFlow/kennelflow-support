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


## App Store Connect verified TestFlight status (October 16, 2026)

- Connected to the real App Store Connect web interface and verified **iOS 2.8 (124)** is listed under TestFlight Builds, upload **Complete**, with build status **Ready to Submit**.
- A failed/replaced upload record also appears, but a separate successful upload record is marked Complete; the Build 124 entry is selectable.
- Build 124 has the **KennelFlow Beta Testers** *internal* group attached, containing two eligible testers.
- The group member list independently shows the owner's internal tester account **Installed 2.8 (124)** on an iPhone 17 Pro Max. Another internal tester is currently **Installed 2.8 (123)**.
- Added *What to Test* release notes to Build 124, instructing the team to check old customer records, subscription and lifetime purchase restoration, existing QR/NFC tags, cloud synchronization, and branding. Save confirmed; notes persist after a page reload.
- The public App Store version **2.8 Build 123** remains **Waiting for Review** and was not altered. No public App Review submission of Build 124.
- Outstanding: independent proof that the existing customer login retains its records, that subscription entitlements restore in the actual TestFlight install, that a physical NFC tag and printed QR open the correct existing dog/kennel on a physical iPhone, and that two-way cloud updates match the web portal. **Do not mark these done from TestFlight installation count or unit tests alone.**

## User-reported physical NFC smoke test (October 16, 2026)

- User confirms that an existing kennel NFC tag **works** on Kennel One Build 124 after being asked whether it opens the correct kennel. Record as **user-reported PASS** for this one existing tag and kennel.
- This does not establish that *all* NFC tags work, QR codes on a physical device were tested, or all customer records and subscription entitlements are intact.
- Still pending before any public rebrand submission: existing saved data/account confirmation and current subscription or lifetime access/Restore Purchases. Keep current App Store review submission untouched until release decision.



## Build 125 maintenance-record compatibility correction (October 16, 2026)

**IMPORTANT: Build 124 is for internal testing only; do not submit it as the public rebrand.**

A staging source comparison identified a hidden regression: the visible string replacement in Build 124 also changed the private \`UserDefaults\` namespace for device-only maintenance records from \`KennelFlow.maintenance.\` and \`KennelFlow.business.{identity}.maintenance.\` to \`Kennel One.*\`. That could hide preexisting records, even though the underlying bytes were not deleted.

Build 125 fixes this by retaining the original KennelFlow storage keys and adding a one-time, non-destructive merge for any maintenance history newly created under the temporary Build 124 keys. It preserves unique records, favors the newer Build 124 version for duplicate entry IDs, maintains business scope, and protects corrupted records rather than overwriting either copy. NFC/deep links, Bundle ID, StoreKit IDs, iCloud/CloudKit and Square technical identifiers remain unchanged.

**Automated iOS maintenance test suite: 20/20 PASS, 0 failures** using the \`MaintenanceTests\` Xcode scheme, including three new migration regression tests. Staged web regression suite: **21/21 PASS**.

A replacement **Kennel One 2.8 Build 125** signed archive and TestFlight upload are being prepared. Do not claim TestFlight upload completed unless Xcode and App Store Connect independently show success. Following installation, physical-device tests of existing maintenance history, customer records, subscription restoration and NFC mapping are still required before public release.


## Build 125 signed archive and Apple upload verification

- **October 16, 2026 ~11:45 PM Eastern:** corrected **Kennel One 2.8 (125)** was archived with Apple Developer Team 2J9CBS9546. Xcode reported **ARCHIVE SUCCEEDED**.
- Xcode verified the archive signature and uploaded it through App Store Connect. Its log records **Upload succeeded**, **Uploaded KennelFlow**, **EXPORT SUCCEEDED**. Technical app/product ID remains \`com.kennelflow.app\` (unchanged); display name is Kennel One.
- A separate local IPA export also succeeded, and the \`Apple Distribution\` signature matched the same Team ID. Production export has \`get-task-allow=false\`.
- Apple App Store Connect TestFlight upload list initially displayed Build 125 **Processing**. Do not report ready for internal testers until confirmed in Apple UI.
- Physical-device acceptance remains required: upgrade the owner's Build 124 TestFlight install to 125, confirm original kennel maintenance records plus any Build 124-created entries still appear, check existing account/other cloud records and monthly/yearly/lifetime entitlements, and recheck one existing physical NFC smart kennel tag.
- Do not modify existing public **2.8 Build 123 Waiting for Review**, and do not submit Build 125 for public App Store review until acceptance, domain and metadata blockers are addressed.


## Build 125 App Store Connect processing confirmation

- October 16, 2026, after upload, **iOS 2.8 Build 125** changed from **Processing** to **Complete** in App Store Connect upload history.
- Build 125 appears in the TestFlight iOS builds list as **Ready to Submit** and is assigned to the existing **KennelFlow Beta Testers internal group** with **2 eligible testers**. This is internal TestFlight readiness, not a public App Review status.
- The *What to Test* field for Build 125 was saved, then verified after reloading, including checks for legacy and Build 124 maintenance history, current records, subscription/lifetime restore, NFC/QR tags and cloud synchronization. Group assignment persisted.
- Xcode release IPA independently re-exported and passed \`codesign --verify --deep --strict\`, with valid **Apple Distribution** signature, \`com.kennelflow.app\`, Build **125**, and production \`get-task-allow=false\`.
- The existing public App Store **version 2.8 Build 123 remains Waiting for Review** and was not modified.
- **PENDING:** On a physical device, update to TestFlight Build 125 and confirm maintenance history from both releases; confirm purchase entitlements and existing data. User previously confirmed NFC on Build 124, but Build 125 still requires acceptance.
- DO NOT MERGE SITE REBRAND, CHANGE DNS, OR SUBMIT BUILD 125 FOR PUBLIC REVIEW UNTIL USER CONFIRMS REAL-DEVICE ACCEPTANCE AND PUBLIC BRANDING/DOMAIN/LEGAL METADATA ARE READY.


## Build 126: global wallpaper and maintenance navigation correction

User's October 16 screenshot of the Litters page showed that the shared app background still contained a large **KennelFlow** logo instead of the approved green **Kennel One K1** artwork. User also could not locate maintenance.

### Code changes in the existing iOS staging project
- \`RootView.swift\`: replaced the shared \`KennelFlowBackground\` implementation's *baked KennelFlowLogoWallpaper* image with a green/ivory gradient and the exact approved \`KennelFlowLogo\` K1 image asset (type name retained to avoid altering navigation or persistence). No remaining Swift references to \`Image("KennelFlowLogoWallpaper")\`.
- \`MoreView.swift\`: added a prominent **Maintenance** navigation shortcut as the first entry, opening \`KFMaintenanceOverview\`. Existing **More > Kennel Management > Maintenance Tasks & Overdue** and kennel-level maintenance links are preserved.
- \`MaintenanceViews.swift\`: the Maintenance overview now starts with an **Add & Manage Maintenance** section listing each kennel by natural name sort; tapping a kennel opens its full maintenance history and the existing Add, Edit, Delete, PDF, and attachment controls.
- Version advanced to **Kennel One 2.8 Build 126**, retaining \`com.kennelflow.app\`, current Apple subscriptions and cloud keys.
- Dedicated maintenance/history/QR test suite **20 of 20 passed**; full iOS simulator app compilation **BUILD SUCCEEDED**.
- New signed archive and TestFlight upload conditional on signing and identity checks. Do not claim Apple upload complete until export upload log and App Store Connect confirmation.
- Public App Store release held while user tests updated background, Maintenance shortcut, saved repairs, purchase entitlements and smart kennel NFC mappings.

No customer data, Square settings, CloudKit container IDs, product IDs, or live website settings changed.


## Build 126 TestFlight acceptance evidence (October 17, 2026)

- All **20 maintenance/legacy migration/QR tests passed**, zero failures, using the \`MaintenanceTests\` scheme.
- Full iOS app compiled in simulator: \`** BUILD SUCCEEDED **\`.
- Simulator iPhone 17 installed and launched \`com.kennelflow.app\`; visual screenshot showed **Kennel One** and its green K1 image on Dashboard. New shared wallpaper source uses this approved image, not baked-in \`KennelFlowLogoWallpaper\`.
- Signed Apple Developer Team 2J9CBS9546 archive: \`** ARCHIVE SUCCEEDED **\`; app name Kennel One, bundle ID \`com.kennelflow.app\`, version 2.8, Build 126; \`codesign --verify --deep --strict\` passed.
- \`xcodebuild\` App Store upload completed with **Upload succeeded** / **EXPORT SUCCEEDED** at approximately 12:03 AM Eastern on October 17.
- App Store Connect TestFlight upload status **Complete**; build list status **Ready to Submit**, internal group **KennelFlow Beta Testers** with **2 internal testers**.
- Added and verified after reload Build126 *What to Test* notes for Litters/other-screen wallpapers, top-of-More Maintenance, kennel Add/Edit/Delete, legacy repair history, NFC/QR mapping, account records and purchase access.
- **Public App Store review NOT changed;** old 2.8 Build 123 remains on its own review submission. App Store name, domain, site and store cutover still pending.

### Human verification remaining
- Owner updates iPhone TestFlight from Build125 to **Build126** and visually confirms the Litters screen no longer displays KennelFlow wallpaper and that **More > Maintenance** is the first option and opens existing kennel records.
- Retest customer login, subscription/lifetime access restoration, existing maintenance notes, QR and NFC smart kennel links on the owner's device.
- Do not submit rebrand to public review until this acceptance is confirmed.


## Build 127: approved high-contrast green wallpaper

User rejected the previous Build 126 wallpaper because the enlarged boxed app icon was visually cut off. They approved a darker mockup with a clearly visible K1 dog logo and KennelOne wordmark, no icon border or white square, over the existing sage/ivory color family.

- New \`KennelOneK1Emblem.imageset\`: transparent K1/dog-only image derived from the approved original green K1 app art. Dark and lime-green colors retained; cream rounded-square icon border and background excluded. The app icon itself remains unchanged.
- \`RootView.swift\` shared \`KennelFlowBackground\`: darker forest/sage blended SwiftUI gradients, center-aligned transparent K1 dog mark and live text **KennelOne** (forest-green Kennel, green gradient One). This is not a flattened mockup screenshot, so existing live cards, app content, and navigation remain functional.
- Staged app version 2.8 Build **127**, same bundle ID \`com.kennelflow.app\`, account, data keys, StoreKit, CloudKit, Square and NFC identifiers.
- Entire iOS simulator Debug build: **BUILD SUCCEEDED**. App installed and launched in iPhone 17 simulator; visually inspected screenshot of Dashboard after startup; no rectangular cream logo border is present. Simulator does not contain the owner's real litter/customer data, so on-device Litters acceptance still needed.
- Release signing/archiving and internal TestFlight upload pending final verification; do not conflate successful local compilation with Apple processing or public release.
- Public App Review submission, existing website and domain remain untouched until owner accepts this wallpaper in TestFlight.
