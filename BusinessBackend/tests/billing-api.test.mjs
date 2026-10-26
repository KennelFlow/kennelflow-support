import test from 'node:test';
import assert from 'node:assert/strict';
import {createAPI} from '../api.mjs';
const user='00000000-0000-0000-0000-000000000901';
const kennel='00000000-0000-0000-0000-000000000902';
const other='00000000-0000-0000-0000-000000000903';
const token='f'.repeat(64);
function setup(access='owner'){
 let calls=0;
 const repo={
  session:async()=>({id:user,email:'billing@example.invalid',name:'Owner'}),
  kennels:async()=>access?[{id:kennel,role:access}]:[],
  billingStatus:async(actor,k)=>{calls++;assert.equal(actor.id,user);assert.equal(k,kennel);return {active:true,state:'active',plan:'annual',provider:'apple'}}
 };
 const api=createAPI(repo);
 const run=(path,auth=true)=>api.fetch(new Request('https://example.test'+path,{headers:auth?{Authorization:'Bearer '+token}:{}}));
 return {run,calls:()=>calls};
}
test('authenticated business member sees account subscription, not payment credentials',async()=>{
 const a=setup();
 const r=await a.run('/v2/billing/status?kennel='+kennel);
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{status:{active:true,state:'active',plan:'annual',provider:'apple'}});
 assert.equal(a.calls(),1);
});
test('billing requires live session and valid tenant',async()=>{
 const a=setup();
 assert.equal((await a.run('/v2/billing/status?kennel='+kennel,false)).status,401);
 assert.equal((await a.run('/v2/billing/status?kennel=bad')).status,400);
 assert.equal((await a.run('/v2/billing/status?kennel='+other)).status,403);
 assert.equal(a.calls(),0);
});
test('no client endpoint can grant a paid entitlement',async()=>{
 const a=setup();
 const r=await a.run('/v2/billing/activate');
 assert.equal(r.status,404);
});
