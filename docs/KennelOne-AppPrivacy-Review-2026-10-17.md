# Kennel One app privacy disclosure review — 2026-10-17

**Status:** staging evidence and candidate answers; NOT published to the App Store. Owner/legal review required.

## Evidence verified in source
- Native `KennelFlow/KennelSyncClient.swift` sends authenticated business records and binary attachments over HTTPS to the Kennel One sync API; these records are persisted in cloud storage.
- Business backend schemas `BusinessBackend/schema/004_auth.sql` and `001_kennelflow.sql` store user email/account identifiers, memberships, and structured kennel records.
- Employee services in `KennelFlow/ProductionViews.swift` and `MoreView.swift` use CloudKit for employee identity information and employee-to-employee messages.
- Native `PaymentCheckoutView.swift`, Apple StoreKit integration, and Square backend handle transaction workflows; the synchronized payment ledger includes customer references, amounts and transaction/order metadata. No evidence from this review establishes that card numbers are saved in the app database.
- The publicly available App Store page for app ID 6809212861 displayed **Data Not Collected** when checked October 17. Apple's definition of collected data includes information transmitted off-device and retained by the developer or a service provider.

## Candidate App Store privacy data types to review
Data categories are conditional on the shipped functionality and provider behavior; only an authorized App Store Connect user should select final answers after checking production behavior.
1. **Contact Info / Name and Email Address** — business user identity, employee names/emails and customer information.
2. **Other User Content** — business operational notes, dog/kennel data, care records, contracts and documents (and potentially **Photos or Videos** for user-uploaded images).
3. **User ID** — persistent account and team identity identifiers.
4. **Emails or Text Messages** — employee in-app messages, if enabled for the reviewed app version.
5. **Other Financial Info** or **Purchase History** — investigate payment and transaction records linked to a business account and the actual StoreKit/Square integrations before classifying. Payment card details entered only with a payment provider may be exempt under Apple's documentation.
6. **Location** — verify whether employee location data is ever sent off-device; merely having local location notes is not sufficient.
7. **Diagnostics** — verify whether persistent IP addresses, crash/diagnostic logs, or analytics are captured by services; do not infer from infrastructure labels alone.

Likely purpose for verified data: **App Functionality** (sign-in, synchronization, employee collaboration and user-requested records). Many records are linked to the user/business account. Tracking/advertising answers require their own evidence and were not determined by this review.

## Before publication
- Confirm which capabilities exist in the currently **public version 2.7** versus the pending **2.8** build; Apple says to describe the currently available version.
- Verify actual data retention, deletion workflows, legal identity/contact and all third-party processing, including CloudKit public/private schemas and Square.
- Review public CloudKit employee access and messaging controls before labeling them secure or shipping future expansions; use the local security review notes, not this public document, for implementation details.
- Obtain owner approval for policies and the final App Store privacy categories, then update App Store Connect through an authorized app-manager account.
- Do not claim the app collects no information while the developer-accessible cloud records are persisted.

Sources: Apple App Privacy Details (https://developer.apple.com/app-store/app-privacy-details/) and App Store Connect Manage App Privacy (https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy).
