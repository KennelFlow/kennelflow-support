import test from 'node:test';
import assert from 'node:assert/strict';
import {currentAppleEntitlement,verifyAppleNotification} from '../billing-apple-webhook.mjs';
const time=Date.now(),original='100000009876543';
const tx={bundleId:'com.kennelflow.app',environment:'Production',
 originalTransactionId:original,transactionId:'100000009876544',
 productId:'com.kennelflow.app.subscription.monthly',expiresDate:time+3600000};
const env={APPLE_APP_ID:'6809212861'};
const notification={notificationType:'DID_RENEW',
 notificationUUID:'abc12345-5678-4000-8000-000000000000',
 signedDate:time,data:{bundleId:'com.kennelflow.app',appAppleId:6809212861,
 environment:'Production',signedTransactionInfo:'signed-transaction-blob'}};
const verifier={verifyAndDecodeNotification:async()=>notification,
 verifyAndDecodeTransaction:async()=>tx,
 verifyAndDecodeRenewalInfo:async()=>({gracePeriodExpiresDate:time+86400000})};
const client={getAllSubscriptionStatuses:async()=>({bundleId:'com.kennelflow.app',
 data:[{lastTransactions:[{originalTransactionId:original,status:1,
 signedTransactionInfo:'current-transaction-signed'}]}]})};
const deps={env,verifier,client,now:time};
test('Apple notifications accept signed current subscription status, never caller flags',async()=>{
 const value=await verifyAppleNotification('signed-notification-long-enough',deps);
 assert.equal(value.providerPurchaseId,original);
 assert.equal(value.plan,'monthly');
 assert.equal(value.state,'active');
 assert(value.validThrough);
 assert.equal(value.eventId,notification.notificationUUID);
});
test('Apple server current status determines expiry, grace and refund',async()=>{
 const expired={...client,getAllSubscriptionStatuses:async()=>({bundleId:'com.kennelflow.app',
  data:[{lastTransactions:[{originalTransactionId:original,status:2,signedTransactionInfo:'signed'}]}]})};
 assert.equal((await verifyAppleNotification('signed-notification-long-enough',{...deps,client:expired})).state,'expired');
 const grace={...client,getAllSubscriptionStatuses:async()=>({bundleId:'com.kennelflow.app',
  data:[{lastTransactions:[{originalTransactionId:original,status:4,
    signedTransactionInfo:'signed',signedRenewalInfo:'signed-renewal'}]}]})};
 const result=await verifyAppleNotification('signed-notification-long-enough',{...deps,client:grace});
 assert.equal(result.state,'grace');
 assert.equal(result.validThrough,new Date(time+86400000).toISOString());
 const refundTx={...tx,revocationDate:time};
 const refunded=await verifyAppleNotification('signed-notification-long-enough',
  {...deps,verifier:{...verifier,
   verifyAndDecodeNotification:async()=>({...notification,notificationType:'REFUND'}),
   verifyAndDecodeTransaction:async()=>refundTx}});
 assert.equal(refunded.state,'refunded');
});
test('Cannot accept unsigned, mismatched bundle or unknown receipt',async()=>{
 await assert.rejects(verifyAppleNotification('signed-notification-long-enough',
  {...deps,verifier:{...verifier,verifyAndDecodeNotification:async()=>{throw Error('signature invalid')}}}),{status:403});
 const badBundleVerifier={...verifier,verifyAndDecodeNotification:async()=>({...notification,
  data:{...notification.data,bundleId:'com.attacker.app'}})};
 await assert.rejects(verifyAppleNotification('signed-notification-long-enough',
  {...deps,verifier:badBundleVerifier}),{status:403});
 const badReceiptVerifier={...verifier,verifyAndDecodeTransaction:async()=>({...tx,productId:'fake'})};
 await assert.rejects(verifyAppleNotification('signed-notification-long-enough',
  {...deps,verifier:badReceiptVerifier}),{status:403});
});
test('TEST and unlinked event types do not create access',async()=>{
 const testVerifier={...verifier,verifyAndDecodeNotification:async()=>({
  notificationType:'TEST',notificationUUID:'abc12345'})};
 const t=await verifyAppleNotification('signed-notification-long-enough',
  {...deps,verifier:testVerifier});
 assert.deepEqual(t,{ignored:true,test:true});
 const withoutTransaction={...verifier,verifyAndDecodeNotification:async()=>({...notification,
  data:{...notification.data,signedTransactionInfo:null}})};
 const noTx=await verifyAppleNotification('signed-notification-long-enough',
  {...deps,verifier:withoutTransaction});
 assert.equal(noTx.ignored,true);
});
test('Current Apple status API outages fail with retryable error',async()=>{
 await assert.rejects(verifyAppleNotification('signed-notification-long-enough',
  {...deps,client:{getAllSubscriptionStatuses:async()=>{throw Error('network')}}}),{status:503});
});
test('Lifetime validation respects Apple revocation and stays distinct from subscriptions',async()=>{
 const lifetime={...tx,productId:'com.kennelflow.app.lifetime',expiresDate:null};
 const lifetimeClient={getTransactionInfo:async()=>({signedTransactionInfo:'valid-current-lifetime'})};
 const result=await verifyAppleNotification('signed-notification-long-enough',
  {...deps,verifier:{...verifier,verifyAndDecodeTransaction:async()=>lifetime},client:lifetimeClient});
 assert.equal(result.state,'active');assert.equal(result.validThrough,null);
 const revoked=await verifyAppleNotification('signed-notification-long-enough',
  {...deps,verifier:{...verifier,verifyAndDecodeTransaction:async()=>({
   ...lifetime,revocationDate:time})},client:lifetimeClient});
 assert.equal(revoked.state,'revoked');
});
test('Status mapper does not grant grace without verified grace expiry',()=>{
 assert.equal(currentAppleEntitlement({...tx,expiresDate:time-1000},4,null,time).state,'expired');
 assert.equal(currentAppleEntitlement({...tx,expiresDate:time-1000},3,null,time).state,'expired');
 assert.equal(currentAppleEntitlement(tx,1,null,time).state,'active');
});

test('Apple webhook route is public for Apple delivery but grants no access itself',async()=>{
 const {createAPI}=await import('../api.mjs');
 const calls=[];
 const repo={reconcileAppleEvent:async value=>{calls.push(value);return {matched:false,changed:false}}};
 const api=createAPI(repo,{verifyAppleWebhook:async(proof,options)=>{
  assert.equal(proof,'stub-signed-apple-notification');
  assert.equal(options.environment,'production');
  return {eventId:'event-id',providerPurchaseId:original,plan:'monthly',
   state:'active',validThrough:new Date(time+86400000).toISOString(),
   verifiedAt:new Date(time).toISOString()};
 }});
 const response=await api.fetch(new Request('https://api.example/v2/billing/webhook/apple',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({signedPayload:'stub-signed-apple-notification'})}));
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,matched:false,changed:false});
 assert.equal(calls.length,1);
});
test('Apple TEST webhook never reaches entitlements and sandbox uses sandbox verifier',async()=>{
 const {createAPI}=await import('../api.mjs');
 const api=createAPI({reconcileAppleEvent:()=>{throw Error('TEST cannot update account')}},{
  verifyAppleWebhook:async(proof,opts)=>{
   assert.equal(opts.environment,'sandbox');
   return {ignored:true,test:true};
  }});
 const response=await api.fetch(new Request('https://api.example/v2/billing/webhook/apple/sandbox',
  {method:'POST',body:JSON.stringify({signedPayload:'signed-test-notification'})}));
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,ignored:true,test:true});
});
