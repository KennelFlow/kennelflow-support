import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {verifyPendingWindowsCheckout,verifyWindowsSubscriptionRenewal} from '../billing-square-verify.mjs';

// Local end-to-end trust-boundary test. No production or sandbox requests.
// Faked Square HTTP responses are never treated as evidence of a real purchase.
const uuid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const owner=uuid(1201), employee=uuid(1202), outsider=uuid(1203), kennel=uuid(1204);
const orderId='TEST-ORDER-1201', paymentId='TEST-PAYMENT-1201', subscriptionId='TEST-SUBSCRIPTION-1201';
const customerId='TEST-CUSTOMER-1201';
const environment={
 SQUARE_ENVIRONMENT:'sandbox', SQUARE_ACCESS_TOKEN:'not-a-real-token',
 SQUARE_LOCATION_ID:'TEST-LOCATION',
 KO_SQUARE_MONTHLY_VARIATION_ID:'TEST-MONTHLY-VARIATION'
};
const when=new Date(Date.now()-60000).toISOString();
const paidThrough=new Date(Date.now()+35*86400000).toISOString().slice(0,10);
const checkout={plan:'monthly',orderId,createdAt:when};
const payment={id:paymentId,status:'COMPLETED',order_id:orderId,location_id:environment.SQUARE_LOCATION_ID,
 amount_money:{amount:1099,currency:'USD'},customer_id:customerId};
const order={id:orderId,location_id:environment.SQUARE_LOCATION_ID,
 total_money:{amount:1099,currency:'USD'},tenders:[{payment_id:paymentId}]};
const subscription={id:subscriptionId,customer_id:customerId,location_id:environment.SQUARE_LOCATION_ID,
 plan_variation_id:environment.KO_SQUARE_MONTHLY_VARIATION_ID,status:'ACTIVE',
 paid_until_date:paidThrough,created_at:new Date(Date.now()-30000).toISOString()};
