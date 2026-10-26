import test from 'node:test';
import assert from 'node:assert/strict';
import {createAPI} from '../api.mjs';

const owner='00000000-0000-0000-0000-000000004001';
const kennel='00000000-0000-0000-0000-000000004002';
const other='00000000-0000-0000-0000-000000004003';
const jwt='a'.repeat(64);
const future=new Date(Date.now()+30*86400000).toISOString();
const verifiedApple={provider:'apple',providerPurchaseId:'1000000423456789',plan:'annual',
  state:'active',validThrough:future};
const verifiedGoogle={provider:'google',providerPurchaseId:'a'.repeat(64),plan:'monthly',
  state:'active',validThrough:future};

function app(role='owner',verificationValid=true){
 let writes=0,appleChecks=0,googleChecks=0,lastPurchase;
 const repo={
  session:async()=>({id:owner,email:'owner@example.invalid',name:'Owner'}),
  kennels:async()=>role?[{id:kennel,role}]:[],
  linkVerifiedPurchase:async(actor,id,purchase)=>{
    writes++;lastPurchase=purchase;
    assert.equal(actor.id,owner);
    assert.equal(id,kennel);
    return {active:true,state:'active',provider:purchase.provider,plan:purchase.plan};
  }
 };
 const api=createAPI(repo,{
  verifyApple:async(proof)=>{
   appleChecks++;assert.equal(proof,'signed-apple-transaction');
   if(!verificationValid)throw Object.assign(Error('revoked'),{status:403});
   return verifiedApple;
  },
  verifyGoogle:async(proof)=>{
   googleChecks++;assert.equal(proof,'google-purchase-token');
   if(!verificationValid)throw Object.assign(Error('expired'),{status:403});
   return verifiedGoogle;
  }
 });
 const request=(payload,authed=true)=>api.fetch(new Request('https://billing.example.invalid/v2/billing/link',{
  method:'POST',headers:{'content-type':'application/json',...(authed?{authorization:'Bearer '+jwt}:{})},
  body:JSON.stringify(payload)
 }));
 return {request,counts:()=>({writes,appleChecks,googleChecks}),last:()=>lastPurchase};
}

test('owner can link an Apple server-verified subscription without a second payment',async()=>{
 const s=app();
 const reply=await s.request({kennel,provider:'apple',proof:'signed-apple-transaction',active:true});
 assert.equal(reply.status,200);
 assert.deepEqual((await reply.json()).status,{active:true,state:'active',provider:'apple',plan:'annual'});
 assert.equal(s.last().providerPurchaseId,verifiedApple.providerPurchaseId);
 assert.deepEqual(s.counts(),{writes:1,appleChecks:1,googleChecks:0});
});
test('owner can link Google verified entitlement for access on Windows',async()=>{
 const s=app();
 const reply=await s.request({kennel,provider:'google',proof:'google-purchase-token'});
 assert.equal(reply.status,200);
 assert.equal((await reply.json()).status.provider,'google');
 assert.deepEqual(s.counts(),{writes:1,appleChecks:0,googleChecks:1});
});
test('staff, anonymous and other-kennel requests cannot even query store verification',async()=>{
 for(const [role,id,authed,expected] of [['staff',kennel,true,403],['owner',other,true,403],['owner',kennel,false,401]]){
  const s=app(role);
  assert.equal((await s.request({kennel:id,provider:'apple',proof:'signed-apple-transaction'},authed)).status,expected);
  assert.deepEqual(s.counts(),{writes:0,appleChecks:0,googleChecks:0});
 }
});
test('unrecognized provider or proof is rejected without changing any entitlement',async()=>{
 for(const payload of [
  {kennel,provider:'windows',proof:'signed-apple-transaction'},
  {kennel,provider:'apple',proof:999},
  {kennel,provider:'apple',proof:'x'.repeat(30001)}
 ]){
  const s=app();
  assert.equal((await s.request(payload)).status,400);
  assert.deepEqual(s.counts(),{writes:0,appleChecks:0,googleChecks:0});
 }
});
test('revoked Apple or expired Google purchase must not unlock a kennel',async()=>{
 for(const provider of ['apple','google']){
  const s=app('owner',false);
  const proof=provider==='apple'?'signed-apple-transaction':'google-purchase-token';
  assert.equal((await s.request({kennel,provider,proof})).status,403);
  assert.equal(s.counts().writes,0);
 }
});
