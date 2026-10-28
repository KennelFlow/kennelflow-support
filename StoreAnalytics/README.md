# Kennel One — Microsoft Store daily analytics

This isolated job imports official **successful Windows Store installs** for product
9N2X8HKZV2NN. It does not count sign-ins, downloads, acquisitions, sales,
subscriptions, or unique people. It queries the last **30 complete UTC days**
and updates only the existing Windows row in public.platform_store_metrics.

## Current release state

Source and automated tests may be prepared in a feature branch without
affecting the live app or payments. The GitHub Actions daily schedule will
run ONLY after the workflow is merged to the repository default branch.
Do not merge until the associated payment services' auto-deployment risk
is resolved. Until then, NO automatic synchronization is running.

## Microsoft Partner Center setup

1. Sign into Partner Center with the Microsoft Entra ID associated with the
   Windows developer account. The consumer Microsoft account is insufficient
   for the "User management" / "Microsoft Entra applications" section.
2. Register or associate a **dedicated Microsoft Entra application** with
   permission to access Windows Store analytics (Microsoft docs require a
   Partner Center Manager role / permitted equivalent; verify actual scope).
   Do not use a personal login token.
3. Obtain tenant ID, app (client) ID and a new client secret from Entra /
   Partner Center. Do not put the secret in commits, chat, screenshots or logs.
4. Create a **separate Neon PostgreSQL login restricted to the
   platform_store_metrics table**. It needs CONNECT, schema USAGE and
   SELECT, INSERT, UPDATE on this table ONLY, not customer or payment tables.
5. In the GitHub repository's Settings -> Secrets and variables -> Actions,
   create the exact four secrets below:
   - MSSTORE_TENANT_ID
   - MSSTORE_CLIENT_ID
   - MSSTORE_CLIENT_SECRET
   - NEON_STORE_REPORTING_DATABASE_URL
6. Review the scheduled workflow, permissions and production deploy paths
   before merging to the default branch or enabling a separate scheduler.

## Security details

- Requests Microsoft access tokens using OAuth2 client credentials and the
  Microsoft Store resource https://manage.devcenter.microsoft.com.
- Validates the expected Store ID, integer counts, response schema,
  paginated links and the report end date.
- Never prints access tokens, client secrets or database connection strings.
- Does not write when the API fails or credentials are missing.
- Applies an idempotent, parameterized upsert to the Windows metric row.
- GitHub Action uses read-only repository permission and skips gracefully
  while configuration is incomplete.
- Does not change Microsoft Store submissions, purchases or user records.

## Developer tests

From StoreAnalytics:

    npm install --ignore-scripts
    npm test

A live **read-only dry run** can be executed after Microsoft credentials
are configured by setting MSSTORE_DRY_RUN=1 and running npm run sync.
A dry run never connects to the reporting database.

Microsoft docs:
https://learn.microsoft.com/en-us/windows/uwp/monetize/access-analytics-data-using-windows-store-services
https://learn.microsoft.com/en-us/windows/uwp/monetize/get-app-installs
https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/manage-azure-ad-applications-in-partner-center
