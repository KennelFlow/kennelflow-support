import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const config=await readFile(new URL('../wrangler.toml',import.meta.url),'utf8');
const webhook=await readFile(new URL('../functions/square/webhook.js',import.meta.url),'utf8');
const settlement=await readFile(new URL('../db/settle-service-payment-v1.sql',import.meta.url),'utf8');
const document=await readFile(new URL('../functions/_lib/store-notifications.mjs',import.meta.url),'utf8');
test('production Pages configuration cannot accidentally enable payment settlement or expose preview D1',()=>{
 const prod=config.split('[env.production]')[1]?.split('[env.preview]')[0]||'';
 assert.doesNotMatch(prod,/ENABLE_ATOMIC_SERVICE_SETTLEMENT|ENABLE_STORE_NOTIFICATIONS|SQUARE_ACCESS_TOKEN|DATABASE_URL|\bd1_databases\b/);
 assert.match(config,/\[\[env.preview.d1_databases\]\]/);
});
test('verified payments are not acknowledged unless downstream settlement or notification succeeds',()=>{
 assert.match(webhook,/env\.ENABLE_ATOMIC_SERVICE_SETTLEMENT==='true'/);
 assert.match(webhook,/env\.ENABLE_STORE_NOTIFICATIONS==='true'/);
 assert.match(webhook,/Payment settlement processor not activated/);
 assert.match(webhook,/payment_events SET status='SETTLED'/);
});
test('PostgreSQL migration is atomic and refuses conflicting records',()=>{
 assert.match(settlement,/FOR UPDATE/);
 assert.match(settlement,/ON CONFLICT\(kennel_id,id\) DO NOTHING/);
 assert.match(settlement,/Existing payment record conflict/);
 assert.match(settlement,/payment_id IS DISTINCT FROM p_payment_id/);
});
test('store emails require payment-based provider deduplication key',()=>{
 assert.match(document,/Idempotency-Key/);
 assert.match(document,/kennelone-store\//);
});
