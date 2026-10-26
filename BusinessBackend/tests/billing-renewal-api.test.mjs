import test from 'node:test';
import assert from 'node:assert/strict';
import {createAPI} from '../api.mjs';

const uid='00000000-0000-0000-0000-000000002001';
const kennel='00000000-0000-0000-0000-000000002002';
const token='a'.repeat(64);
const purchaseId='sqsub:original-subscription-001';
const checkout={orderId:'TEST-ORDER-2001',plan:'monthly',providerPurchaseId:purchaseId};
const renewed={provider:'windows',providerPurchaseId:purchaseId,plan:'monthly',
 state:'active',validThrough:'2027-12-31T23:59:59.000Z'};
const request=scope=>new Request('https://kennelflow.test/v2/billing/refresh',{
 method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
 body:JSON.stringify({kennel:scope})
});

function setup({role='owner',linked=true,mismatch=false}={}) {
 const calls=[];
 const repo={
  session:async()=>({id:uid,email:'owner@example.invalid',name:'Owner'}),
  kennels:async()=>[{id:kennel,role}],
  windowsSubscriptionForRefresh:async()=>{calls.push('lookup');return linked?checkout:null},
  refreshWindowsSubscription:async(actor,scope,purchase)=>{
   calls.push('settle');
   assert.equal(actor.id,uid);assert.equal(scope,kennel);
   assert.equal(purchase.providerPurchaseId,purchaseId);
   return {active:true,plan:'monthly',provider:'windows',validThrough:renewed.validThrough};
  }
 };
 const api=createAPI(repo,{verifyWindowsRenewal:async value=>{
  calls.push('square');
  assert.equal(value.orderId,checkout.orderId);
  return mismatch?{...renewed,providerPurchaseId:'sqsub:wrong'}:renewed;
 }});
 return {fetch:scope=>api.fetch(request(scope)),calls};
}
test('owner can verify a bound recurring Square purchase and extend subscribed access',async()=>{
 const {fetch,calls}=setup();
 const result=await fetch(kennel);
 assert.equal(result.status,200);
 assert.equal((await result.json()).status.active,true);
 assert.deepEqual(calls,['lookup','square','settle']);
});
test('staff cannot trigger a subscription refresh or Square request',async()=>{
 const {fetch,calls}=setup({role:'staff'});
 assert.equal((await fetch(kennel)).status,403);
 assert.deepEqual(calls,[]);
});
test('foreign kennel cannot refresh another owner subscription',async()=>{
 const {fetch,calls}=setup();
 assert.equal((await fetch('00000000-0000-0000-0000-000000002003')).status,403);
 assert.deepEqual(calls,[]);
});
test('subscription without an original verified checkout cannot refresh',async()=>{
 const {fetch,calls}=setup({linked:false});
 assert.equal((await fetch(kennel)).status,409);
 assert.deepEqual(calls,['lookup']);
});
test('Square changing subscription purchase identity never updates entitlement',async()=>{
 const {fetch,calls}=setup({mismatch:true});
 assert.equal((await fetch(kennel)).status,403);
 assert.deepEqual(calls,['lookup','square']);
});
