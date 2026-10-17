import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { canManage, canRead, canWrite, validEmail, validPassword, validUUID, validateRecord, collections } from './policy.mjs';
const derive=promisify(scrypt);
export function normalizeBusinessWebsite(value) {
 const raw=String(value||'').trim();
 if(!raw)return '';
 const candidate=/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)?raw:'https://'+raw;
 let url;
 try { url=new URL(candidate); } catch { return null; }
 if(url.protocol!=='https:' || url.username || url.password ||
    !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname) || url.hostname.length>253 ||
    url.port || url.hash || /\s/.test(raw))return null;
 return url.toString();
}
export const digest=value=>createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) { const salt=randomBytes(16).toString('hex');return salt+':'+(await derive(password,salt,64)).toString('hex'); }
export async function verifyPassword(password,stored) {
 const [salt,encoded]=String(stored).split(':');
 if(!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(encoded||''))return false;
 const actual=await derive(password,salt,64);return timingSafeEqual(Buffer.from(encoded,'hex'),actual);
}
const response=(status,value)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
async function bytes(request, maximum=1048576) {
 const reader=request.body?.getReader();if(!reader)return Buffer.alloc(0);
 let total=0;const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maximum){await reader.cancel();throw Object.assign(Error('Too large'),{status:413})}chunks.push(value)}
 return Buffer.concat(chunks);
}
async function body(request) { return JSON.parse((await bytes(request)).toString('utf8')||'{}'); }
export function createAPI(repo) { return { async fetch(request) {
 try {
 const url=new URL(request.url),path=url.pathname.replace(/^\/kennelflowapi(?=\/|$)/,'');
 if(request.method==='GET'&&path==='/v2/capabilities')return response(200,{version:2,employeeAccounts:true,revisionSync:true,collections});
 if(request.method==='POST'&&path==='/v2/signup') {
  const input=await body(request),email=String(input.email||'').trim().toLowerCase();
  if(!validEmail(email)||!validPassword(input.password)||typeof input.name!=='string'||!input.name.trim()||input.name.length>120||typeof input.kennelName!=='string'||!input.kennelName.trim()||input.kennelName.length>120)return response(400,{error:'Name, business name, valid email and password of at least 16 characters required'});
  if(!await repo.allowLogin('global')||!await repo.allowLogin(digest(email)))return response(429,{error:'Try again later'});
  await repo.createOwner(email,await hashPassword(input.password),input.name.trim(),input.kennelName.trim(),randomUUID(),randomUUID());
  return response(201,{ok:true});
 }
 if(request.method==='POST'&&path==='/v2/login') {
  const input=await body(request),email=String(input.email||'').trim().toLowerCase(),password=input.password;
  if(!validEmail(email)||typeof password!=='string'||!password.length||password.length>256)return response(400,{error:'Email and password required'});
  if(!await repo.allowLogin('global')||!await repo.allowLogin(digest(email)))return response(429,{error:'Try again later'});
  const user=await repo.account(email);
  const dummy='00000000000000000000000000000000:'+('00'.repeat(64));
  if(!await verifyPassword(password,user?.password_hash||dummy)||!user)return response(401,{error:'Invalid credentials'});
  const token=randomBytes(32).toString('hex');await repo.issueSession(user.id,digest(token));return response(200,{token});
 }
 if(request.method==='POST'&&path==='/v2/invitations/accept') {
  const input=await body(request),email=String(input.email||'').trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(input.token||'')||!validEmail(email)||!validPassword(input.password)||typeof input.name!=='string'||!input.name.trim()||input.name.length>120)return response(400,{error:'Valid invitation, email, name and password of 16–256 characters required'});
  if(!await repo.allowLogin('global')||!await repo.allowLogin(digest(email)))return response(429,{error:'Try again later'});
  const existing=await repo.account(email);
  if(existing&&!await verifyPassword(input.password,existing.password_hash))return response(401,{error:'Use your existing account password'});
  const stored=existing?.password_hash||await hashPassword(input.password);
  await repo.acceptInvite(digest(input.token),email,stored,input.name.trim(),randomUUID());
  return response(200,{ok:true});
 }
 const token=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization')||'')?.[1];
 const actor=token?await repo.session(digest(token)):null;
 if(!actor)return response(401,{error:'Sign in required'});
 actor.tokenHash=digest(token);
 if(request.method==='POST'&&path==='/v2/password') {
  const input=await body(request);
  if(!validPassword(input.newPassword)||typeof input.currentPassword!=='string'||input.currentPassword.length>256)return response(400,{error:'Valid passwords required'});
  if(!await repo.allowLogin(digest(actor.email)))return response(429,{error:'Try again later'});
  const account=await repo.account(actor.email);
  if(!account||!await verifyPassword(input.currentPassword,account.password_hash))return response(401,{error:'Password could not be verified'});
  await repo.changePassword(actor,await hashPassword(input.newPassword));return response(200,{ok:true});
 }
 if(request.method==='PATCH'&&path==='/v2/business-profile') {
  const input=await body(request),kennel=String(input.kennelID||'').toLowerCase();
  const profile={
   expectedEmail:String(input.expectedEmail||'').trim().toLowerCase(),
   expectedBusinessName:String(input.expectedBusinessName||''),
   email:String(input.email||'').trim().toLowerCase(),
   ownerName:String(input.ownerName||'').trim(),
   businessName:String(input.businessName||'').trim(),
   phone:String(input.phone||'').trim(),
   address:String(input.address||'').trim(),
   website:String(input.website||'').trim()
  };
  profile.website=normalizeBusinessWebsite(profile.website);
  if(profile.website===null)return response(400,{error:'Enter a valid website address (example: www.yourbusiness.com)'});
  if(!validUUID(kennel)||!validEmail(profile.email)||!validEmail(profile.expectedEmail)||
     !profile.ownerName||profile.ownerName.length>120||!profile.businessName||profile.businessName.length>120||
     profile.expectedBusinessName.length>120||profile.phone.length>40||profile.address.length>500||
     profile.website.length>250||(/[^0-9()+. x-]/.test(profile.phone))||
     (profile.website&&!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(profile.website)))
     return response(400,{error:'Check business name, owner name, email and contact details'});
  if((await repo.kennels(actor)).find(k=>k.id===kennel)?.role!=='owner')return response(403,{error:'Only the business owner can edit this account'});
  if(profile.email!==actor.email) {
   if(typeof input.currentPassword!=='string'||input.currentPassword.length>256||!input.currentPassword.length)
    return response(400,{error:'Current password required to change login email'});
   if(!await repo.allowLogin(digest(actor.email)))return response(429,{error:'Try again later'});
   const account=await repo.account(actor.email);
   if(!account||!await verifyPassword(input.currentPassword,account.password_hash))
    return response(401,{error:'Current password incorrect'});
  }
  await repo.updateProfile(actor,kennel,profile);
  const updated=await repo.session(actor.tokenHash);updated.tokenHash=actor.tokenHash;
  return response(200,{ok:true,user:{id:updated.id,email:updated.email,name:updated.name},kennels:await repo.kennels(updated)});
 }
 if(request.method==='POST'&&path==='/v2/logout'){await repo.logout(actor);return response(200,{ok:true})}
 if(request.method==='GET'&&path==='/v2/me')return response(200,{user:{id:actor.id,email:actor.email,name:actor.name},kennels:await repo.kennels(actor)});
 const match=/^\/v2\/kennels\/([a-f0-9-]{36})\/(members|invitations|records|files|history|clock|private-messages)(?:\/([a-f0-9-]{36}))?$/.exec(path);
 if(!match||!validUUID(match[1]))return response(404,{error:'Not found'});
 const kennel=match[1],resource=match[2],id=match[3];
 const membership=(await repo.kennels(actor)).find(k=>k.id===kennel);
 if(!membership)return response(403,{error:'Access denied'});
 const role=membership.role;
 if(resource==='private-messages'&&!id&&['GET','POST'].includes(request.method)){
  if(!['owner','admin','staff'].includes(role))return response(403,{error:'Access denied'});
  if(request.method==='GET')return response(200,{messages:await repo.privateInbox(actor,kennel)});
  const input=await body(request);
  const messageID=String(input.id||'').toLowerCase();
  const recipientEmail=String(input.recipientEmail||'').trim().toLowerCase();
  const content=String(input.body||'').trim();
  if(!validUUID(messageID)||!validEmail(recipientEmail)||content.length<1||content.length>4000)
   return response(400,{error:'Provide a valid recipient and message up to 4000 characters'});
  return response(201,{message:await repo.privateSend(actor,kennel,messageID,recipientEmail,content)});
 }
 if(resource==='history'&&request.method==='GET'&&!id){
  const before=url.searchParams.get('before');if(before&&!/^[1-9][0-9]{0,17}$/.test(before))return response(400,{error:'Invalid history cursor'});
  const rows=await repo.history(actor,kennel,before||null),page=rows.slice(0,100);
  return response(200,{events:page,nextCursor:rows.length>100?String(page.at(-1).id):null});
 }
 if(resource==='clock'&&!id&&['GET','POST'].includes(request.method)){
  if(!['owner','admin','staff'].includes(role))return response(403,{error:'Access denied'});
  const action=request.method==='GET'?'status':(await body(request)).action;
  if(!['status','in','out'].includes(action))return response(400,{error:'Choose clock in or clock out'});
  return response(200,await repo.clock(actor,kennel,action));
 }
 if(resource==='invitations'&&['GET','DELETE'].includes(request.method)){
  if(!['owner','admin'].includes(role))return response(403,{error:'Access denied'});
  if(request.method==='GET'&&!id)return response(200,{invitations:await repo.invitations(actor,kennel)});
  if(request.method==='DELETE'&&validUUID(id)){await repo.revokeInvite(actor,kennel,id);return response(200,{ok:true})}
 }
 if(resource==='files'&&validUUID(id)) {
  if(!['owner','admin'].includes(role))return response(403,{error:'Access denied'});
  if(request.method==='GET') {
   const file=await repo.file(actor,kennel,id);
   if(!file)return response(404,{error:'File not found'});
   return new Response(file.bytes,{status:200,headers:{'content-type':'application/octet-stream','cache-control':'no-store','x-content-sha256':file.sha256}});
  }
  if(request.method==='PUT') {
   const content=await bytes(request,10485760),hash=digest(content);
   if(request.headers.get('x-content-sha256')!==hash)return response(400,{error:'File checksum mismatch'});
   // Files are immutable. A replacement must use a new document record ID.
   await repo.putFile(actor,kennel,id,content,hash);
   return response(200,{ok:true,sha256:hash});
  }
 }
 if(resource==='members'){
  if(!['owner','admin'].includes(role))return response(403,{error:'Access denied'});
  if(request.method==='GET'&&!id)return response(200,{members:await repo.members(actor,kennel)});
  if(request.method==='PATCH'&&validUUID(id)){
   const input=await body(request),members=await repo.members(actor,kennel),target=members.find(m=>m.id===id);
   if(!target||!canManage(role,target.role,input.role)||typeof input.remove!=='boolean')return response(403,{error:'Access denied'});
   await repo.changeMember(actor,kennel,id,input.role,input.remove);return response(200,{ok:true});
  }
 }
 if(resource==='invitations'&&request.method==='POST'&&!id){
  const input=await body(request),email=String(input.email||'').trim().toLowerCase();
  if(!validEmail(email)||!canManage(role,'staff',input.role))return response(403,{error:'Access denied or invalid invitation'});
  const invite=randomBytes(32).toString('hex');await repo.invite(actor,kennel,email,input.role,digest(invite));
  return response(201,{token:invite,email,role:input.role,expiresInSeconds:172800});
 }
 if(resource==='records'){
  if(request.method==='GET'&&!id){
   const cursor=url.searchParams.get('cursor');let after=null;
   if(cursor){try{after=JSON.parse(Buffer.from(cursor,'base64url').toString());if(!validUUID(after.id)||!Number.isFinite(Date.parse(after.at)))throw Error()}catch{return response(400,{error:'Invalid cursor'})}}
   const rows=await repo.records(actor,kennel,after,201);
   const page=rows.slice(0,200).filter(row=>canRead(role,['dog','android.Dogs'].includes(row.type)?'dogs':row.type) && (!['employeeActivity','staffTimeEntries','kennelCareSessions'].includes(row.type) || ['owner','admin'].includes(role) || String(row.data?.record?.staffID).toLowerCase()===actor.id));
   const last=rows[Math.min(rows.length,200)-1];
   return response(200,{records:page,nextCursor:rows.length>200?Buffer.from(JSON.stringify({at:last.updated_at,id:last.id})).toString('base64url'):null});
  }
  if(request.method==='PUT'&&validUUID(id)){
   const input=await body(request);
   if(!validateRecord(input,id))return response(400,{error:'Invalid record identity or revision'});
   if(!canWrite(role,input.type))return response(403,{error:'Access denied'});
   if(input.type==='maintenanceRecords' && !validUUID(input.data.record.kennelID))return response(400,{error:'Maintenance record requires its kennel area ID'});
   if(input.type==='staffTimeEntries'){
    const record=input.data.record,start=Date.parse(record.clockIn),end=record.clockOut==null?null:Date.parse(record.clockOut);
    if(!validUUID(record.staffID)||!Number.isFinite(start)||(end!==null&&(!Number.isFinite(end)||end<start)))return response(400,{error:'Valid employee and chronological clock times required'});
   }
   if(role==='staff'&&input.type==='kennelCareSessions'){
    if(String(input.data.record.staffID).toLowerCase()!==actor.id)return response(403,{error:'Cannot attribute care to another employee'});
    input.data.record.staffID=actor.id;
    input.data.record.staffName=actor.name||actor.email;
   }
   return response(200,{record:await repo.putRecord(actor,kennel,id,input)});
  }
 }
 return response(404,{error:'Not found'});
 }catch(e){
  if(e.code==='23514')return response(400,{error:'Check clock times and close the existing open entry before adding another'});
  if(e.status===413)return response(413,{error:'Request too large'});
  if(e instanceof SyntaxError)return response(400,{error:'Invalid JSON'});
  if(e.code==='40001'||e.code==='23505')return response(409,{error:'Conflict; refresh before retrying'});
  if(e.code==='42501')return response(403,{error:'Access denied or invitation expired'});
  if(e.code==='28000')return response(401,{error:'Session expired'});
  return response(503,{error:'Business service unavailable'});
 }
 }}; }
