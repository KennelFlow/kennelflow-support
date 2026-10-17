# Kennel One — App Store privacy disclosure audit
Engineering checklist, **not** a legal opinion or an approved disclosure.
Reviewed October 17, 2026.

## Observed discrepancy
The public US App Store listing for app ID 6809212861 says "Data Not Collected" for version 2.7. This should be reviewed because the connected Kennel One app/backend persists some account and operational records off-device.

Apple guidance: https://developer.apple.com/go/?id=info-1
Live listing: https://apps.apple.com/us/app/kennelflow/id6809212861

## Source-backed data flows requiring an App Privacy response
- **Business owner/team accounts:** `BusinessBackend/schema/004_auth.sql` stores account email, password hash, and display name. `007_business.sql` has team invitations and role information. Account and role records may be tied to user identities.
- **Cloud kennel records:** `BusinessBackend/schema/001_kennelflow.sql` persists kennel-specific structured JSON records. The web portal exposes Dogs, Clients & Boarding, Contracts, Expenses & Payments, Photos & Documents, Employee/Staff Records, QR/NFC records, and more. Many entries can contain customer names or business information.
- **Files/photos:** `BusinessBackend/schema/008_files.sql` and web document/photo upload flows store user-supplied attachments.
- **Payments:** Square handles checkout; the backend stores checkout/payment references, amounts, and ledger records. Confirm whether any contact, order, and transaction details should be declared under Purchases or Financial Info and review Square's SDK privacy details.
- **Device and cloud synchronization:** `KennelSyncClient.swift` and `KennelStore.swift` connect to authenticated server endpoints. CloudKit can separately hold personal records according to enabled sync options.
- **Logs and retention:** verify production service logs, diagnostics/IP retention, access logs, deletion handling and third-party infrastructure policies before final declarations.

## Questions before completing App Store Connect
1. Which fields may be uploaded from the native app to the business backend and are accessible to the developer or processors beyond servicing an immediate request?
2. Which collected types are linked to user accounts: Contact Info, User Content, Purchases, Identifiers and any others?
3. What is processed on-device only, in private CloudKit, in Square's SDK, or on owned servers? Do not assume these categories have identical rules.
4. Does any SDK collect diagnostics, device identifiers, location or usage data beyond app functionality? Verify privacy manifests and vendor policies.
5. What are the actual purposes, access controls, retention/deletion and sharing arrangements?
6. Are App Store Connect App Privacy answers and the published privacy policy consistent with verified facts?

## Release guardrail
Do not guess privacy disclosures. The account holder/admin should update App Store Connect from the verified data inventory. Apple permits updating privacy answers without submitting an app update. Continue preserving customer data, URLs, app identifiers and pending review status during the audit.
