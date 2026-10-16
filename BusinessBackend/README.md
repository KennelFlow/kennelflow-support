# KennelFlow Business employee services

Source for the existing Business API, repository, permissions, schema migrations, and database/security tests. Migration `009_employees.sql` adds shared clock operations, pending-invitation cancellation, and append-only work history without modifying existing kennel records. Clock entries use the existing `StaffTimeEntry` Codable payload, so owner and employee sessions receive them through normal native synchronization.

`createAPI(createRepository(restrictedDatabaseURL))` supplies a web-standard `fetch(request)` handler. Production's existing function entry point delegates `/v2/` requests here and retains its previous legacy handler for other routes. Preserve that adapter and existing environment when deploying these modules. Do not replace the restricted database role with an administrator connection.

Apply schemas in numbered order to an isolated development branch. Run `npm ci && npm test` for database RLS, invitation, permission, audit, and clock tests. Apply only the new additive migration to an already configured production branch after development integration tests pass. The web project's employee integration suite is pinned to the existing isolated development API and creates disposable test accounts there.

History starts at migration installation, uses the authenticated cloud actor, and is not a reconstruction of offline/device-local history. Older employee activity records remain available separately. Business account membership is authoritative for access; local-only employee profiles do not create cloud login accounts.
