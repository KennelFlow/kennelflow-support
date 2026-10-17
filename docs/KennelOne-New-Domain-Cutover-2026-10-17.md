# Kennel One official domain cutover plan

Owner designated **kennelone.app** as the canonical Kennel One domain on 2026-10-17.

## Verified (2026-10-17)
- Registered: `kennelone.app`, Google Registry RDAP, created 2026-10-17, expiry 2027-10-17.
- Registrar DNS: `dns1.registrar-servers.com` and `dns2.registrar-servers.com` (Namecheap).
- Root A currently `192.64.119.20` and `www` points to `parkingpage.namecheap.com`, so public site is not configured.
- MX already points to Namecheap email forwarding records; preserve all MX, TXT (SPF/verification), and other unrelated records.
- Working previous marketing domain `kennelflowpro.app` is hosted via GitHub Pages and `app.kennelflowpro.app` points to `kennelflow-web.onrender.com`.

## Target
- `https://kennelone.app` and `https://www.kennelone.app`: marketing/support site with approved final legal policies, fresh logo, screenshots, pricing, and links to the existing App Store product.
- `https://app.kennelone.app`: authenticated customer management portal using the existing working Render web service; keep `app.kennelflowpro.app` working until verification is complete.
- Preserve production APIs, payments, Square URLs/webhooks, existing customer logins, CloudKit identifiers, Apple bundle ID, subscriptions, and existing sync URL. A brand-domain change does not require data migration.

## Safe sequence
1. Prepare a **separate** website publishing target (e.g. a new GitHub Pages site/repository or another approved host) for `kennelone.app`. Do **not** replace the old GitHub Pages custom domain in-place, because that would interrupt `kennelflowpro.app`.
2. Obtain final business approval of privacy/terms/shipping/returns policies before launching the website rebrand. Never deploy staging disclaimers as final legal text.
3. Add `app.kennelone.app` to existing Render service's Custom Domains and obtain the provider-specified DNS target and verification records. Namecheap `app` CNAME will usually point to `kennelflow-web.onrender.com` but use Render's actual prompt if different.
4. In Namecheap Advanced DNS, point the apex and www to the **new** website host following that host's exact instructions. Do not change NS/MX/TXT and do not delete unrelated records.
5. Verify apex/www and app HTTPS, certificate issuance, redirect behavior, login, API sessions, and two-way editing with separate authenticated test records. Only then expose the new domain publicly and update store/marketing destinations.
6. Optionally set the previous public site to redirect to `kennelone.app` **only after** the new one works. Keep its API/login functionality until compatibility and redirects have been confirmed.

## Blocked / no changes made
The available connected tools do not expose a Namecheap DNS-write action nor a Render add-custom-domain action. The registrar account/Render UI must be accessed via an authorized browser session or matching connector before the live DNS cutover. No DNS edits or mail forwarding changes have been performed.
