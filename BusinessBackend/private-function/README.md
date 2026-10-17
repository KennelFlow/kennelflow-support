# Kennel One isolated private messaging function

This optional, separate Neon function is intended for a future authenticated
Business Account messaging release. **It is not yet deployed** and must not be
described as usable by production customers.

- Slug: `kennelprivatemsg`; runtime: Node.js 24.
- Routes: `GET /health`; `GET/POST /v2/kennels/:kennelUUID/private-messages`.
- Requires the existing 64-character Business bearer token. The server hashes
  the token and checks the current app session and tenant membership. It never
  trusts the client to specify a sender or private team PIN.
- Only owner/admin/staff accounts may send or read. Existing SQL functions
  `business_private_inbox` and `business_private_send` enforce recipient and
  participant isolation. The restricted database role cannot directly read or
  write the private messages table.
- Deploy as a **new, isolated function**; do not replace `kennelflowapi`
  deployment #8 or switch the native app endpoint until the dev QA matrix passes.
- Use a restricted `kennelflow_api` connection string configured as a runtime
  `DATABASE_URL` secret. Never put that URL in source control, logs, or test output.
- The deployment did not complete through the current connected management
  access. Check Neon deployment status before repeating any action. Production
  currently has no new private-message HTTP function.
- Acceptance: invalid/missing bearer denied, owner/admin/staff access allowed,
  viewer and wrong-kennel denied, retries idempotent, own inbox only, no leaked
  SQL errors, cross-device messages visible to authorized participants, and
  native sender role verified after sign-out/in.
- Development: run `npm ci && npm test` from the parent BusinessBackend folder.
