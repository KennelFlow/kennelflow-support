import test from 'node:test';
import assert from 'node:assert/strict';
import {createAPI} from '../api.mjs';
const owner='00000000-0000-0000-0000-000000001111';
const kennel='00000000-0000-0000-0000-000000001112';
const id='00000000-0000-0000-0000-000000001113';
function setup(enforced,active) {
 let reads=0, writes=0, statusReads=0;
 const repo={
  session:async()=>({id:owner,email:'test@example.invalid',name:'Test'}),
  kennels:async()=>[{id:kennel,role:'owner'}],
  billingStatus:async()=>{statusReads++;return {active,state:active?'active':'expired'}},
  records:async()=>{reads++;return []},
  putRecord:async()=>{writes++;return {id}}
 };
 const api=createAPI(repo,{billingEnforced:enforced});
 const call=(path,method='GET',payload)=>api.fetch(new Request('https://example.test'+path,{
  method,headers:{authorization:'Bearer '+'a'.repeat(64),'content-type':'application/json'},
  body:payload?JSON.stringify(payload):undefined
 }));
 return {call,counts:()=>({reads,writes,statusReads})};
}
test('paywall blocks kennel record reads for expired subscribers at the server boundary',async()=>{
 const s=setup(true,false);
 const reply=await s.call('/v2/kennels/'+kennel+'/records');
 assert.equal(reply.status,402);
 assert.equal(s.counts().reads,0);
});
test('paywall allows verified subscribers to read records',async()=>{
 const s=setup(true,true);
 assert.equal((await s.call('/v2/kennels/'+kennel+'/records')).status,200);
 assert.equal(s.counts().reads,1);
});
test('unpaid customer can sign in and view account billing status, not records',async()=>{
 const s=setup(true,false);
 assert.equal((await s.call('/v2/me')).status,200);
 assert.equal((await s.call('/v2/billing/status?kennel='+kennel)).status,200);
 assert.equal(s.counts().reads,0);
});
test('unconfigured paywall does not lock out subscribers during migration',async()=>{
 const s=setup(false,false);
 assert.equal((await s.call('/v2/kennels/'+kennel+'/records')).status,200);
 assert.equal(s.counts().statusReads,0);
});
