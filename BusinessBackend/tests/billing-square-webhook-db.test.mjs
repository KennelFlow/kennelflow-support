import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const uuid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const kennel=uuid(4101),owner=uuid(4102),outsider=uuid(4103);
const purchase='sqsub:SQUARE-PAID-SUB-1',orderId='SQUARE-ORDER-1';
const dt=days=>new Date(Date.now()+days*86400000).toISOString();
async function localDB(){
 const db=await PGlite.create();
 await db.exec('CREATE ROLE kennelflow_api NOSUPERUSER NOBYPASSRLS');
 const names=['001_kennelflow.sql','002_revision_sync.sql','003_security_hardening.sql','004_auth.sql',
  '005_access_control.sql','006_password_reset.sql','007_business.sql','008_files.sql',
  '009_employees.sql','010_business_profile.sql','011_private_messages.sql','012_unified_billing.sql',
  '013_windows_checkout.sql','014_windows_settlement.sql','015_windows_renewal.sql','016_square_webhooks.sql'];
 for(const filename of names)
  await db.exec(await readFile(new URL('../schema/'+filename,import.meta.url),'utf8'));
 await db.query('INSERT INTO kennels(id,name) VALUES($1,$2)',[kennel,'Square Webhook Test']);
 for(const [id,role] of [[owner,'owner'],[outsider,null]]){
  await db.query('INSERT INTO app_users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)',
   [id,id+'@example.invalid','test-hash','Test']);
  if(role)await db.query('INSERT INTO kennel_memberships(kennel_id,user_id,role) VALUES($1,$2,$3)',
   [kennel,id,role]);
 }
 return db;
}
async function as(db,actor,sql,args=[]){
 await db.exec('SET ROLE kennelflow_api');
 try{
  await db.query("SELECT set_config('request.user_id',$1,false)",[actor]);
  return await db.query(sql,args);
 }finally{
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.user_id','',false)");
 }
}
async function trusted(db,eventId,state,until,purchaseId=purchase){
 // The actual HTTP layer must first check the Square HMAC and re-read
 // the subscription via Square's API. This test exercises only DB effects.
 const r=await db.query('SELECT business_reconcile_square_subscription_event($1,$2,$3,$4,$5,$6) AS result',
  [eventId,purchaseId,'monthly',state,until,new Date().toISOString()]);
 return r.rows[0].result;
}
test('Square renewal, end-of-term cancellation, replay, unknown event and resume are tenant-bound',async()=>{
 const db=await localDB();
 try{
  const before=await trusted(db,'EVT-UNKNOWN','active',dt(30),'sqsub:NOT-MATCHED');
  assert.equal(before.matched,false);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM kennelone_purchase_entitlements')).rows[0].n,0);
  await as(db,owner,'SELECT business_save_windows_checkout($1,$2,$3,$4,$5,$6)',
   [kennel,'monthly',randomUUID(),'SQUARE-LINK-1',orderId,'https://square.link/u/TestOnly']);
  const initial=await as(db,owner,
   'SELECT business_settle_windows_checkout($1,$2,$3,$4,$5,$6,$7)',
   [kennel,orderId,purchase,'monthly','active',dt(30),new Date().toISOString()]);
  assert(initial.rows.length);
  const next=await trusted(db,'EVT-RENEWAL-1','active',dt(65));
  assert.equal(next.changed,true);
  const duplicate=await trusted(db,'EVT-RENEWAL-1','active',dt(85));
  assert.equal(duplicate.duplicate,true);
  const status=await as(db,owner,'SELECT business_billing_status($1) AS status',[kennel]);
  assert.equal(status.rows[0].status.active,true);
  assert(Math.abs(Date.parse(status.rows[0].status.validThrough)-Date.parse(dt(65)))<1000);
  const cancel=await trusted(db,'EVT-CANCEL-1','grace',dt(30));
  assert.equal(cancel.state,'grace');
  const during=await as(db,owner,'SELECT business_billing_status($1) AS status',[kennel]);
  assert.equal(during.rows[0].status.active,true);
  assert.equal(during.rows[0].status.state,'grace');
  const expired=await trusted(db,'EVT-CANCEL-2','expired',dt(-1));
  assert.equal(expired.state,'expired');
  const after=await as(db,owner,'SELECT business_billing_status($1) AS status',[kennel]);
  assert.equal(after.rows[0].status.active,false);
  const restored=await trusted(db,'EVT-RESUME-1','active',dt(70));
  assert.equal(restored.state,'active');
  const active=await as(db,owner,'SELECT business_billing_status($1) AS status',[kennel]);
  assert.equal(active.rows[0].status.active,true);
  await assert.rejects(as(db,outsider,'SELECT business_billing_status($1)',[kennel]),{code:'42501'});
  assert.equal((await db.query('SELECT count(*)::int AS n FROM kennelone_purchase_entitlements')).rows[0].n,1);
 }finally{await db.close()}
});


test('Square paid refund revokes matching entitlement, duplicates do not replay, and later subscription event cannot restore it',async()=>{
 const db=await localDB();
 try{
  await as(db,owner,'SELECT business_save_windows_checkout($1,$2,$3,$4,$5,$6)',
   [kennel,'monthly',randomUUID(),'SQUARE-LINK-REFUND',orderId,'https://square.link/u/TestRefund']);
  await as(db,owner,'SELECT business_settle_windows_checkout($1,$2,$3,$4,$5,$6,$7)',
   [kennel,orderId,purchase,'monthly','active',dt(30),new Date().toISOString()]);
  const refund=await db.query('SELECT business_reconcile_square_refund_event($1,$2,$3,$4) AS status',
   ['EVT-REFUND-1',orderId,'ORIGINAL-PAYMENT',new Date().toISOString()]);
  assert.equal(refund.rows[0].status.changed,true);
  const repeated=await db.query('SELECT business_reconcile_square_refund_event($1,$2,$3,$4) AS status',
   ['EVT-REFUND-1',orderId,'ORIGINAL-PAYMENT',new Date().toISOString()]);
  assert.equal(repeated.rows[0].status.duplicate,true);
  const status=await as(db,owner,'SELECT business_billing_status($1) AS status',[kennel]);
  assert.equal(status.rows[0].status.active,false);
  const after=await trusted(db,'EVT-STALE-SUB','active',dt(60));
  assert.equal(after.refunded,true);
  const stillUnpaid=await as(db,owner,'SELECT business_billing_status($1) AS status',[kennel]);
  assert.equal(stillUnpaid.rows[0].status.active,false);
  const unknown=await db.query('SELECT business_reconcile_square_refund_event($1,$2,$3,$4) AS status',
   ['EVT-OTHER-REFUND','OTHER-ORDER','OTHER-PAYMENT',new Date().toISOString()]);
  assert.equal(unknown.rows[0].status.matched,false);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM kennelone_purchase_entitlements')).rows[0].n,1);
 }finally{await db.close()}
});
