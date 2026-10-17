# Kennel One — new-domain launch checklist (October 17, 2026)

The owner confirmed **kennelone.app** is the primary future domain. Existing domains must remain reachable and the current payment/login environment must remain unchanged during the move.

## Independent website host — created

- Render service: `kennelone-public`, ID `srv-db9qbgrrjlhs73fphckg`.
- Preview: https://kennelone-public.onrender.com/index.html
- Repository branch: `kennel-one-rebrand-preparation`.
- Publish path: `deploy/kennelone-public`.
- Render deployment on October 17: successful. Web assets and /index.html returned HTTP 200. Root "/" briefly returned a cached 404, so confirm a clean 200 before configuring DNS.
- This is a **prelaunch site** with noindex and no payments of its own. Keep it separate from `kennelflowpro.app` and its public GitHub Pages configuration.

## Domain activation — not yet executed

1. Open the Render service Settings → Custom Domains. Add `kennelone.app`; Render normally also creates `www.kennelone.app`. Confirm final required DNS records and certificate/ownership verification prompts.
2. In Namecheap → Domain List → `kennelone.app` → Manage → Advanced DNS, replace only the domain's existing parking records with the matching Render records. The current Namecheap DNS is `@ A 192.64.119.20`, and `www CNAME parkingpage.namecheap.com`.
3. Per Render's current official Namecheap guide, typical records are:

| Type | Host | Value | TTL |
| ---- | ---- | ----- | --- |
| A | @ | 216.24.57.1 | Automatic or 1 min |
| CNAME | www | kennelone-public.onrender.com | Automatic or 1 min |

Do **not** add either DNS record until the domain has been attached to the Render service and the Render Dashboard agrees with the values. Remove old parking records for the same hosts and any conflicting AAAA records; do not disturb MX, TXT, SPF, DKIM, DMARC, existing customer URLs, or service records.
4. Verify DNS resolves to the expected target; verify both https://kennelone.app and https://www.kennelone.app present valid SSL certificates and show the correct content without errors.
5. Decide on canonical host and redirect; update internal marketing links only after the new site is live.
6. Finalize approved privacy/terms/purchase policies and verify App Store disclosures. Remove `noindex` only at public launch.
7. Optionally add `app.kennelone.app` as a separate Render custom domain for `kennelflow-web`, but only after authentication and cookie/session tests; do not move existing `app.kennelflowpro.app` or payment webhooks now.

## References

- https://render.com/docs/configure-namecheap-dns
- https://render.com/docs/custom-domains
- Existing GitHub Pages site: https://kennelflowpro.app
- Existing business app: https://app.kennelflowpro.app

## Activation completed — 2026-10-17 afternoon

- Added `kennelone.app` to the **separate** Render `kennelone-public` service. Render also added `www.kennelone.app` with a redirect to the apex domain.
- Updated Namecheap Advanced DNS for **this domain only**: `@ A 216.24.57.1` and `www CNAME kennelone-public.onrender.com`. Removed the old `@` parking URL redirect by changing its record type; updated the existing `www` CNAME target. Preserved the email-forwarding SPF TXT record.
- Render shows both domains **Verified**, with **Certificate Issued** for both.
- Authoritative Namecheap DNS resolves `@` and `www` correctly; Cloudflare DNS and Google DNS resolved the apex A record as `216.24.57.1`.
- HTTPS checks using the authoritative destination IP confirmed `https://kennelone.app` returns 200 with valid SSL and `https://www.kennelone.app` redirects 301 to the canonical apex domain with valid SSL.
- Old marketing site and customer cloud portal remained operational: HTTPS 200 at `https://kennelflowpro.app` and `https://app.kennelflowpro.app/health`.
- Local DNS cache on the connected Mac still returned the old Namecheap parking IP immediately after the update. Some viewers might temporarily see stale data; do not change working records in response to short-lived DNS caching.

### Remaining post-domain work

- Privacy and purchase policies must receive final business/legal approval. Prelaunch marketing website intentionally remains `noindex,nofollow` until launch signoff.
- The new marketing site links to the currently working portal and published legal pages. Moving `app.kennelflowpro.app` to a new branded hostname is a separate authenticated-cookie/security migration and was intentionally not performed.
- App Store public listing still displayed KennelFlow 2.7 at latest check; Build 130 upload was accepted but public review/availability is not verified from the Apple account.