function mockedSquare({pay=payment,ord=order,subs=[subscription]}={}){
 return async (url)=>{
  if(url.endsWith('/v2/orders/'+orderId))return Response.json({order:ord});
  if(url.endsWith('/v2/payments/'+paymentId))return Response.json({payment:pay});
  if(url.endsWith('/v2/subscriptions/search'))return Response.json({subscriptions:subs});
  if(url.includes('/v2/subscriptions/'))return Response.json({subscription:subs[0]});
  throw Error('Unexpected request to '+url);
 };
}
async function migrations(db){
 await db.exec('CREATE ROLE kennelflow_api NOSUPERUSER NOBYPASSRLS');
 for(const filename of ['001_kennelflow.sql','002_revision_sync.sql','003_security_hardening.sql',
  '004_auth.sql','005_access_control.sql','006_password_reset.sql','007_business.sql',
  '008_files.sql','009_employees.sql','010_business_profile.sql','011_private_messages.sql',
  '012_unified_billing.sql','013_windows_checkout.sql','014_windows_settlement.sql','015_windows_renewal.sql','016_square_webhooks.sql'])
  await db.exec(await readFile(new URL('../schema/'+filename,import.meta.url),'utf8'));
}
async function as(db,actor,sql,params=[]){
 await db.exec('SET ROLE kennelflow_api');
 try{
  await db.query("SELECT set_config('request.user_id',$1,false)",[actor]);
  return await db.query(sql,params);
 }finally{
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.user_id','',false)");
 }
}
test('complete verified monthly checkout unlocks only its kennel and resists duplicate settlement',async()=>{
 const db=await PGlite.create();
 try{
  await migrations(db);
  await db.query('INSERT INTO kennels(id,name) VALUES($1,$2)',[kennel,'Windows Test Kennel']);
  for(const [user,role] of [[owner,'owner'],[employee,'staff'],[outsider,null]]){
   await db.query('INSERT INTO app_users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)',
    [user,user+'@example.invalid','test-only-hash','Test']);
   if(role)await db.query('INSERT INTO kennel_memberships(kennel_id,user_id,role) VALUES($1,$2,$3)',
    [kennel,user,role]);
  }
  const before=await as(db,owner,'SELECT business_billing_status($1) AS status',[kennel]);
  assert.equal(before.rows[0].status.active,false);
  await as(db,owner,'SELECT business_save_windows_checkout($1,$2,$3,$4,$5,$6)',
   [kennel,'monthly',randomUUID(),'test-link-1201',orderId,'https://square.link/u/FakeTest']);
  const proof=await verifyPendingWindowsCheckout(checkout,environment,mockedSquare());
  assert.equal(proof.providerPurchaseId,'sqsub:'+subscriptionId);
  assert.equal(proof.state,'active');
  const statement='SELECT business_settle_windows_checkout($1,$2,$3,$4,$5,$6,$7) AS status';
  const params=[kennel,orderId,proof.providerPurchaseId,proof.plan,proof.state,proof.validThrough,new Date().toISOString()];
  const settled=await as(db,owner,statement,params);
  assert.equal(settled.rows[0].status.active,true);
  assert.equal(settled.rows[0].status.provider,'windows');
  const staff=await as(db,employee,'SELECT business_billing_status($1) AS status',[kennel]);
  assert.equal(staff.rows[0].status.active,true);
  await assert.rejects(as(db,outsider,'SELECT business_billing_status($1)',[kennel]),{code:'42501'});
  const repeated=await as(db,owner,statement,params);
  assert.equal(repeated.rows[0].status.active,true);
  const count=await db.query('SELECT count(*)::int AS n FROM kennelone_purchase_entitlements');
  assert.equal(count.rows[0].n,1);
  const state=await db.query('SELECT state FROM kennelone_windows_checkout_links WHERE square_order_id=$1',[orderId]);
  assert.equal(state.rows[0].state,'paid');
  const stored=await as(db,owner,
   'SELECT business_windows_subscription_for_refresh($1) AS checkout',[kennel]);
  assert.equal(stored.rows[0].checkout.providerPurchaseId,'sqsub:'+subscriptionId);
  await assert.rejects(as(db,employee,
   'SELECT business_windows_subscription_for_refresh($1)',[kennel]),{code:'42501'});
  const renewedPaidThrough=new Date(Date.now()+67*86400000).toISOString().slice(0,10);
  const remote=await verifyWindowsSubscriptionRenewal(stored.rows[0].checkout,environment,
   mockedSquare({subs:[{...subscription,paid_until_date:renewedPaidThrough}]}));
  assert.equal(remote.providerPurchaseId,proof.providerPurchaseId);
  const refresh='SELECT business_refresh_windows_subscription($1,$2,$3,$4) AS status';
  const refreshArgs=[kennel,remote.providerPurchaseId,remote.validThrough,new Date().toISOString()];
  await assert.rejects(as(db,employee,refresh,refreshArgs),{code:'42501'});
  const refreshed=await as(db,owner,refresh,refreshArgs);
  assert.equal(refreshed.rows[0].status.active,true);
  assert.equal(Date.parse(refreshed.rows[0].status.validThrough),Date.parse(remote.validThrough));
  await assert.rejects(as(db,owner,refresh,[kennel,'sqsub:another',remote.validThrough,new Date().toISOString()]),{code:'42501'});
  await assert.rejects(as(db,owner,refresh,[kennel,proof.providerPurchaseId,proof.validThrough,new Date().toISOString()]),{code:'42501'});
  await assert.rejects(as(db,owner,statement,[kennel,orderId,'sqsub:another','monthly','active',
   proof.validThrough,new Date().toISOString()]),{code:'42501'});
  const stillOne=await db.query('SELECT count(*)::int AS n FROM kennelone_purchase_entitlements');
  assert.equal(stillOne.rows[0].n,1);
 }finally{await db.close()}
});
test('wrong payer, wrong order, uncertain subscription or missing tender cannot activate a checkout',async()=>{
 const variants=[
  {pay:{...payment,customer_id:'ANOTHER-CUSTOMER'}},
  {ord:{...order,tenders:[]}},
  {subs:[]},
  {subs:[{...subscription,status:'CANCELED'}]},
  {subs:[subscription,{...subscription,id:'TEST-SUBSCRIPTION-OTHER'}]},
  {pay:{...payment,amount_money:{amount:9999,currency:'USD'}}},
  {pay:{...payment,refunded_money:{amount:1099,currency:'USD'}}}
 ];
 for(const variant of variants)
  await assert.rejects(verifyPendingWindowsCheckout(checkout,environment,mockedSquare(variant)),
   error=>error.status===403||error.status===409);
});


test('subscription renewal is refused if Square cannot prove current payment status',async()=>{
 const prior={orderId,plan:'monthly',providerPurchaseId:'sqsub:'+subscriptionId};
 await assert.rejects(
  verifyWindowsSubscriptionRenewal({...prior,providerPurchaseId:'sqsub:other'},environment,mockedSquare()),
  {status:403});
 await assert.rejects(
  verifyWindowsSubscriptionRenewal(prior,environment,
   mockedSquare({subs:[{...subscription,paid_until_date:'2020-01-01'}]})),
  {status:403});
 await assert.rejects(
  verifyWindowsSubscriptionRenewal(prior,environment,
   mockedSquare({pay:{...payment,refunded_money:{amount:1099,currency:'USD'}}})),
  {status:403});
});
