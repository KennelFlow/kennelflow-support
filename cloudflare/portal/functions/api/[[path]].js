import {randomBytes, createHash, createHmac} from 'node:crypto';
import {canWrite, collections, uuid, validateModel} from '../_lib/records.mjs';
import {onRequest as legacy} from '../_lib/legacy.mjs';

// This worker is non-destructive during rollout:
// no session key binding => existing Render compatibility path remains in charge.
// An active encrypted session uses direct Neon API; old 8-hour Render sessions are
// transparently supported until users sign in again.
const BACKEND = 'https://br-long-night-b5uhw0hi-kennelflowapi.compute.c-7.us-east-2.aws.neon.tech';
const COOKIE = '__Host-ko_session';
const SESSION_MS = 28800000;
const fail = (status,message) => Object.assign(Error(message),{status});
const jsonResponse = (status,data,headers={}) => new Response(JSON.stringify(data),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...headers}
});
function b64(bytes){return Buffer.from(bytes).toString('base64url')}
function cookieValue(request,name) {
  return (request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
}
async function keyFor(env) {
  if(!/^[a-f0-9]{64}$/i.test(env.KO_SESSION_KEY||'')) throw fail(503,'Secure login is not configured');
  return crypto.subtle.importKey('raw',Buffer.from(env.KO_SESSION_KEY,'hex'),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function seal(token,env,now=Date.now()){
  const iv=randomBytes(12);
  const encoded=new TextEncoder().encode(JSON.stringify({token,created:now}));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('Kennel One Cloud Session v1')},await keyFor(env),encoded);
  return b64(Buffer.concat([iv,Buffer.from(ciphertext)]));
}
async function unseal(value,env){
  if(!value||value.length>2048||!/^[A-Za-z0-9_-]+$/.test(value))return null;
  try{
    const raw=Buffer.from(value,'base64url');
    if(raw.length<41)return null;
    const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:raw.subarray(0,12),additionalData:new TextEncoder().encode('Kennel One Cloud Session v1')},await keyFor(env),raw.subarray(12));
    const s=JSON.parse(new TextDecoder().decode(data));
    if(!/^[a-f0-9]{64}$/.test(s.token||'')||!Number.isSafeInteger(s.created)||s.created>Date.now()+30000||Date.now()-s.created>=SESSION_MS)return null;
    return s;
  }catch{return null}
}
const sessionCookie=(value,age)=>COOKIE+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+age;
// Durable, multi-region-safe session storage. Session identifiers are random,
// only SHA-256 hashes of identifiers are stored; the API bearer stays server-side.
// Cloudflare encrypts D1 data at rest. Do not record database rows in logs.
async function createSession(token,env) {
  if(!env.SESSIONS)return seal(token,env);
  const id=randomBytes(32).toString('hex'),idHash=createHash('sha256').update(id).digest('hex'),now=Date.now();
  await env.SESSIONS.prepare('DELETE FROM sessions WHERE created < ?').bind(now-SESSION_MS).run();
  await env.SESSIONS.prepare('INSERT INTO sessions (id_hash, token, created) VALUES (?, ?, ?)').bind(idHash,token,now).run();
  return id;
}
async function getSession(id,env) {
  if(!env.SESSIONS)return unseal(id,env);
  if(!/^[a-f0-9]{64}$/.test(id||''))return null;
  const hash=createHash('sha256').update(id).digest('hex');
  const row=await env.SESSIONS.prepare('SELECT token, created FROM sessions WHERE id_hash = ?').bind(hash).first();
  if(!row||!Number.isSafeInteger(row.created)||row.created>Date.now()+30000||Date.now()-row.created>=SESSION_MS||!/^[a-f0-9]{64}$/.test(row.token||''))return null;
  return row;
}
async function revokeSession(id,env) {
  if(!env.SESSIONS||!/^[a-f0-9]{64}$/.test(id||''))return;
  const hash=createHash('sha256').update(id).digest('hex');
  await env.SESSIONS.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(hash).run();
}

