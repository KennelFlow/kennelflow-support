import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAppleTransaction,normalizeGooglePurchase,verifyApplePurchase,verifyGooglePurchase} from '../billing.mjs';
const now=Date.parse('2026-10-25T00:00:00Z');
const future=new Date(now+14*86400000).toISOString(),past=new Date(now-86400000).toISOString();
const googleToken='google-synthetic-token-12345';
const goodApple={originalTransactionId:'1000000012345',transactionId:'1000000012346',
 productId:'com.kennelflow.app.subscription.yearly',bundleId:'com.kennelflow.app',
 expiresDate:now+14*86400000};
test('Google Play active and grace states map to cross-platform entitlements',()=>{
 const receipt={subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',lineItems:[{productId:'kennelone_yearly',expiryTime:future}]};
 const active=normalizeGooglePurchase(receipt,googleToken,now);
 assert.equal(active.plan,'annual');
 assert.equal(active.state,'active');
 assert.equal(active.providerPurchaseId.length,64);
 receipt.subscriptionState='SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
 assert.equal(normalizeGooglePurchase(receipt,googleToken,now).state,'grace');
});
test('Google Play pending, on-hold, paused, expired and unknown products cannot unlock Windows',()=>{
 for(const state of ['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_EXPIRED']){
  assert.throws(()=>normalizeGooglePurchase({subscriptionState:state,lineItems:[{productId:'kennelone_yearly',expiryTime:future}]},googleToken,now));
 }
 assert.throws(()=>normalizeGooglePurchase({subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',lineItems:[{productId:'made_up',expiryTime:future}]},googleToken,now));
 assert.throws(()=>normalizeGooglePurchase({subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',lineItems:[{productId:'kennelone_yearly',expiryTime:past}]},googleToken,now));
});
test('Apple revocation, expired transaction and unrecognized plan cannot unlock Windows',()=>{
 assert.equal(normalizeAppleTransaction(goodApple,1,now).plan,'annual');
 assert.equal(normalizeAppleTransaction({...goodApple,productId:'com.kennelflow.app.lifetime',expiresDate:null},null,now).plan,'lifetime');
 assert.throws(()=>normalizeAppleTransaction({...goodApple,revocationDate:now},1,now));
 assert.throws(()=>normalizeAppleTransaction({...goodApple,expiresDate:now-1},1,now));
 assert.throws(()=>normalizeAppleTransaction(goodApple,3,now)); // billing retry without grace does not grant access
 const grace=normalizeAppleTransaction({...goodApple,expiresDate:now-1000},4,now,now+86400000);
 assert.equal(grace.state,'grace');
 assert.throws(()=>normalizeAppleTransaction({...goodApple,expiresDate:now-1000},4,now,null));
 assert.throws(()=>normalizeAppleTransaction({...goodApple,productId:'fake_product'},1,now));
});
test('Apple signing and server lookup both required before entitlement linking',async()=>{
 const calls=[];
 const verifier={verifyAndDecodeTransaction:async jws=>{calls.push('verify:'+jws);return goodApple}};
 const client={getAllSubscriptionStatuses:async id=>{calls.push('server:'+id);return {
  bundleId:'com.kennelflow.app',
  data:[{lastTransactions:[{originalTransactionId:goodApple.originalTransactionId,status:1,signedTransactionInfo:'latest_signed_transaction'}]}]
 }}};
 const purchase=await verifyApplePurchase('stub-signed-transaction-representing-JWS',{}, {verifier,client});
 assert.equal(purchase.plan,'annual');
 assert.equal(calls[0].startsWith('verify:'),true);
 assert(calls.includes('server:1000000012345'));
});
test('Apple server declines status with no matching original transaction',async()=>{
 const verifier={verifyAndDecodeTransaction:async()=>goodApple};
 const client={getAllSubscriptionStatuses:async()=>({bundleId:'com.kennelflow.app',data:[{lastTransactions:[]}]})};
 await assert.rejects(verifyApplePurchase('stub-signed-transaction-representing-JWS',{}, {verifier,client}),{status:403});
});
test('Google purchase verification obtains state from store API rather than caller',async()=>{
 const calls=[];
 const receipt={subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',lineItems:[{productId:'kennelone_monthly',expiryTime:new Date(Date.now()+86400000).toISOString()}]};
 const record=await verifyGooglePurchase(googleToken,{}, {fetcher:async url=>{calls.push(url);return receipt}});
 assert.equal(record.plan,'monthly');
 assert(calls[0].startsWith('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/app.kennelone/'));
 await assert.rejects(verifyGooglePurchase(googleToken,{}, {fetcher:async()=>({subscriptionState:'SUBSCRIPTION_STATE_ON_HOLD',lineItems:receipt.lineItems})}),{status:403});
});
test('unconfigured store verifier fails closed',async()=>{
 await assert.rejects(verifyApplePurchase('stub-signed-transaction-representing-JWS',{},{}),{status:503});
 await assert.rejects(verifyGooglePurchase(googleToken,{},{}),{status:503});
});
