import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {createWebServer} from '../server.mjs';
import {collections,models,canWrite,validateModel,normalizedRow} from '../records.mjs';
import {fixture,fixtures} from './fixtures.mjs';
const kennel=crypto.randomUUID(),other=crypto.randomUUID();
async function setup(t,options={}){
  const state={role:'owner',valid:true,records:new Map(),calls:[],file:null,...options};
  const json=(status,data)=>Response.json(data,{status});
  const fetcher=async(url,init={})=>{
    const path=new URL(url).pathname,method=init.method||'GET';state.calls.push({path,method});
    if(path==='/v2/login')return json(200,{token:'a'.repeat(64)});
    if(path==='/v2/invitations/accept')return json(200,{ok:true});
    if(!state.valid)return json(401,{error:'Session expired'});
    if(path==='/v2/logout'){state.valid=false;return json(200,{ok:true})}
    if(path==='/v2/kennels')return json(200,{kennels:[{id:kennel,name:'Test kennel',role:state.role}]});
    if(path==='/v2/me')return json(200,{user:{id:other,name:'Test'},kennels:[{id:kennel,name:'Test kennel',role:state.role}]});
    if(path.endsWith('/members')||path.includes('/members/'))return json(200,{members:[]});
    if(path.includes('/invitations'))return json(200,{invitations:[]});
    if(path.endsWith('/clock'))return json(state.role==='viewer'?403:200,{record:null});
    if(path.endsWith('/history'))return json(200,{events:[],nextCursor:null});
    if(path.endsWith('/records')&&method==='GET')return json(200,{records:[...state.records.values()],nextCursor:null});
    if(path.includes('/records/')&&method==='PUT'){
      const input=JSON.parse(init.body),id=path.split('/').pop(),before=state.records.get(id);
      if((before?.revision||0)!==input.expectedRevision)return json(409,{error:'Conflict; refresh before retrying'});
      const row={id,type:input.type,data:input.data,revision:input.expectedRevision+1,deleted_at:input.deletedAt||null,updated_at:new Date().toISOString()};state.records.set(id,row);return json(200,{record:row});
    }
    if(path.includes('/files/')){
      if(method==='PUT'){const bytes=Buffer.from(init.body),hash=createHash('sha256').update(bytes).digest('hex');if(state.file&&state.file.hash!==hash)return json(409,{error:'Immutable file'});state.file={bytes,hash};return json(200,{ok:true})}
      if(!state.file)return json(404,{error:'File not found'});
      return new Response(state.file.bytes,{headers:{'x-content-sha256':state.badHash?'wrong':state.file.hash}});
    }
    return json(404,{error:'Not found'});
  };
  const server=createWebServer({fetcher,secure:true});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;let cookie='';
  const call=async(path,method='GET',data,extra={})=>{
    const headers={Origin:base,...(cookie?{Cookie:cookie}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{}),...extra};
    const r=await fetch(base+path,{method,headers,body:data===undefined?undefined:typeof data==='string'?data:JSON.stringify(data)});
    if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;
  };
  return {state,call,base,server};
}
test('all 37 collections produce native-compatible typed records',()=>{
  assert.equal(Object.keys(collections).length,37);
  for(const [type,record] of Object.entries(fixtures()))assert.equal(validateModel(collections[type],record),null,type);
  const dog=fixture('Dog');dog.dateOfBirth='2026-10-15T12:00:00.000Z';assert.match(validateModel('Dog',dog),/dateOfBirth/);
  assert.equal(normalizedRow({id:dog.id.toUpperCase(),type:'dog',revision:'2',data:{dog}}).id,dog.id.toLowerCase());
});
test('authentication, CSRF and secure session cookies',async t=>{
  const {call}=await setup(t);
  assert.equal((await call('/api/me')).status,401);
  assert.equal((await call('/api/login','POST',{email:'x@test.invalid',password:'anything'},{Origin:'https://evil.invalid'})).status,403);
  assert.equal((await call('/api/login','POST',{email:'x@test.invalid',password:'anything'},{Origin:''})).status,403);
  const r=await call('/api/login','POST',{email:'x@test.invalid',password:'anything'});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict.*Secure/);
  assert.deepEqual(await r.json(),{ok:true});assert.equal((await call('/api/me')).status,200);
  assert.equal((await call('/api/logout','POST',{})).status,200);assert.equal((await call('/api/me')).status,401);
});
test('kennel isolation, role changes and upstream conflict protection',async t=>{
  const {call,state}=await setup(t);await call('/api/login','POST',{email:'x@test.invalid',password:'anything'});
  const record=fixture('Dog'),path=`/api/kennels/${kennel}/records/${record.id}`,input={type:'dogs',expectedRevision:0,record};
  assert.equal((await call(`/api/kennels/${other}/records/${record.id}`,'PUT',input)).status,403);
  let r=await call(path,'PUT',input);assert.equal(r.status,200);assert.equal((await r.json()).record.revision,1);
  assert.equal((await call(path,'PUT',input)).status,409);
  record.notes='Changed in browser';r=await call(path,'PUT',{...input,expectedRevision:1});assert.equal((await r.json()).record.revision,2);
  assert.equal(state.records.get(record.id).data.platform,'ios');assert.equal(state.records.get(record.id).data.record.notes,record.notes);
  state.role='viewer';assert.equal((await call(path,'PUT',{...input,expectedRevision:2})).status,403);
  state.role='staff';assert.equal((await call(path,'PUT',{...input,expectedRevision:2})).status,403);
  const task=fixture('KennelTask');assert.equal((await call(`/api/kennels/${kennel}/records/${task.id}`,'PUT',{type:'tasks',expectedRevision:0,record:task})).status,200);
  state.valid=false;assert.equal((await call(`/api/records?kennel=${kennel}`)).status,401);
});
test('soft deletion, restore and strict identity validation',async t=>{
  const {call,state}=await setup(t);await call('/api/login','POST',{email:'x@test.invalid',password:'anything'});
  const record=fixture('KennelRun'),path=`/api/kennels/${kennel}/records/${record.id}`,input={type:'kennels',expectedRevision:0,record};
  assert.equal((await call(path,'PUT',input)).status,200);
  assert.equal((await call(path,'PUT',{...input,expectedRevision:1,deletedAt:'2026-10-15T12:00:00Z'})).status,200);assert.ok(state.records.get(record.id).deleted_at);
  assert.equal((await call(path,'PUT',{...input,expectedRevision:2})).status,200);assert.equal(state.records.get(record.id).deleted_at,null);
  assert.equal((await call(path,'PUT',{...input,expectedRevision:3,record:{...record,id:other}})).status,400);
  assert.equal((await call(path,'PUT',{...input,expectedRevision:3,record:{id:record.id}})).status,400);
  assert.equal((await call(path,'PUT','{bad json')).status,400);
});
test('document checksum validation, immutable upload conflicts and permissions',async t=>{
  const {call,state,base}=await setup(t);const login=await call('/api/login','POST',{email:'x@test.invalid',password:'anything'});const cookie=login.headers.get('set-cookie').split(';')[0];const path=`/api/kennels/${kennel}/files/${other}`;
  const upload=bytes=>fetch(base+path,{method:'PUT',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/octet-stream'},body:bytes});
  assert.equal((await upload('test document')).status,200);assert.equal(await (await call(path)).text(),'test document');
  assert.equal((await upload('replacement')).status,409);
  state.badHash=true;assert.equal((await call(path)).status,502);state.badHash=false;
  state.role='viewer';assert.equal((await call(path)).status,403);assert.equal((await upload('test document')).status,403);
});
test('employee management proxy keeps authority on the backend and validates requests',async t=>{
 const {call,state}=await setup(t);await call('/api/login','POST',{email:'x@test.invalid',password:'anything'});
 const root=`/api/kennels/${kennel}`;
 assert.equal((await call(root+'/members')).status,200);
 assert.equal((await call(root+'/members/'+other,'PATCH',{role:'owner',remove:false})).status,400);
 assert.equal((await call(root+'/invitations','POST',{email:'new@example.invalid',role:'staff'})).status,200);
 assert.equal((await call(root+'/invitations','POST',{email:'bad',role:'staff'})).status,400);
 state.role='admin';assert.equal((await call(root+'/invitations','POST',{email:'new@example.invalid',role:'admin'})).status,400);
 state.role='staff';assert.equal((await call(root+'/members')).status,403);assert.equal((await call(root+'/invitations')).status,403);
 assert.equal((await call(root+'/clock','POST',{action:'in',staffID:other})).status,200);
 assert.equal((await call(root+'/clock','POST',{action:'change'})).status,400);
 assert.equal((await call(root+'/history?before=bad')).status,400);
 assert.equal((await call(`/api/kennels/${other}/history`)).status,403);
 state.role='viewer';assert.equal((await call(root+'/clock','POST',{action:'in'})).status,403);
});
test('invitation acceptance supports new users without opening arbitrary backend routes',async t=>{
 const {call}=await setup(t);const input={email:'employee@example.invalid',name:'Employee',password:'long test password 123',token:'b'.repeat(64)};
 assert.equal((await call('/api/invitations/accept','POST',input)).status,200);
 assert.equal((await call('/api/invitations/accept','POST',{...input,password:'short'})).status,400);
 assert.equal((await call('/api/invitations/accept','POST',{...input,token:'broken'})).status,400);
});
