import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleDirect} from '../functions/api/[[path]].js';
const host='https://backend-migration-preview.kennelone-portal.pages.dev';
const bearer='a1'.repeat(32);
function database() {
 const map=new Map();return {
  map,prepare(sql) {
   let args=[];
   return {bind(...v){args=v;return this},
    async run(){
     if(sql.startsWith('INSERT'))map.set(args[0],{token:args[1],created:args[2]});
     if(sql.startsWith('DELETE FROM sessions WHERE id_hash'))map.delete(args[0]);
     if(sql.startsWith('DELETE FROM sessions WHERE created'))for(const [k,r] of map)if(r.created<args[0])map.delete(k);
     return {success:true};
    },
    async first(){return map.get(args[0])||null}
   };
  }
 }
}
function request(path,method='GET',cookie='') {
 return new Request(host+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:host,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'}:{})},...(method!=='GET'?{body:JSON.stringify({email:'test@example.com',password:'some-testing-password'})}:{})});
}
const calls=[];
const fetcher=async (url,init={})=>{
 calls.push(new URL(url).pathname);
 if(url.endsWith('/v2/login'))return Response.json({token:bearer});
 if(url.endsWith('/v2/me'))return Response.json({user:{id:'me'},kennels:[]});
 if(url.endsWith('/v2/logout'))return Response.json({ok:true});
 throw new Error('Unexpected request');
};
test('D1 auth persists server-side, uses only opaque hashed IDs, works across stateless invocations, and logout invalidates token',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Legacy Render intentionally unavailable')};
 const env={SESSIONS:database()};
 try {
  const login=await handleDirect(request('/api/login','POST'),env,fetcher);
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').match(/__Host-ko_session=[a-f0-9]{64}/)?.[0];
  assert(cookie);assert(!cookie.includes(bearer));
  const sid=cookie.split('=')[1];
  assert.equal(env.SESSIONS.map.size,1);
  assert(env.SESSIONS.map.has(createHash('sha256').update(sid).digest('hex')));
  assert(!env.SESSIONS.map.has(sid));
  const me=await handleDirect(request('/api/me','GET',cookie),env,fetcher);
  assert.equal(me.status,200);
  const logout=await handleDirect(request('/api/logout','POST',cookie),env,fetcher);
  assert.equal(logout.status,200);
  assert.equal(env.SESSIONS.map.size,0);
  const again=await handleDirect(request('/api/me','GET',cookie),env,fetcher);
  assert.equal(again.status,401);
  assert(calls.includes('/v2/logout'));
 } finally {globalThis.fetch=old}
});

test('fresh visitors never wake Render to display the login page',async()=>{
 const env={SESSIONS:database()};
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('Should not need Render')};
 try {
   const r=await handleDirect(request('/api/me'),env,fetcher);
   assert.equal(r.status,401);
   assert.equal(calls,0);
 }finally{globalThis.fetch=old}
});
