import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createHash} from 'node:crypto';
import {handleYardPatrolPortal} from '../functions/_lib/yardpatrol-portal.mjs';
const code='YP-ABCD-EFGH-JKLM-NPQR';
const hash=s=>createHash('sha256').update(s.replace(/[^A-Za-z0-9]/g,'').toUpperCase()).digest('hex');
async function setup(){
 const db=new PGlite();
 await db.exec(`
 CREATE TABLE yardpatrol_portals(id text PRIMARY KEY,customer_id text UNIQUE NOT NULL,access_hash text UNIQUE NOT NULL,
 snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,customer_requests jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE yardpatrol_business(business_id text PRIMARY KEY,inbox_hash text UNIQUE NOT NULL,
 owner_recovery_used boolean NOT NULL DEFAULT false,owner_code_version integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE yardpatrol_leads(id text PRIMARY KEY,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'new',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 `);
 const execute=async (_env,sql,args)=>(await db.query(sql,args)).rows;
 return {db,execute};
}
function req(group,operation,data={},method='POST',origin=''){
 const path='/yardpatrol/'+group+'/'+operation;
 return new Request('https://payments-preview.example'+path,{
 method,headers:{...(origin?{Origin:origin}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},
 body:method==='POST'?JSON.stringify(data):undefined});
}
const call=async(testdb,group,operation,data,method,origin)=>{
 const r=await handleYardPatrolPortal(req(group,operation,data,method,origin),{},group,operation,testdb.execute,async()=>true);
 return {status:r.status,body:await r.json()};
};
test('customer portal create, login and sync preserve access hash and snapshot',async()=>{
 const t=await setup();
 try{
  const created=await call(t,'portal','sync',{customerID:'demo',accessCode:code,snapshot:{dogs:2}});
  assert.equal(created.status,200);assert.equal(created.body.created,true);
  const invalid=await call(t,'portal','login',{accessCode:'INVALID'});
  assert.notEqual(invalid.status,200);
  const login=await call(t,'portal','login',{accessCode:code});
  assert.equal(login.status,200);assert.equal(login.body.snapshot.dogs,2);
  const updated=await call(t,'portal','sync',{customerID:'demo',accessCode:code,snapshot:{dogs:3}});
  assert.equal(updated.body.created,false);
  const row=(await t.db.query('SELECT access_hash FROM yardpatrol_portals')).rows[0];
  assert.equal(row.access_hash,hash(code));
  assert.equal((await call(t,'portal','login',{accessCode:code})).body.snapshot.dogs,3);
 }finally{await t.db.close()}
});
test('requests append, update status and refuse invalid codes',async()=>{
 const t=await setup();
 try{
  await call(t,'portal','sync',{customerID:'demo',accessCode:code,snapshot:{}});
  const request=await call(t,'portal','request',{accessCode:code,type:'cleanup',payload:{description:'Test'}});
  assert.equal(request.status,200);const id=request.body.request.id;
  assert.equal((await call(t,'portal','request',{accessCode:'wrong',type:'bad'})).status,400);
  const updated=await call(t,'portal','request-status',{accessCode:code,requestID:id,status:'handled'});
  assert.equal(updated.status,200);
  const login=await call(t,'portal','login',{accessCode:code});
  assert.equal(login.body.requests[0].status,'handled');
 }finally{await t.db.close()}
});
test('rotation revokes old access code and deletion requires current code',async()=>{
 const t=await setup();
 try{
  await call(t,'portal','sync',{customerID:'demo',accessCode:code,snapshot:{}});
  const rotated=await call(t,'portal','rotate',{customerID:'demo',accessCode:code});
  assert.equal(rotated.status,200);
  assert.equal((await call(t,'portal','login',{accessCode:code})).status,401);
  assert.equal((await call(t,'portal','login',{accessCode:rotated.body.accessCode})).status,200);
  assert.equal((await call(t,'portal','delete',{customerID:'demo',accessCode:code})).status,401);
  assert.equal((await call(t,'portal','delete',{customerID:'demo',accessCode:rotated.body.accessCode})).body.deleted,true);
 }finally{await t.db.close()}
});
test('inbox rejects unknown codes but supports existing owner and status edits',async()=>{
 const t=await setup();
 try{
  const bootstrap=await call(t,'inbox','sync',{inboxCode:code});
  assert.equal(bootstrap.status,200);assert.equal(bootstrap.body.created,true);
  assert.equal((await call(t,'inbox','sync',{inboxCode:'YP-AAAA-AAAA-AAAA-AAAA'})).status,401);
  assert.equal((await call(t,'inbox','leads',{inboxCode:code})).status,200);
  const lead=await call(t,'leads','create',{fullName:'Test',serviceAddress:'123 Test St',city:'Demo',state:'WV',phone:'5550000000'});
  assert.equal(lead.status,200);
  const status=await call(t,'inbox','lead-status',{inboxCode:code,id:lead.body.requestID,status:'contacted'});
  assert.equal(status.status,200);
  const inbox=await call(t,'inbox','leads',{inboxCode:code});
  assert.equal(inbox.body.leads[0].status,'contacted');
 }finally{await t.db.close()}
});
test('owner recovery refuses unverified legacy recovery tokens',async()=>{
 const t=await setup();
 try{const r=await call(t,'inbox','recover-owner',{migrationToken:'old-token'});assert.equal(r.status,503)}
 finally{await t.db.close()}
});
test('cross-origin protections prevent random website requests',async()=>{
 const t=await setup();
 try{
  assert.equal((await call(t,'portal','login',{accessCode:code},'POST','https://evil.example')).status,403);
  assert.equal((await call(t,'portal','health',{},'GET')).status,200);
 }finally{await t.db.close()}
});
test('portal sync does not overwrite existing customer without access code',async()=>{
 const t=await setup();
 try{
  await call(t,'portal','sync',{customerID:'demo',accessCode:code,snapshot:{important:true}});
  const r=await call(t,'portal','sync',{customerID:'demo',accessCode:'bad',snapshot:{important:false}});
  assert.equal(r.status,401);
  assert.equal((await call(t,'portal','login',{accessCode:code})).body.snapshot.important,true);
 }finally{await t.db.close()}
});
test('owner recovery requires new secret, rotates once and revokes existing code',async()=>{
 const t=await setup();
 try{
  await call(t,'inbox','sync',{inboxCode:code});
  const secret='TEST_ONLY_RANDOM_OWNERCODE_WITH_128bits';
  const r1=await handleYardPatrolPortal(req('inbox','recover-owner',{migrationToken:'incorrect-old-token'}),{YARDPATROL_OWNER_RECOVERY_KEY:secret},'inbox','recover-owner',t.execute,async()=>true);
  assert.equal(r1.status,401);
  const r2=await handleYardPatrolPortal(req('inbox','recover-owner',{migrationToken:secret}),{YARDPATROL_OWNER_RECOVERY_KEY:secret},'inbox','recover-owner',t.execute,async()=>true);
  assert.equal(r2.status,200);
  const body=await r2.json();assert.match(body.inboxCode,/^YP-/);
  assert.equal((await call(t,'inbox','leads',{inboxCode:code})).status,401);
  assert.equal((await call(t,'inbox','leads',{inboxCode:body.inboxCode})).status,200);
  const r3=await handleYardPatrolPortal(req('inbox','recover-owner',{migrationToken:secret}),{YARDPATROL_OWNER_RECOVERY_KEY:secret},'inbox','recover-owner',t.execute,async()=>true);
  assert.equal(r3.status,409);
 }finally{await t.db.close()}
});
test('public leads fail closed if rate limiter binding is missing',async()=>{
 const t=await setup();
 try{
  const request=req('leads','create',{fullName:'Test',serviceAddress:'123 Any St',city:'Anywhere',state:'WV',phone:'5550000000'});
  const r=await handleYardPatrolPortal(request,{},'leads','create',t.execute);
  assert.equal(r.status,503);
  assert.equal((await t.db.query('SELECT COUNT(*)::int AS n FROM yardpatrol_leads')).rows[0].n,0);
 }finally{await t.db.close()}
});
