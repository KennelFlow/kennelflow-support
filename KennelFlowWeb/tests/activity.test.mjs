import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createWebServer} from '../server.mjs';

const token='b'.repeat(64);
async function setup(t) {
  const calls=[],stub={ownerAllowed:true,redirect:false};
  const fetcher=async(url,options={})=>{
    const path=new URL(url).pathname;
    calls.push({path,options});
    if(path==='/v2/login')return Response.json({token});
    if(path==='/v2/activity/heartbeat')return stub.redirect
      ?new Response(null,{status:302,headers:{Location:'https://unsafe.example/'}})
      :Response.json({ok:true});
    if(path.startsWith('/v2/platform-owner/'))return stub.ownerAllowed
      ?Response.json(path.endsWith('/overview')?{accounts_total:2}:{customers:[]})
      :Response.json({error:'Forbidden'},{status:403});
    return Response.json({error:'Not found'},{status:404});
  };
  const server=createWebServer({fetcher,secure:true});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  let cookie='';
  async function request(path,method='GET',data,extra={}) {
    const headers={Origin:base,...(cookie?{Cookie:cookie}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{}),...extra};
    const res=await fetch(base+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
    if(res.headers.has('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];
    return res;
  }
  const login=async()=>{
    const res=await request('/api/login','POST',{email:'test@example.invalid',password:'valid local fixture'});
    assert.equal(res.status,200);
    assert.match(res.headers.get('set-cookie'),/HttpOnly/);
  };
  return {calls,stub,request,login};
}
test('activity endpoints cannot be accessed before authentication',async t=>{
  const {request,calls}=await setup(t);
  assert.equal((await request('/api/activity/heartbeat','POST',{platform:'windows'})).status,401);
  assert.equal((await request('/api/platform-owner/overview')).status,401);
  assert.equal((await request('/api/platform-owner/activity')).status,401);
  assert.equal(calls.length,0);
});
test('Windows and web heartbeats send only platform plus server-owned bearer token',async t=>{
  const {request,login,calls}=await setup(t);
  await login();
  for(const platform of ['windows','web']){
    const res=await request('/api/activity/heartbeat','POST',{platform,extra:'should not forward'});
    assert.equal(res.status,200);
    assert.deepEqual(JSON.parse(calls.at(-1).options.body),{platform});
    assert.equal(calls.at(-1).options.headers.Authorization,'Bearer '+token);
    assert.equal(new URL('https://x'+calls.at(-1).path).pathname,'/v2/activity/heartbeat');
    assert.equal(res.headers.get('set-cookie'),null);
  }
});
test('invalid client platform and cross-origin requests are blocked',async t=>{
  const {request,login,calls}=await setup(t);
  await login();
  for(const platform of ['ios','android','fake',null]){
    assert.equal((await request('/api/activity/heartbeat','POST',{platform})).status,400);
  }
  const count=calls.length;
  assert.equal((await request('/api/activity/heartbeat','POST',{platform:'windows'},{Origin:'https://evil.example'})).status,403);
  assert.equal(calls.length,count);
});
test('owner overview and customer endpoints defer permissions to server',async t=>{
  const {request,login,calls,stub}=await setup(t);
  await login();
  assert.equal((await request('/api/platform-owner/overview')).status,200);
  assert.equal(calls.at(-1).path,'/v2/platform-owner/overview');
  assert.equal(calls.at(-1).options.headers.Authorization,'Bearer '+token);
  assert.equal((await request('/api/platform-owner/activity')).status,200);
  assert.equal(calls.at(-1).path,'/v2/platform-owner/activity');
  stub.ownerAllowed=false;
  assert.equal((await request('/api/platform-owner/overview')).status,403);
  assert.equal((await request('/api/platform-owner/activity')).status,403);
});
test('untrusted redirect from activity provider is blocked',async t=>{
  const {request,login,stub}=await setup(t);
  await login();stub.redirect=true;
  assert.equal((await request('/api/activity/heartbeat','POST',{platform:'windows'})).status,502);
});
test('owner dashboard resources are available but owner data requires session',async t=>{
  const {request}=await setup(t);
  assert.equal((await request('/owner.html')).status,200);
  assert.equal((await request('/owner-dashboard.js')).status,200);
  assert.equal((await request('/api/platform-owner/overview')).status,401);
});
