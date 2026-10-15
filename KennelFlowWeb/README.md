# KennelFlow Web management

This service uses the existing production KennelFlow Business API. It provides typed forms for the 37 record collections advertised by `/v2/capabilities`, using the Codable shape in iOS 2.7 Build 112. It does not create a second database or migrate user records.

Run `node server.mjs` (Render supplies `PORT`). Runtime dependencies: Node.js 24 only. Run `npm ci && npm test` for the local HTTP, permissions, model-validation and DOM tests. The explicit development-only integration suite is `node --use-env-proxy tests/integration.mjs`; its target is pinned to the development branch, never production.

## Behavior

- Authenticate through the existing Business login; keep bearer tokens on the server, with HttpOnly, Secure, SameSite=Strict browser cookies in Render.
- Obtain kennel memberships through `/v2/me`, matching the native client. The Business API does not expose a standalone `/v2/kennels` list route.
- Check membership and role on each write. The upstream API and database remain authoritative for authorization, attribution and revisions.
- Send writes as the existing iOS envelope: `{type, expectedRevision, data: {platform: "ios", collection: type, record}}`. Use second-resolution ISO 8601 dates so Foundation's `.iso8601` decoder accepts them.
- Preserve untouched and unknown record fields. Require review of simultaneous edits; combine disjoint field changes, and ask which version to keep for overlapping changes. Never automatically retry a stale save against a newer revision.
- Delete with tombstones; restore with the acknowledged revision. The browser refreshes active pages every 15 seconds; iOS already checks every 30 seconds while connected and active.
- Transfer document bytes through the existing immutable file API, with SHA-256 integrity verification and a 10 MB limit. Keep a failed upload open for retry.
- Preserve an open draft across a session-expiry sign-in. Drafts are in memory; they are not persisted in browser storage. Server restarts require signing in again.

## Validation performed

- Local HTTP and DOM suites cover all 37 forms, writes, identity validation, membership isolation, staff/viewer restrictions, CSRF, secure cookies, conflicts, delete/restore, document integrity, merged edits and session-expiry draft preservation.
- Live development-cloud tests created and read all 37 collections from separate sessions, checked web/native API changes, stale writes, tombstones/restores, immutable files, account isolation and staff restrictions.
- All 37 generated fixtures decoded and re-encoded using the actual Swift Codable model declarations on the user's Mac.
- The actual Build 112 `KennelSyncClient` downloaded a website change from the development backend, wrote the next revision and received HTTP 409 for a stale write.

## Scope

Cloud management applies to records enrolled in KennelFlow Business. Device-only records appear after their original device connects and syncs. These changes do not implement browser-native NFC programming, replace camera/document scanning hardware flows, or add device-local data that the existing Business API does not synchronize. Native notifications and background execution follow the native app's existing behavior. No native source changes or App Store build are required for the 37 existing supported collections.