async function parseJSON(request,limit=1048576) {
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw fail(415,'JSON required');
  const size=Number(request.headers.get('content-length')||0);
  if(size>limit)throw fail(413,'Request too large');
  const data=await request.text();if(data.length>limit)throw fail(413,'Request too large');
  let value;try{value=JSON.parse(data||'{}')}catch{throw fail(400,'Invalid JSON')}
  if(!value||typeof value!=='object'||Array.isArray(value))throw fail(400,'JSON object required');
  return value;
}
async function upstream(path,token,method='GET',data,binary=false,fetcher=fetch){
  const response=await fetcher(BACKEND+path,{
    method,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),
    ...(data!==undefined?{'Content-Type':binary?'application/octet-stream':'application/json'}:{}),
    ...(binary&&data?{'X-Content-SHA256':createHash('sha256').update(data).digest('hex')}:{})},
    body:data===undefined?undefined:binary?data:JSON.stringify(data),
    redirect:'manual',signal:AbortSignal.timeout(20000)
  });
  if(response.status>=300&&response.status<400)throw fail(502,'Cloud redirect blocked');
  return response;
}
const forward=async response=>jsonResponse(response.status,await response.json().catch(()=>({error:'Invalid cloud response'})));
async function membership(token,scope,fetcher) {
  const r=await upstream('/v2/me',token,'GET',undefined,false,fetcher);
  if(r.status!==200)throw fail(r.status===401?401:503,r.status===401?'Sign in again':'Could not verify kennel access');
  const k=(await r.json()).kennels?.find(k=>k.id?.toLowerCase()===scope);
  if(!k||!['owner','admin','staff','viewer'].includes(k.role))throw fail(403,'No access to this kennel');
  return k;
}
const allowedCors = (req) => {
  const u=new URL(req.url),origin=req.headers.get('origin');
  if(origin){
    try{if(new URL(origin).origin!==u.origin)return false}catch{return false}
  }
  if(!['GET','HEAD'].includes(req.method)&&(origin!==u.origin||req.headers.get('sec-fetch-site')==='cross-site'))return false;
  return true;
};
async function legacyCall(request,fetcher) {
  // Legacy worker must use host-restricted fetch; provider's credential rules
  // are enforced by the existing backend.
  return legacy({request});
}
async function direct(request,env={},fetcher=fetch) {
  const u=new URL(request.url),path=u.pathname,method=request.method;
  if(!path.startsWith('/api/'))return jsonResponse(404,{error:'Not found'});
  if(!allowedCors(request))return jsonResponse(403,{error:'Origin not allowed'});
  if(!env.KO_SESSION_KEY&&!env.SESSIONS)return legacyCall(request,fetcher);

  if(path==='/api/login'&&method==='POST'){
    const {email,password}=await parseJSON(request,16384);
    if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>256)throw fail(400,'Email and password required');
    const r=await upstream('/v2/login',null,'POST',{email,password},false,fetcher),v=await r.json().catch(()=>({error:'Invalid login response'}));
    if(r.status!==200||!/^[a-f0-9]{64}$/.test(v.token||''))return jsonResponse(r.status===200?502:r.status,{error:v.error||'Could not sign in'});
    const session=await createSession(v.token,env);
    const reply=jsonResponse(200,{ok:true},{'Set-Cookie':sessionCookie(session,28800)});
    // Render shadow session keeps existing Square checkout flows working until
    // their production migration passes payment settlement and webhook tests.
    try{
      const shadow=await fetcher('https://kennelflow-web.onrender.com/api/login',{
        method:'POST',headers:{Origin:'https://kennelflow-web.onrender.com','Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},
        body:JSON.stringify({email,password}),redirect:'manual',signal:AbortSignal.timeout(8000)});
      const oldCookie=shadow.headers.get('set-cookie');
      if(shadow.ok&&oldCookie&&oldCookie.startsWith('kf_session=')){
        const value=/^kf_session=[a-f0-9]{64}/.exec(oldCookie)?.[0];
        if(value)reply.headers.append('Set-Cookie',value+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800');
      }
    }catch{/* direct login is valid even while legacy payment gateway sleeps */}
    return reply;
  }
  if(path==='/api/signup'&&method==='POST'){
    const input=await parseJSON(request,16384);
    const email=String(input.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||
       typeof input.password!=='string'||input.password.length<16||input.password.length>256||
       typeof input.name!=='string'||!input.name.trim()||input.name.length>120||
       typeof input.kennelName!=='string'||!input.kennelName.trim()||input.kennelName.length>120)
      throw fail(400,'Valid email, name, business name and a password of 16–256 characters required');
    return forward(await upstream('/v2/signup',null,'POST',{
      email,password:input.password,name:input.name.trim(),kennelName:input.kennelName.trim()
    },false,fetcher));
  }
  if(path==='/api/invitations/accept'&&method==='POST'){
    const {token,email,name,password}=await parseJSON(request,16384);
    if(!/^[a-f0-9]{64}$/.test(token||'')||typeof email!=='string'||email.length>254||typeof name!=='string'||!name.trim()||name.length>120||typeof password!=='string'||password.length<16||password.length>256)throw fail(400,'Enter your invitation, email, name, and a password of 16–256 characters');
    return forward(await upstream('/v2/invitations/accept',null,'POST',{token,email,name,password},false,fetcher));
  }
  const encrypted=cookieValue(request,COOKIE);
  const session=await getSession(encrypted,env);
  if(!session&&!encrypted)return cookieValue(request,'kf_session')?legacyCall(request,fetcher):jsonResponse(401,{error:'Sign in required'});
  if(path==='/api/logout'&&method==='POST'){
    if(session){await revokeSession(encrypted,env);try{await upstream('/v2/logout',session.token,'POST',{},false,fetcher)}catch{}}
    // Any shadow Render session must be destroyed, too.
    try{await legacyCall(request,fetcher)}catch{}
    const resp=jsonResponse(200,{ok:true});
    resp.headers.append('Set-Cookie',sessionCookie('',0));
    resp.headers.append('Set-Cookie','kf_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');
    return resp;
  }
  if(!session)return jsonResponse(401,{error:'Sign in required'});
  const token=session.token;
  if(path==='/api/password'&&method==='POST'){
    const input=await parseJSON(request,16384);
    if(typeof input.currentPassword!=='string'||!input.currentPassword||input.currentPassword.length>256||
      typeof input.newPassword!=='string'||input.newPassword.length<16||input.newPassword.length>256)
      throw fail(400,'Valid current password and new password of 16–256 characters required');
    return forward(await upstream('/v2/password',token,'POST',{
      currentPassword:input.currentPassword,newPassword:input.newPassword
    },false,fetcher));
  }
  if(path==='/api/business-profile'&&method==='PATCH'){
    const input=await parseJSON(request,16384),kennelID=String(input.kennelID||'').toLowerCase();
    if(!uuid(kennelID))throw fail(400,'Invalid business ID');
    const membershipRole=await membership(token,kennelID,fetcher);
    if(membershipRole.role!=='owner')throw fail(403,'Only the business owner can edit this account');
    if(typeof input.email!=='string'||input.email.length>254||
      typeof input.ownerName!=='string'||input.ownerName.length>120||
      typeof input.businessName!=='string'||input.businessName.length>120||
      (input.currentPassword!==undefined&&(typeof input.currentPassword!=='string'||input.currentPassword.length>256)))
      throw fail(400,'Invalid account details');
    // Neon remains the final authority: it validates prior email/business name,
    // the existing password for login-email changes, and website/phone formats.
    return forward(await upstream('/v2/business-profile',token,'PATCH',input,false,fetcher));
  }
  if(path==='/api/me'&&method==='GET')return forward(await upstream('/v2/me',token,'GET',undefined,false,fetcher));
  if(path==='/api/kennels'&&method==='GET'){
    const r=await upstream('/v2/me',token,'GET',undefined,false,fetcher),v=await r.json();
    return jsonResponse(r.status,r.status===200?{kennels:v.kennels}:v);
  }
  if(/\/square-(?:checkout|sandbox-checkout|pending|status|recover|sandbox-status|sandbox-recover)$/.test(path)){
    // Payment requests require a signed request owned by the trusted legacy server.
    // Never expose checkout signing secrets or simulate a completed payment here.
    if(!cookieValue(request,'kf_session'))return jsonResponse(503,{error:'Payment gateway is reconnecting. Sign out and sign in again.'});
    return legacyCall(request,fetcher);
  }
  const messages=/^\/api\/kennels\/([^/]+)\/private-messages$/.exec(path);
  if(messages&&['GET','POST'].includes(method)){
    const scope=messages[1].toLowerCase();
    if(!uuid(scope))throw fail(400,'Invalid kennel ID');
    const k=await membership(token,scope,fetcher);
    if(!['owner','admin','staff'].includes(k.role))throw fail(403,'No private-message access');
    const dest='/v2/kennels/'+scope+'/private-messages';
    if(method==='GET')return forward(await upstream(dest,token,'GET',undefined,false,fetcher));
    const {id,recipientEmail,body}=await parseJSON(request,16384);
    if(!uuid(id)||typeof recipientEmail!=='string'||recipientEmail.length>254||
       !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)||
       typeof body!=='string'||!body.trim()||body.trim().length>4000)
      throw fail(400,'Provide a valid recipient and message up to 4000 characters');
    return forward(await upstream(dest,token,'POST',{
      id:id.toLowerCase(),recipientEmail:recipientEmail.trim().toLowerCase(),body:body.trim()
    },false,fetcher));
  }
  const employee=/^\/api\/kennels\/([^/]+)\/(members|invitations|clock|history)(?:\/([^/]+))?$/.exec(path);
  if(employee){
    const scope=employee[1].toLowerCase(),resource=employee[2],target=employee[3]?.toLowerCase();
    if(!uuid(scope)||(target&&!uuid(target)))throw fail(400,'Invalid employee address');
    const k=await membership(token,scope,fetcher);
    if(['members','invitations'].includes(resource)&&!['owner','admin'].includes(k.role))throw fail(403,'Only an owner or admin can manage employees');
    const dest='/v2/kennels/'+scope+'/'+resource+(target?'/'+target:'');
    if(method==='GET'&&!target){
      const before=u.searchParams.get('before');
      if(before&&!/^[1-9][0-9]{0,17}$/.test(before))throw fail(400,'Invalid history cursor');
      return forward(await upstream(dest+(resource==='history'&&before?'?before='+before:''),token,'GET',undefined,false,fetcher));
    }
    if(resource==='invitations'&&method==='POST'&&!target){
      const {email,role}=await parseJSON(request,16384);
      if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||!['staff','viewer','admin'].includes(role)||(k.role==='admin'&&role==='admin'))throw fail(400,'Choose a valid email and permitted role');
      return forward(await upstream(dest,token,'POST',{email,role},false,fetcher));
    }
    if(resource==='invitations'&&method==='DELETE'&&target)return forward(await upstream(dest,token,'DELETE',undefined,false,fetcher));
    if(resource==='members'&&method==='PATCH'&&target){
      const {role,remove}=await parseJSON(request,16384);
      if(!['staff','viewer','admin'].includes(role)||typeof remove!=='boolean')throw fail(400,'Choose a valid employee role');
      return forward(await upstream(dest,token,'PATCH',{role,remove},false,fetcher));
    }
    if(resource==='clock'&&method==='POST'&&!target){
      const {action}=await parseJSON(request,16384);
      if(!['in','out'].includes(action))throw fail(400,'Choose clock in or clock out');
      return forward(await upstream(dest,token,'POST',{action},false,fetcher));
    }
    throw fail(404,'Not found');
  }
  if(path==='/api/records'&&method==='GET'){
    const kennel=(u.searchParams.get('kennel')||'').toLowerCase(),cursor=u.searchParams.get('cursor');
    if(!uuid(kennel)||cursor?.length>2048)throw fail(400,'Invalid kennel or page');
    await membership(token,kennel,fetcher);
    return forward(await upstream('/v2/kennels/'+kennel+'/records'+(cursor?'?cursor='+encodeURIComponent(cursor):''),token,'GET',undefined,false,fetcher));
  }
  const m=/^\/api\/kennels\/([^/]+)\/(records|files)(?:\/([^/]+))?$/.exec(path);
  if(m){
    const kennel=m[1].toLowerCase(),resource=m[2],recordID=m[3]?.toLowerCase();
    if(!uuid(kennel)||!uuid(recordID))throw fail(400,'Invalid record address');
    const k=await membership(token,kennel,fetcher);
    if(resource==='records'&&method==='PUT'){
      const input=await parseJSON(request);
      if(!canWrite(k.role,input.type))throw fail(403,'Your account cannot edit this type of record');
      if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||String(input.record?.id).toLowerCase()!==recordID)throw fail(400,'Invalid record identity or revision');
      const err=validateModel(collections[input.type],input.record);if(err)throw fail(400,err);
      if(input.deletedAt!=null&&(typeof input.deletedAt!=='string'||!Number.isFinite(Date.parse(input.deletedAt))))throw fail(400,'Invalid deletion date');
      const payload={type:input.type,expectedRevision:input.expectedRevision,data:{platform:'ios',collection:input.type,record:input.record},...(input.deletedAt?{deletedAt:input.deletedAt}:{})};
      return forward(await upstream('/v2/kennels/'+kennel+'/records/'+recordID,token,'PUT',payload,false,fetcher));
    }
    if(resource==='files'&&['GET','PUT'].includes(method)){
      if(!['owner','admin'].includes(k.role))throw fail(403,'Your account cannot access documents');
      const bytes=method==='PUT'?new Uint8Array(await request.arrayBuffer()):undefined;
      if(bytes?.length>10485760)throw fail(413,'File is too large');
      const r=await upstream('/v2/kennels/'+kennel+'/files/'+recordID,token,method,bytes,true,fetcher);
      if(method==='PUT'||r.status!==200)return forward(r);
      const content=new Uint8Array(await r.arrayBuffer()),hash=r.headers.get('x-content-sha256');
      if(content.length>10485760||!hash||createHash('sha256').update(content).digest('hex')!==hash)throw fail(502,'Document integrity check failed');
      return new Response(content,{status:200,headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+recordID+'"','Cache-Control':'no-store','X-Content-SHA256':hash}});
    }
  }
  return jsonResponse(404,{error:'Not found'});
}
export async function handleDirect(request,env={},fetcher=fetch) {
  try{return await direct(request,env,fetcher)}
  catch(e){
    return jsonResponse(e.status||(e instanceof SyntaxError?400:503),{error:e.status?e.message:e instanceof SyntaxError?'Invalid JSON':'Cloud unavailable. Your unsaved form remains open.'});
  }
}
export const onRequest=({request,env})=>handleDirect(request,env);
