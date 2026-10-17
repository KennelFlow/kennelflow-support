/**
 * Kennel One private employee messaging.
 * Standalone Neon Function deployed alongside the current Business API,
 * deliberately NOT replacing the active production kennelflowapi function.
 * Neon injects DATABASE_URL. Deploy with an explicit restricted role URL
 * and verify DB privilege checks before accepting live messages.
 */
import pg from 'pg';
import { createHash } from 'node:crypto';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const bearer=/^Bearer ([a-f0-9]{64})$/;
const sha256=(s)=>createHash('sha256').update(s).digest('hex');
const json=(code,data)=>Response.json(data,{status:code,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const allowedRoles=new Set(['owner','admin','staff']);

async function readBody(request,limit=6000){
 const r=request.body?.getReader();
 if(!r)return {};
 let bytes=0;
 const parts=[];
 while(true){
  const {done,value}=await r.read();
  if(done)break;
  bytes+=value.byteLength;
  if(bytes>limit){await r.cancel();throw Object.assign(new Error('Too large'),{httpStatus:413});}
  parts.push(value);
 }
 const text=Buffer.concat(parts).toString('utf8');
 try{return JSON.parse(text||'{}')}catch{throw Object.assign(new Error('Invalid JSON'),{httpStatus:400});}
}

export function createHandler(pool){
 return {async fetch(request){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')return json(200,{ok:true,service:'kennelone-private-messages'});
  const match=/^\/v2\/kennels\/([0-9a-f-]{36})\/private-messages$/.exec(url.pathname);
  if(!match||!uuid.test(match[1])||!['GET','POST'].includes(request.method))
   return json(404,{error:'Not found'});
  const token=bearer.exec(request.headers.get('authorization')||'')?.[1];
  if(!token)return json(401,{error:'Sign in required'});
  const kennel=match[1];

  let messageID,recipientEmail,content;
  if(request.method==='POST'){
   let data;
   try{data=await readBody(request)}catch(e){return json(e.httpStatus||400,{error:'Invalid message'});}
   messageID=String(data.id||'').toLowerCase();
   recipientEmail=String(data.recipientEmail||'').trim().toLowerCase();
   content=String(data.body||'').trim();
   if(!uuid.test(messageID)||!email.test(recipientEmail)||recipientEmail.length>254||
       !content||content.length>4000)
    return json(400,{error:'Provide a valid recipient, ID, and message up to 4,000 characters'});
  }

  let client,started=false;
  try{
   client=await pool.connect();
   await client.query('BEGIN');started=true;
   // Database session, never a client-supplied senderID or staff PIN, decides identity.
   const session=await client.query(
    'SELECT s.user_id FROM app_sessions s WHERE s.token_hash=$1 AND s.expires_at>now()',
    [sha256(token)]
   );
   const actor=session.rows[0]?.user_id;
   if(!actor){await client.query('ROLLBACK');started=false;return json(401,{error:'Sign in required'});}
   const member=await client.query('SELECT role FROM kennel_memberships WHERE kennel_id=$1 AND user_id=$2',[kennel,actor]);
   if(!allowedRoles.has(member.rows[0]?.role)){
    await client.query('ROLLBACK');started=false;return json(403,{error:'Access denied'});
   }
   await client.query("SELECT set_config('request.user_id',$1,true)",[actor]);
   const result=request.method==='GET'
    ? (await client.query('SELECT business_private_inbox($1) AS result',[kennel])).rows[0]?.result
    : (await client.query('SELECT business_private_send($1,$2,$3,$4) AS result',
       [kennel,messageID,recipientEmail,content])).rows[0]?.result;
   await client.query('COMMIT');started=false;
   return request.method==='GET'?json(200,{messages:result}):json(201,{message:result});
  }catch(e){
   if(client&&started)try{await client.query('ROLLBACK')}catch{}
   if(e.code==='42501')return json(403,{error:'Access denied'});
   if(e.code==='40001'||e.code==='23505')return json(409,{error:'Message conflict'});
   if(e.code==='28000')return json(401,{error:'Session expired'});
   return json(503,{error:'Secure messaging temporarily unavailable'});
  }finally{if(client)client.release();}
 }};
}

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:8000,idleTimeoutMillis:30000});
export default createHandler(pool);
