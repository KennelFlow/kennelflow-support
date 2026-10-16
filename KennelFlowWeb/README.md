# KennelFlow Web management

This service uses the existing production KennelFlow Business API. It provides typed forms for the 37 record collections advertised by `/v2/capabilities`, using the Codable shape in iOS 2.7 Build 112. It does not create a second database or migrate user records.

Run `node server.mjs` (Render supplies `PORT`). Runtime dependencies: Node.js 24 only. Run `npm ci && npm test` for the local HTTP, permissions, model-validation and DOM tests. The explicit development-only integration suite is `node --use-env-proxy tests/integration.mjs`; its target must be verified against the intended isolated database before use. A cloned function can retain an explicitly overridden database URL from its parent.

## Behavior

- **Employees**: owners/admins can create 48-hour invitations, view pending invitations, cancel them, manage permitted roles, and remove access. The owner role is protected; admins cannot manage other admins. The website produces a private invitation link to share directly; it does not email employees automatically. Invitees use their existing Business password or create their own account through the acceptance form. Tokens are carried in a URL fragment, immediately removed from the address bar, and never persisted in browser storage.
- Employees can clock themselves in/out using database timestamps. Repeated clock-in requests reuse the open entry. Owners/admins can review, correct, and print hours for a date range and select employees when recording time or assigning tasks. Open entries count elapsed time through the selected period. Corrections retain record revisions and work history.
- The backend captures every future cloud record save in an append-only work-history table, including app-originated sync writes, completion changes, soft deletion, restoration, and time corrections. Entries use the authenticated account, not a name supplied by the browser. Historical changes before migration 009 are not reconstructed. Device-only/offline actions appear when uploaded by their authenticated Business account.
- Staff/viewers see only their own personal history and time records. Financial, contract, customer, and document permissions retain the existing restrictions. Staff cannot directly edit time entries or another employee's clock. Permission changes invalidate existing sessions; removal preserves historical records.

- Authenticate through the existing Business login; keep bearer tokens on the server, with HttpOnly, Secure, SameSite=Strict browser cookies in Render.
- Obtain kennel memberships through `/v2/me`, matching the native client. The Business API does not expose a standalone `/v2/kennels` list route.
- Check membership and role on each write. The upstream API and database remain authoritative for authorization, attribution and revisions.
- Send writes as the existing iOS envelope: `{type, expectedRevision, data: {platform: "ios", collection: type, record}}`. Use second-resolution ISO 8601 dates so Foundation's `.iso8601` decoder accepts them.
- Preserve untouched and unknown record fields. Require review of simultaneous edits; combine disjoint field changes, and ask which version to keep for overlapping changes. Never automatically retry a stale save against a newer revision.
- Delete with tombstones; restore with the acknowledged revision. The browser refreshes active pages every 15 seconds; iOS already checks every 30 seconds while connected and active.
- Transfer document bytes through the existing immutable file API, with SHA-256 integrity verification and a 10 MB limit. Keep a failed upload open for retry.
- Preserve an open draft across a session-expiry sign-in. Drafts are in memory; they are not persisted in browser storage. Server restarts require signing in again.

## Shared-record workflows

Duty templates form a virtual checklist for each date. Completion saves a dated record and preserves previous days; browser sessions use a deterministic record ID to reject duplicate simultaneous completions. Category renames update the associated templates and saved history. Concurrent offline native completions can still create separate records under the existing native model.

Calendar days combine saved events and schedules from shared records, including one daily-duty entry per date. Completing a recurring event saves its history and creates a deterministic next occurrence; retries reuse that ID. Dog care profiles, recorded-ancestor pedigrees, payment receipts and record reports can be printed. Breed, registry, coat and color suggestions match Build 112.

Camera capture attaches a photo through the immutable file API. Replacement uploads a new version before moving the old metadata to recoverable deleted history. QR labels use the native deep link and can be read locally from camera frames or code photos. Web NFC requires a supporting browser and device; Safari users need the native app for physical NFC operations. Rebuild the checked-in QR codec bundle with `npm run build:scan` when changing its source or dependencies.

## Validation performed

- Local HTTP and DOM suites cover all 37 forms, writes, identity validation, membership isolation, staff/viewer restrictions, CSRF, secure cookies, conflicts, delete/restore, document integrity, merged edits and session-expiry draft preservation.
- Live development-cloud tests created and read all 37 collections from separate sessions, checked web/native API changes, stale writes, tombstones/restores, immutable files, account isolation and staff restrictions.
- All 37 generated fixtures decoded and re-encoded using the actual Swift Codable model declarations on the user's Mac.
- The actual Build 112 `KennelSyncClient` downloaded a website change from the development backend, wrote the next revision and received HTTP 409 for a stale write.

## Scope

The employee backend source and additive migration are in `../BusinessBackend`. Apply migration 009 to an isolated development branch first, then deploy the updated API/repository modules through the existing function adapter, preserving its legacy routes and restricted database identity. Run the backend SQL/security suite with `npm ci && npm test`; run the explicit development-only employee integration suite with `node --use-env-proxy tests/employees-integration.mjs`. Production credentials and function adapter secrets are never committed.

Cloud management applies to records enrolled in KennelFlow Business. Only records enrolled in Business sync can appear across devices. Detailed maintenance logs and the native professional-record stores (including veterinary clinics/services, OFA records, employee profiles and pedigree overrides/scans) remain device-local in Build 112. They require coordinated native/API changes and an account-scoped migration before website synchronization. These changes do not synchronize those stores or replace native document OCR, notifications or hardware features. Native notifications and background execution follow the native app's existing behavior. No native source changes or App Store build are required for the 37 existing supported collections.
