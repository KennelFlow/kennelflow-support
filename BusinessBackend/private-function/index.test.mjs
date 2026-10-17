import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from './index.mjs';

const kennel='11111111-1111-4111-8111-111111111111';
const msg='22222222-2222-4222-8222-222222222222';
const user='33333333-3333-4333-8333-333333333333';
const url='https://example.invalid/v2/kennels/'+kennel+'/private-messages';

function stub({session=true,role='staff',result=[]}={}){
 const calls=[];
 const client={
  async query(statement,vars=[]){
   calls.push([statement,vars]);
   if(statement.startsWith('SELECT s.user_id'))return {rows:session?[{user_id:user}]:[]};
   if(statement.startsWith('SELECT role FROM kennel_memberships'))return {rows:role?[{role}]:[]};
   if(statement.startsWith('SELECT business_private_inbox'))return {rows:[{result}]};
   if(statement.startsWith('SELECT business_private_send'))return {rows:[{result:{id:msg}}]};
   return {rows:[]};
  },
  release(){}
 };
 return {calls,handler:createHandler({connect:async()=>client})};
}
function makeReq(method='GET',payload,authenticated=true){
 return new Request(url,{
  method,
  headers:{...(authenticated?{Authorization:'Bearer '+'b'.repeat(64)}:{}),'content-type':'application/json'},
  body:payload==null?undefined:JSON.stringify(payload)
 });
}
const valid={id:msg,recipientEmail:'staff@example.com',body:'Please feed kennel 2'};
test('only health is public',async()=>{
 const s=stub();
 assert.equal((await s.handler.fetch(new Request('https://example.invalid/health'))).status,200);
 assert.equal((await s.handler.fetch(makeReq('GET',null,false))).status,401);
 assert.equal(s.calls.length,0);
});
test('malformed paths and method cannot reach DB',async()=>{
 const s=stub();
 const r=await s.handler.fetch(new Request('https://example.invalid/v2/kennels/not-a-uuid/private-messages',{headers:{Authorization:'Bearer '+'b'.repeat(64)}}));
 assert.equal(r.status,404);
 assert.equal(s.calls.length,0);
});
test('invalid message body fails without DB activity',async()=>{
 const s=stub();
 for(const input of [{...valid,body:''},{...valid,body:'x'.repeat(4001)},{...valid,recipientEmail:'bad'},{...valid,id:'bad'}]){
  assert.equal((await s.handler.fetch(makeReq('POST',input))).status,400);
 }
 assert.equal(s.calls.length,0);
});
test('invalid or expired bearer token is denied',async()=>{
 const s=stub({session:false});
 assert.equal((await s.handler.fetch(makeReq())).status,401);
 assert.ok(s.calls.some(x=>x[0]==='ROLLBACK'));
 assert.ok(!s.calls.some(x=>x[0].includes('business_private_inbox')));
});
test('viewer or nonmember cannot read',async()=>{
 for(const role of ['viewer',null]){
  const s=stub({role});
  assert.equal((await s.handler.fetch(makeReq())).status,403);
  assert.ok(!s.calls.some(x=>x[0].includes('business_private_inbox')));
 }
});
test('valid inbox derives actor from verified database session',async()=>{
 const s=stub({result:[{id:msg,body:'record'}]});
 const res=await s.handler.fetch(makeReq());
 assert.equal(res.status,200);
 assert.deepEqual((await res.json()).messages,[{id:msg,body:'record'}]);
 const sessionQuery=s.calls.find(x=>x[0].startsWith('SELECT s.user_id'));
 assert.match(sessionQuery[1][0],/^[0-9a-f]{64}$/);
 assert.ok(!sessionQuery[1][0].includes('bbbbbb'));
 assert.ok(s.calls.some(x=>x[0].includes("set_config('request.user_id'")&&x[1][0]===user));
 assert.ok(s.calls.some(x=>x[0]==='COMMIT'));
});
test('valid POST calls only controlled stored function',async()=>{
 const s=stub({role:'admin'});
 const res=await s.handler.fetch(makeReq('POST',valid));
 assert.equal(res.status,201);
 assert.equal((await res.json()).message.id,msg);
 const rpc=s.calls.find(x=>x[0].includes('SELECT business_private_send'));
 assert.deepEqual(rpc[1],[kennel,msg,'staff@example.com','Please feed kennel 2']);
 assert.ok(!s.calls.some(x=>/INSERT INTO\s+business_private_messages/.test(x[0])));
});
test('database access denial returns 403 without details',async()=>{
 const s=stub();const orig=s.handler;
 const pool={connect:async()=>({async query(q){if(q.includes('business_private_inbox'))throw {code:'42501'};if(q.startsWith('SELECT s.user_id'))return {rows:[{user_id:user}]};if(q.startsWith('SELECT role'))return {rows:[{role:'staff'}]};return {rows:[]}},release(){}})};
 const result=await createHandler(pool).fetch(makeReq());
 assert.equal(result.status,403);
 assert.doesNotMatch(await result.text(),/PostgreSQL|RLS|SQL/);
});
