# Kennel One public website

Live site: https://kennelone.app
Business portal: https://app.kennelone.app
Store: https://kennelone.app/shop.html
Support: https://kennelone.app/support.html

This is the public-facing static website hosted on Cloudflare Pages.
The store checkout page uses a same-origin Cloudflare Pages Function;
it continues to call the existing Square production service until the
Cloudflare payment, settlement and notification migration is fully tested.

Changes to payments, accounts and data synchronization require their own
isolated staging checks. Do not remove existing production backend services
until Square webhooks, completed ledger entries, receipts, mobile apps and
customer sign-in have been verified end to end.
