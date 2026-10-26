import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleDirect} from '../functions/api/[[path]].js';
globalThis.crypto||=webcrypto;
const origin='https://billing-preview.example';
const scope='00000000-0000-0000-0000-000000000911';
const foreign='00000000-0000-0000-0000-000000000912';
const env={KO_SESSION_KEY:'ab'.repeat(32)};
const input=(path,method='GET',data,cookie)=>new Request(origin+path,{
 method,headers:{...(cookie?{Cookie:cookie}:{}),
  ...(method==='POST'?{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'}:{})},
 body:data?JSON.stringify(data):method==='POST'?'{}':undefined
});
function backend(calls){
 return async(url,options={})=>{
  const path=new URL(url).pathname;
  calls.push(path);
  if(path==='/v2/login')return Response.json({token:'ab'.repeat(32)});
  if(path==='/v2/me')return Response.json({user:{id:scope,email:'preview@example.invalid'},kennels:[{id:scope,role:'owner'}]});
  if(path==='/v2/billing/status')return Response.json({status:{active:true,provider:'google',plan:'annual'}});
  return Response.json({error:'not found'},{status:404});
 };
}
test('Windows gateway sends signed-in member to server-backed billing status',async()=>{
 const calls=[];
 const auth=await handleDirect(input('/api/login','POST',{email:'preview@example.invalid',password:'example-not-a-real-secret'}),env,backend(calls));
 assert.equal(auth.status,200);
 const cookie=auth.headers.get('set-cookie').match(/__Host-ko_session=[\w-]+/)[0];
 const status=await handleDirect(input('/api/billing/status?kennel='+scope,'GET',null,cookie),env,backend(calls));
 assert.equal(status.status,200);
 assert.deepEqual((await status.json()).status,{active:true,provider:'google',plan:'annual'});
 assert(calls.includes('/v2/billing/status'));
});
test('foreign kennel cannot be used to query another customer subscription',async()=>{
 const calls=[];
 const auth=await handleDirect(input('/api/login','POST',{email:'preview@example.invalid',password:'example-not-a-real-secret'}),env,backend(calls));
 const cookie=auth.headers.get('set-cookie').match(/__Host-ko_session=[\w-]+/)[0];
 const status=await handleDirect(input('/api/billing/status?kennel='+foreign,'GET',null,cookie),env,backend(calls));
 assert.equal(status.status,403);
 assert(!calls.includes('/v2/billing/status'));
});
