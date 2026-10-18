import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleDirect} from '../functions/api/[[path]].js';
globalThis.crypto ||= webcrypto;
const site='https://kennelone-portal.pages.dev';
const env={KO_SESSION_KEY:'19'.repeat(32)};
const kennel='a522b281-33ca-40f3-98bd-2c01de70a934';
const recordID='565aa9b9-dbe0-44c1-9b73-058bb8e3a321';
const apiToken='ab'.repeat(32);
const parsed=(resp)=>resp.json();
const req=(path,method='GET',body,headers={})=>{
 const h={...headers};
 if(method!=='GET'){if(!('Origin' in h))h.Origin=site;h['Sec-Fetch-Site']='same-origin';if(body!==undefined)h['Content-Type']='application/json'}
 return new Request(site+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
};
const stub=(role='owner',ops=[])=>async(url,init={})=>{
 const path=new URL(url).pathname;
 ops.push({path,method:init.method,auth:init.headers?.Authorization,body:init.body});
 if(path==='/v2/login')return Response.json({token:apiToken});
 if(path==='/v2/me')return Response.json({user:{id:recordID},kennels:[{id:kennel,role,name:'Test kennel'}]});
 if(path==='/v2/kennels/'+kennel+'/records')return Response.json({records:[],nextCursor:null});
 if(path==='/v2/kennels/'+kennel+'/members')return Response.json({members:[]});
 if(path==='/v2/logout')return Response.json({ok:true});
 return Response.json({error:'Unknown stub '+path},{status:404});
};
const loggedIn=async()=>{
 const r=await handleDirect(req('/api/login','POST',{email:'test@kennelone.app',password:'not-a-real-password'}),env,stub());
 assert.equal(r.status,200);
 const seal=r.headers.get('set-cookie').match(/__Host-ko_session=[A-Za-z0-9_-]+/)[0];
 assert(!r.headers.get('set-cookie').includes(apiToken),'session cookie must not contain plaintext token');
 return seal;
};
test('new direct sessions are AES-GCM sealed, authenticated and read from Neon backend',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Render not responding')};
 try{
  const cookie=await loggedIn();
  const calls=[];
  const r=await handleDirect(req('/api/me','GET',undefined,{Cookie:cookie}),env,stub('owner',calls));
  assert.equal(r.status,200);assert.equal((await parsed(r)).kennels[0].id,kennel);
  assert.equal(calls[0].path,'/v2/me');assert.equal(calls[0].auth,'Bearer '+apiToken);
 }finally{globalThis.fetch=old}
});
test('invalid signed session returns 401 without data exfiltration',async()=>{
 const r=await handleDirect(req('/api/me','GET',undefined,{Cookie:'__Host-ko_session=attacker'}),env,stub());
 assert.equal(r.status,401);
});
test('CSRF rejected before authentication attempt',async()=>{
 const r=await handleDirect(req('/api/login','POST',{email:'bad',password:'bad'},{Origin:'https://evil.example'}),env,stub());
 assert.equal(r.status,403);
});
test('authenticated record list reads are scoped by membership',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Render not responding')};
 try{
 const cookie=await loggedIn();const ops=[];
 const r=await handleDirect(req('/api/records?kennel='+kennel,'GET',undefined,{Cookie:cookie}),env,stub('staff',ops));
 assert.equal(r.status,200);
 assert.deepEqual(ops.map(x=>x.path),['/v2/me','/v2/kennels/'+kennel+'/records']);
 }finally{globalThis.fetch=old}
});
test('viewer cannot write owner-only payments records',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Render not responding')};
 try {
 const cookie=await loggedIn();
 const r=await handleDirect(req('/api/kennels/'+kennel+'/records/'+recordID,'PUT',{type:'payments',expectedRevision:0,record:{id:recordID}},{Cookie:cookie}),env,stub('viewer'));
 assert.equal(r.status,403);
 } finally {globalThis.fetch=old}
});
test('malformed record ID blocks backend write',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Render not responding')};
 try {
 const cookie=await loggedIn();
 const r=await handleDirect(req('/api/kennels/'+kennel+'/records/not-a-uuid','PUT',{type:'dogs',expectedRevision:0,record:{id:recordID}},{Cookie:cookie}),env,stub());
 assert.equal(r.status,400);
 } finally {globalThis.fetch=old}
});
test('invalid login rejects and no session issued',async()=>{
 const r=await handleDirect(req('/api/login','POST',{email:'user@example.com',password:'bad'}),env,async()=>Response.json({error:'Invalid credentials'},{status:401}));
 assert.equal(r.status,401);assert.equal(r.headers.get('set-cookie'),null);
});
test('logout revokes backend token and deletes cookie',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({ok:true});
 try {
 const cookie=await loggedIn();const ops=[];
 const r=await handleDirect(req('/api/logout','POST',{}, {Cookie:cookie}),env,stub('owner',ops));
 assert.equal(r.status,200);
 assert.equal(ops[0].path,'/v2/logout');
 assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
 }finally{globalThis.fetch=old}
});
test('Square payment route refuses to bypass legacy signed backend',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected live gateway call')};
 try {
 const cookie=await loggedIn();
 const r=await handleDirect(req('/api/kennels/'+kennel+'/square-checkout','POST',{amountCents:500},{Cookie:cookie}),env,stub());
 assert.equal(r.status,503);
 }finally{globalThis.fetch=old}
});
