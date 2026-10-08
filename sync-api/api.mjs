import {createServer} from 'node:http';
import {randomUUID,randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import pg from 'pg';

const port = Number(process.env.PORT || 8080);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw Error('DATABASE_URL must be configured; refusing to start without persistent storage');
const pool = new pg.Pool({connectionString,ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:true},max:10});
const hash = value=>createHash('sha256').update(value).digest('hex');
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
async function body(req){let value='';for await(const chunk of req){value+=chunk;if(value.length>1048576)throw Error('Request too large');}return JSON.parse(value||'{}');}
function passwordHash(password,salt=randomBytes(16).toString('hex')){return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
function verifyPassword(password,stored){const [salt,encoded]=stored.split(':');if(!salt||!encoded)return false;const expected=Buffer.from(encoded,'hex'),actual=scryptSync(password,salt,expected.length);return expected.length===actual.length&&timingSafeEqual(expected,actual);}
async function authenticated(req){const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'')?.[1];if(!token)return null;const r=await pool.query('SELECT user_id FROM app_sessions WHERE token_hash=$1 AND expires_at>now()',[hash(token)]);return r.rows[0]?.user_id||null;}
async function scoped(userId,callback){const client=await pool.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('request.user_id',$1,true)",[userId]);const result=await callback(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
const attempts = new Map();
function allowLogin(ip) {
 const now=Date.now(), state=attempts.get(ip) || {count:0,expires:now+60000};
 if(now>state.expires){state.count=0;state.expires=now+60000;}
 state.count++;attempts.set(ip,state);
 if(attempts.size>10000) attempts.clear();
 return state.count<=10;
}
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true});
  if(req.method==='POST'&&url.pathname==='/v1/login'){
   if(!allowLogin(req.socket.remoteAddress||'unknown'))return json(res,429,{error:'Try again later'});
   const input=await body(req);const email=String(input.email||'').trim().toLowerCase(),password=String(input.password||'');
   if(!email||!password)return json(res,400,{error:'Email and password required'});
   const found=await pool.query('SELECT id,password_hash FROM app_users WHERE email=$1',[email]);
   if(!found.rows.length||!verifyPassword(password,found.rows[0].password_hash))return json(res,401,{error:'Invalid credentials'});
   const token=randomBytes(32).toString('hex');await pool.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",[hash(token),found.rows[0].id]);
   return json(res,200,{token,expiresInSeconds:2592000});
  }
  const userId=await authenticated(req);if(!userId)return json(res,401,{error:'Sign in required'});
  if(req.method==='POST'&&url.pathname==='/v1/logout'){
   const token=req.headers.authorization.slice(7);await pool.query('DELETE FROM app_sessions WHERE token_hash=$1 AND user_id=$2',[hash(token),userId]);return json(res,200,{ok:true});
  }
  if(req.method==='GET'&&url.pathname==='/v1/kennels'){
   const rows=await scoped(userId,db=>db.query('SELECT k.id,k.name,m.role FROM kennels k JOIN kennel_memberships m ON m.kennel_id=k.id WHERE m.user_id=$1 ORDER BY k.name',[userId]));return json(res,200,{kennels:rows.rows});
  }
  const match=/^\/v1\/kennels\/([0-9a-f-]{36})\/records(?:\/([0-9a-f-]{36}))?$/.exec(url.pathname);
  if(match){const kennelId=match[1],recordId=match[2];
   if(req.method==='GET'&&!recordId){const rows=await scoped(userId,db=>db.query('SELECT id,record_type AS type,schema_version,revision,payload AS data,updated_at,deleted_at FROM kennel_records WHERE kennel_id=$1 ORDER BY updated_at,id LIMIT 500',[kennelId]));return json(res,200,{records:rows.rows});}
   if(req.method==='PUT'&&recordId){const input=await body(req);if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||typeof input.type!=='string'||!input.type.trim()||!input.data||typeof input.data!=='object'||Array.isArray(input.data))return json(res,400,{error:'Invalid record'});
    const row=await scoped(userId,db=>db.query('SELECT * FROM upsert_kennel_record($1,$2,$3,$4,$5,$6::jsonb,$7)',[kennelId,recordId,input.type,1,input.expectedRevision,JSON.stringify(input.data),input.deletedAt||null]));return json(res,200,{record:row.rows[0]});}
  }
  return json(res,404,{error:'Not found'});
 }catch(error){if(error.code==='40001'||error.code==='23505')return json(res,409,{error:'Record conflict'});if(error.code==='42501')return json(res,403,{error:'Access denied'});if(error instanceof SyntaxError)return json(res,400,{error:'Invalid JSON'});if(error.message==='Request too large')return json(res,413,{error:'Request too large'});console.error('Request failed',error.code||error.message);return json(res,500,{error:'Request failed'});}
});
server.listen(port,()=>console.log(`KennelFlow sync API listening on ${port}`));
