import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleDirect} from '../functions/api/[[path]].js';
globalThis.crypto||=webcrypto;
const origin='https://portal-test.example';
const kennel='a522b281-33ca-40f3-98bd-2c01de70a934',record='565aa9b9-dbe0-44c1-9b73-058bb8e3a321';
const env={KO_SESSION_KEY:'32'.repeat(32)};
function req(path,method='GET',input,ck=''){
  const headers={...(ck?{Cookie:ck}:{})};
  if(method!=='GET'){headers.Origin=origin;headers['Sec-Fetch-Site']='same-origin';headers['Content-Type']='application/json'}
  return new Request(origin+path,{method,headers,body:input?JSON.stringify(input):method!=='GET'?'{}':undefined});
}
const fake=(role='owner',visited=[])=>async (url,options={})=>{
 const path=new URL(url).pathname;
 visited.push({path,method:options.method,data:options.body?JSON.parse(options.body):null,auth:options.headers?.Authorization});
 if(path==='/v2/login')return Response.json({token:'aa'.repeat(32)});
 if(path==='/v2/me')return Response.json({user:{id:record,email:'tester@example.test'},kennels:[{id:kennel,role}]});
 if(path==='/v2/password')return Response.json({ok:true});
 if(path==='/v2/business-profile')return Response.json({ok:true,user:{id:record},kennels:[{id:kennel,role}]});
 if(path==='/v2/signup')return Response.json({ok:true},{status:201});
 if(path==='/v2/kennels/'+kennel+'/private-messages')return options.method==='POST'?Response.json({message:{id:record}},{status:201}):Response.json({messages:[]});
 return Response.json({error:'Unrecognized route'}, {status:404});
};
async function login(){
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Legacy intentionally unavailable')};
 try{
 const response=await handleDirect(req('/api/login','POST',{email:'a@example.test',password:'safe-test-password'}),env,fake());
 assert.equal(response.status,200);
 return response.headers.get('set-cookie').match(/__Host-ko_session=[\w-]+/)[0];
 }finally{globalThis.fetch=old}
}
test('signup validates fields then forwards to Neon without Render',async()=>{
 const calls=[],i={email:'signup@example.test',name:'Test User',kennelName:'Test Kennel',password:'a-strong-nonproduction-password'};
 const response=await handleDirect(req('/api/signup','POST',i),env,fake('owner',calls));
 assert.equal(response.status,201);
 assert.deepEqual(calls.map(x=>x.path),['/v2/signup']);
 assert.equal(calls[0].data.kennelName,'Test Kennel');
});
test('signup rejects weak passwords without calling Neon',async()=>{
 let count=0;
 const r=await handleDirect(req('/api/signup','POST',{email:'a@b.co',name:'Test',kennelName:'Kennel',password:'weak'}),env,async()=>{count++;throw Error('backend invoked')});
 assert.equal(r.status,400);assert.equal(count,0);
});
test('password change calls Neon with authenticated bearer and never leaks password in response',async()=>{
 const c=await login(),calls=[];
 const response=await handleDirect(req('/api/password','POST',{currentPassword:'old-password',newPassword:'very-strong-password'},c),env,fake('owner',calls));
 assert.equal(response.status,200);
 assert.deepEqual(calls.map(x=>x.path),['/v2/password']);
 assert.equal(calls[0].auth,'Bearer '+'aa'.repeat(32));
 assert(!JSON.stringify(await response.json()).includes('old-password'));
});
test('business profile edit requires owner',async()=>{
 const c=await login(),calls=[];
 const payload={kennelID:kennel,email:'test@example.test',ownerName:'Test',businessName:'Test Kennel',expectedEmail:'old@example.test'};
 const r=await handleDirect(req('/api/business-profile','PATCH',payload,c),env,fake('viewer',calls));
 assert.equal(r.status,403);assert.equal(calls.filter(x=>x.path==='/v2/business-profile').length,0);
 const ok=await handleDirect(req('/api/business-profile','PATCH',payload,c),env,fake('owner',calls));
 assert.equal(ok.status,200);assert.equal(calls.at(-1).path,'/v2/business-profile');
});
test('private messaging only exposes same-kennel traffic and role enforcement',async()=>{
 const c=await login(),calls=[];
 const sent={id:record,recipientEmail:'Test@Example.test',body:'Hello there'};
 const r=await handleDirect(req('/api/kennels/'+kennel+'/private-messages','POST',sent,c),env,fake('staff',calls));
 assert.equal(r.status,201);assert.equal(calls.at(-1).data.recipientEmail,'test@example.test');
 const denied=await handleDirect(req('/api/kennels/'+kennel+'/private-messages','GET',null,c),env,fake('viewer'));
 assert.equal(denied.status,403);
 const foreign=await handleDirect(req('/api/kennels/11111111-1111-4111-8111-111111111111/private-messages','GET',null,c),env,fake());
 assert.equal(foreign.status,403);
});
test('bad private-message body is rejected before write',async()=>{
 const c=await login(),calls=[];
 const r=await handleDirect(req('/api/kennels/'+kennel+'/private-messages','POST',{id:record,recipientEmail:'x@example.test',body:''},c),env,fake('staff',calls));
 assert.equal(r.status,400);
 assert.equal(calls.filter(x=>x.path.includes('private-messages')).length,0);
});
