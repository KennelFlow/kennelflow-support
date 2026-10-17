import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAPI } from '../api.mjs';
const owner='00000000-0000-0000-0000-000000000001';
const staff='00000000-0000-0000-0000-000000000002';
const kennel='00000000-0000-0000-0000-000000000003';
const other='00000000-0000-0000-0000-000000000004';
const message='00000000-0000-0000-0000-000000000006';
function mock(role='staff') {
 const state={inbox:[{id:message,body:'Private care update'}],writes:[],roles:[{id:kennel,role}]};
 const repo={
  session:async()=>({id:staff,name:'Staff',email:'staff@example.com'}),
  kennels:async()=>state.roles,
  privateInbox:async()=>state.inbox,
  privateSend:async(_actor,kennelID,id,email,body)=>{state.writes.push({kennelID,id,email,body});return {id,senderID:staff,recipientID:owner}},
 };
 const api=createAPI(repo);
 const call=(url,method='GET',body,authorization=true)=>api.fetch(new Request('https://example.com'+url,{method,headers:{...(authorization?{'authorization':'Bearer '+'a'.repeat(64)}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}));
 return {state,call};
}
const endpoint=`/v2/kennels/${kennel}/private-messages`;
const payload={id:message,recipientEmail:'Owner@Example.com',body:'Please check kennel 5'};
test('session token is mandatory even to read inbox',async()=>{
 assert.equal((await mock().call(endpoint,'GET',undefined,false)).status,401);
});
test('only selected kennel members may read conversation',async()=>{
 const f=mock();assert.equal((await f.call(endpoint.replace(kennel,other))).status,403);
});
test('viewer cannot read or send private employee messages',async()=>{
 const f=mock('viewer');
 assert.equal((await f.call(endpoint)).status,403);
 assert.equal((await f.call(endpoint,'POST',payload)).status,403);
});
test('staff can read only server-verified own inbox',async()=>{
 const f=mock();
 const r=await f.call(endpoint);
 assert.equal(r.status,200);
 assert.deepEqual((await r.json()).messages,f.state.inbox);
});
test('send accepts a valid recipient email, valid UUID, bounded text',async()=>{
 const f=mock();const r=await f.call(endpoint,'POST',payload);
 assert.equal(r.status,201);
 assert.deepEqual(f.state.writes,[{kennelID:kennel,id:message,email:'owner@example.com',body:'Please check kennel 5'}]);
});
test('invalid or missing message identity fails closed',async()=>{
 const f=mock();
 for(const id of ['invalid','',null])assert.equal((await f.call(endpoint,'POST',{...payload,id})).status,400);
 assert.equal(f.state.writes.length,0);
});
test('unsafe recipient address is rejected before database call',async()=>{
 const f=mock();
 for(const recipientEmail of ['not-an-email','a'.repeat(255)+'@site.org','']) {
  assert.equal((await f.call(endpoint,'POST',{...payload,recipientEmail})).status,400);
 }
 assert.equal(f.state.writes.length,0);
});
test('message size and empty body bounded',async()=>{
 const f=mock();
 for(const body of ['', '   ', 'a'.repeat(4001)])assert.equal((await f.call(endpoint,'POST',{...payload,body})).status,400);
 assert.equal(f.state.writes.length,0);
});
test('cross-kennel send forbidden before database call',async()=>{
 const f=mock();
 assert.equal((await f.call(endpoint.replace(kennel,other),'POST',payload)).status,403);
 assert.equal(f.state.writes.length,0);
});
test('repository is the security boundary for membership and idempotency',()=>{
 const sql=readFileSync(new URL('../schema/011_private_messages.sql',import.meta.url),'utf8');
 const repo=readFileSync(new URL('../repository.mjs',import.meta.url),'utf8');
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/sender_id=actor OR p.recipient_id=actor/);
 assert.match(sql,/m\.kennel_id=p_kennel/);
 assert.match(sql,/ON CONFLICT\(id\) DO NOTHING/);
 assert.match(sql,/Message identity conflict/);
 assert.match(sql,/REVOKE ALL ON business_private_messages FROM PUBLIC, kennelflow_api/);
 assert.match(repo,/business_private_inbox/);
 assert.match(repo,/business_private_send/);
});

test('missing database membership is denied, not treated as SQL NULL permission',()=>{
 const sql=readFileSync(new URL('../schema/011_private_messages.sql',import.meta.url),'utf8');
 assert.equal((sql.match(/coalesce\(actor_role,''\) NOT IN/g)||[]).length,2);
});
