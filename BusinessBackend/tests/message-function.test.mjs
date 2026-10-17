import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateMessageFunction} from '../message-function.mjs';
const kennel='00000000-0000-0000-0000-000000000003';
function fake() {
 const state={writes:0};
 const api=createPrivateMessageFunction({
  session:async()=>({id:'00000000-0000-0000-0000-000000000002',email:'staff@example.com'}),
  kennels:async()=>[{id:kennel,role:'staff'}],
  privateInbox:async()=>[],
  privateSend:async()=>{state.writes++;return{id:'00000000-0000-0000-0000-000000000007'}}
 });
 const run=(route,method='GET',withAuth=true)=>api.fetch(new Request('https://sidecar.example'+route,{method,headers:withAuth?{'Authorization':'Bearer '+'a'.repeat(64)}:{}}));
 return {run,state};
}
test('read-only health endpoint',async()=>{
 const {run}=fake();
 const r=await run('/health');
 assert.equal(r.status,200);
 assert.equal((await r.json()).ok,true);
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('sidecar blocks all other business operations',async()=>{
 const {run,state}=fake();
 for(const route of ['/v2/signup','/v2/login','/v2/logout','/v2/me','/v2/capabilities','/v2/kennels/'+kennel+'/records','/v2/kennels/'+kennel+'/members']) {
  for(const method of ['GET','POST'])assert.equal((await run(route,method)).status,404);
 }
 assert.equal(state.writes,0);
});
test('private messaging requires the normal authenticated server session',async()=>{
 const {run}=fake();
 assert.equal((await run('/v2/kennels/'+kennel+'/private-messages','GET',false)).status,401);
 assert.equal((await run('/v2/kennels/'+kennel+'/private-messages','GET',true)).status,200);
});
test('non-message methods fail closed',async()=>{
 const {run}=fake();
 const r=await run('/v2/kennels/'+kennel+'/private-messages','DELETE');
 assert.equal(r.status,405);
 assert.equal(r.headers.get('allow'),'GET, POST');
});
