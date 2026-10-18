// Yard Patrol customer portal migration, staged for Cloudflare Pages.
// Requires a secret YARDPATROL_DATABASE_URL for the dedicated Neon
// yardpatrol_portal database, not Kennel One's main production database.
// No production routing until live service checks, authentication and
// rollback procedures are verified.
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const businessID='yardpatrol-v2';
const failure=(status,message)=>Object.assign(new Error(message),{status});
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const str=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
const normalize=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const validCode=v=>{const n=normalize(v);return n.length>=18&&n.length<=32};
const codeHash=v=>createHash('sha256').update(normalize(v)).digest('hex');
const id=()=>crypto.randomUUID();
function newCode() {
 const buf=randomBytes(32),chars=[];
 for(let i=0;i<16;i++)chars.push(alphabet[buf[i]%alphabet.length]);
 return 'YP-'+chars.slice(0,4).join('')+'-'+chars.slice(4,8).join('')+'-'+chars.slice(8,12).join('')+'-'+chars.slice(12,16).join('');
}
export async function neonQuery(env,query,values){
 if(!env.YARDPATROL_DATABASE_URL)throw failure(503,'Yard Patrol customer portal is not configured');
 const {neon}=await import('@neondatabase/serverless');
 const sql=neon(env.YARDPATROL_DATABASE_URL);
 return sql.query(query,values||[]);
}
const portalByCode=async(query,code,fields)=>{
 if(!validCode(code))throw failure(400,'Valid Yard Patrol access code required');
 const rows=await query('SELECT '+fields+' FROM public.yardpatrol_portals WHERE access_hash=$1 LIMIT 1',[codeHash(code)]);
 if(!rows.length)throw failure(401,'That Yard Patrol access code was not recognized');
 return rows[0];
};
const inboxByCode=async(query,code)=>{
 if(!validCode(code))throw failure(401,'The Yard Patrol inbox code was not recognized');
 const rows=await query('SELECT business_id FROM public.yardpatrol_business WHERE business_id=$1 AND inbox_hash=$2 LIMIT 1',[businessID,codeHash(code)]);
 if(!rows.length)throw failure(401,'The Yard Patrol inbox code was not recognized');
 return true;
};
async function portal(operation,input,query) {
 const customerID=str(input.customerID,80),accessCode=input.accessCode;
 if(operation==='health'){await query('SELECT 1 AS healthy',[]);return {ok:true,database:true,capabilityAccess:true}}
 if(operation==='sync'){
  if(!customerID||!input.snapshot||typeof input.snapshot!=='object'||Array.isArray(input.snapshot))throw failure(400,'A valid customerID and snapshot are required');
  if(JSON.stringify(input.snapshot).length>250000)throw failure(413,'Snapshot too large');
  const found=await query('SELECT id,access_hash FROM public.yardpatrol_portals WHERE customer_id=$1',[customerID]);
  if(found.length){
   if(!validCode(accessCode)||found[0].access_hash!==codeHash(accessCode))throw failure(401,'The customer portal access code does not match');
   await query('UPDATE public.yardpatrol_portals SET snapshot=$2::jsonb,updated_at=NOW() WHERE customer_id=$1',[customerID,JSON.stringify(input.snapshot)]);
   return {ok:true,created:false,customerID};
  }
  const code=validCode(accessCode)?String(accessCode):newCode();
  const rows=await query('INSERT INTO public.yardpatrol_portals(id,customer_id,access_hash,snapshot) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(customer_id) DO NOTHING RETURNING id',[id(),customerID,codeHash(code),JSON.stringify(input.snapshot)]);
  if(!rows.length)throw failure(409,'A portal already exists for this customer. Retry using its access code');
  return {ok:true,created:true,customerID,accessCode:code};
 }
 if(operation==='rotate'){
  if(!customerID||!validCode(accessCode))throw failure(400,'Customer ID and current access code required');
  const fresh=newCode();
  const rows=await query('UPDATE public.yardpatrol_portals SET access_hash=$3,updated_at=NOW() WHERE customer_id=$1 AND access_hash=$2 RETURNING id',[customerID,codeHash(accessCode),codeHash(fresh)]);
  if(!rows.length)throw failure(401,'The customer portal access code does not match');
  return {ok:true,customerID,accessCode:fresh};
 }
 if(operation==='delete'){
  if(!customerID||!validCode(accessCode))throw failure(400,'Customer ID and access code required');
  const rows=await query('DELETE FROM public.yardpatrol_portals WHERE customer_id=$1 AND access_hash=$2 RETURNING id',[customerID,codeHash(accessCode)]);
  if(!rows.length)throw failure(401,'The customer portal access code does not match');
  return {ok:true,deleted:true};
 }
 if(operation==='login'){
  const row=await portalByCode(query,accessCode,'customer_id,snapshot,customer_requests,updated_at');
  return {ok:true,customerID:row.customer_id,snapshot:row.snapshot||{},requests:Array.isArray(row.customer_requests)?row.customer_requests:[],updatedAt:row.updated_at};
 }
 if(operation==='request'){
  if(!str(input.type,60))throw failure(400,'Valid request type required');
  const payload=input.payload&&typeof input.payload==='object'&&!Array.isArray(input.payload)?input.payload:{};
  if(JSON.stringify(payload).length>16000)throw failure(413,'Request is too large');
  const item={id:id(),type:str(input.type,60),payload,status:'pending',createdAt:new Date().toISOString()};
  if(!validCode(accessCode))throw failure(400,'Valid access code required');
  const rows=await query(`UPDATE public.yardpatrol_portals
   SET customer_requests=(CASE WHEN jsonb_array_length(COALESCE(customer_requests,'[]'::jsonb))>=100 THEN
      (SELECT COALESCE(jsonb_agg(value),'[]'::jsonb) FROM (SELECT value FROM jsonb_array_elements(customer_requests) WITH ORDINALITY AS x(value,n) ORDER BY n DESC LIMIT 99) y)
      ELSE COALESCE(customer_requests,'[]'::jsonb) END) || $2::jsonb,updated_at=NOW()
   WHERE access_hash=$1 RETURNING id`,[codeHash(accessCode),JSON.stringify([item])]);
  if(!rows.length)throw failure(401,'That Yard Patrol access code was not recognized');
  return {ok:true,request:item};
 }
 if(operation==='request-status'){
  const requestID=str(input.requestID,80),status=str(input.status,20).toLowerCase();
  if(!validCode(accessCode)||!requestID||!['pending','handled','declined'].includes(status))throw failure(400,'Valid code, request ID and status required');
  const rows=await query(`UPDATE public.yardpatrol_portals SET customer_requests=(
    SELECT COALESCE(jsonb_agg(CASE WHEN x->>'id'=$2 THEN jsonb_set(jsonb_set(x,'{status}',to_jsonb($3::text)),'{updatedAt}',to_jsonb(NOW()::text)) ELSE x END),'[]'::jsonb)
    FROM jsonb_array_elements(customer_requests) AS x
   ),updated_at=NOW() WHERE access_hash=$1 AND customer_requests @> $4::jsonb RETURNING id`,
  [codeHash(accessCode),requestID,status,JSON.stringify([{id:requestID}])]);
  if(!rows.length)throw failure(404,'Customer request was not found or access code did not match');
  return {ok:true,status};
 }
 throw failure(404,'Unknown portal operation');
}
async function inbox(operation,input,query,configuration={}){
 const supplied=input.inboxCode;
 if(operation==='recover-owner'){
  // Never reuse the old publicly hard-coded legacy recovery token hashes.
  // A new random recovery key must be installed as a server-side secret.
  // Recovery is one-shot, atomically revokes old codes and cannot be replayed.
  const key=configuration.ownerRecoveryKey,supplied=str(input.migrationToken,256);
  if(!key)throw failure(503,'Owner recovery is not configured');
  if(supplied.length<32||Buffer.byteLength(supplied)!==Buffer.byteLength(key)||
     !timingSafeEqual(Buffer.from(supplied),Buffer.from(key)))
    throw failure(401,'Owner recovery was not authorized');
  const fresh=newCode();
  const rows=await query('UPDATE public.yardpatrol_business SET inbox_hash=$2,owner_recovery_used=TRUE,owner_code_version=owner_code_version+1,updated_at=NOW() WHERE business_id=$1 AND owner_recovery_used=FALSE RETURNING business_id',[businessID,codeHash(fresh)]);
  if(!rows.length)throw failure(409,'Owner recovery has already been used or the inbox does not exist');
  return {ok:true,inboxCode:fresh};
 }
 if(operation==='sync'){
  if(!validCode(supplied))throw failure(401,'The Yard Patrol inbox code does not match');
  const found=await query('SELECT inbox_hash FROM public.yardpatrol_business WHERE business_id=$1',[businessID]);
  if(found.length){
   if(found[0].inbox_hash!==codeHash(supplied))throw failure(401,'The Yard Patrol inbox code does not match');
   return {ok:true,created:false};
  }
  const rows=await query('INSERT INTO public.yardpatrol_business(business_id,inbox_hash) VALUES($1,$2) ON CONFLICT(business_id) DO NOTHING RETURNING business_id',[businessID,codeHash(supplied)]);
  if(!rows.length)throw failure(409,'Inbox was concurrently created; sign in with current code');
  return {ok:true,created:true,inboxCode:supplied};
 }
 await inboxByCode(query,supplied);
 if(operation==='leads'){
  const leads=await query('SELECT id,payload,status,created_at,updated_at FROM public.yardpatrol_leads ORDER BY created_at DESC LIMIT 250',[]);
  return {ok:true,leads};
 }
 if(operation==='lead-status'){
  const leadID=str(input.id,80),status=str(input.status,20).toLowerCase();
  if(!leadID||!['new','contacted','approved','declined'].includes(status))throw failure(400,'Valid request ID and status required');
  const rows=await query('UPDATE public.yardpatrol_leads SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING id',[leadID,status]);
  if(!rows.length)throw failure(404,'Service request was not found');
  return {ok:true,status};
 }
 throw failure(404,'Unknown inbox operation');
}
async function lead(input,query){
 const keys=['fullName','serviceAddress','city','state','zip','phone','email','plan','notes','source'],limits=[120,180,80,40,20,40,254,60,1200,80];
 const payload=Object.fromEntries(keys.map((k,i)=>[k,str(input[k],limits[i])]));
 const dogCount=Number.parseInt(input.dogCount,10);payload.dogCount=Math.max(1,Math.min(20,Number.isInteger(dogCount)?dogCount:1));
 if(!payload.fullName||!payload.serviceAddress||!payload.city||!payload.state||(!payload.phone&&!payload.email))throw failure(400,'Name, address, city, state and contact required');
 if(payload.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email))throw failure(400,'Invalid email');
 payload.source=payload.source||'Yard Patrol';
 const requestID=id();
 await query('INSERT INTO public.yardpatrol_leads(id,payload,status) VALUES($1,$2::jsonb,$3)',[requestID,JSON.stringify(payload),'new']);
 return {ok:true,requestID};
}
export async function checkLeadLimit(request,env){
 if(!env.EVENTS)throw failure(503,'Lead rate limiter is not configured');
 const clientIP=request.headers.get('CF-Connecting-IP')||'';
 if(!clientIP||clientIP.length>64)throw failure(503,'Unable to verify request origin');
 const bucket=Math.floor(Date.now()/3600000);
 const digest=createHash('sha256').update('YardPatrol lead throttle v1:'+clientIP+':'+bucket).digest('hex');
 const r=await env.EVENTS.prepare(
   'INSERT INTO yardpatrol_lead_limits (client_hash,hour_bucket,requests) VALUES (?,?,1) ON CONFLICT(client_hash,hour_bucket) DO UPDATE SET requests=yardpatrol_lead_limits.requests+1 WHERE yardpatrol_lead_limits.requests < 8 RETURNING requests'
 ).bind(digest,bucket).first();
 if(!r)throw failure(429,'Too many service requests. Please try again later');
 return true;
}
export async function handleYardPatrolPortal(request,env={},group,operation,execute=neonQuery,limitLead=checkLeadLimit){
 const origin=request.headers.get('Origin')||'';
 if(origin&&!['https://yardpatrol.app','https://www.yardpatrol.app'].includes(origin))return reply({error:'Origin not allowed'},403);
 if(group==='portal'&&operation==='health'&&request.method==='GET'){
  try{return reply(await portal('health',{},(q,v)=>execute(env,q,v)))}catch(e){return reply({ok:false,error:'Customer portal database unavailable'},503)}
 }
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return reply({error:'JSON required'},415);
 if(Number(request.headers.get('Content-Length')||0)>300000)return reply({error:'Request too large'},413);
 try{
  const raw=await request.text();if(raw.length>300000)throw failure(413,'Request too large');
  const input=JSON.parse(raw);if(!input||typeof input!=='object'||Array.isArray(input))throw failure(400,'JSON object required');
  const query=(q,v)=>execute(env,q,v);
  if(group==='portal')return reply(await portal(operation,input,query));
  if(group==='inbox')return reply(await inbox(operation,input,query,{ownerRecoveryKey:env.YARDPATROL_OWNER_RECOVERY_KEY||''}));
  if(group==='leads'&&operation==='create'){await limitLead(request,env);return reply(await lead(input,query));}
  throw failure(404,'Unknown operation');
 }catch(e){return reply({error:e.status?e.message:'Yard Patrol portal is temporarily unavailable'},e.status||503)}
}
