import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
let db;
const uuid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const kennel=uuid(1),other=uuid(2),owner=uuid(10),admin=uuid(11),staff=uuid(12),viewer=uuid(13);
async function as(user,fn){await db.exec('SET ROLE kennelflow_api');try{await db.query("SELECT set_config('request.user_id',$1,false)",[user||'']);return await fn()}finally{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.user_id','',false)")}}
const payload=(id,staffID=staff)=>JSON.stringify({platform:'ios',collection:'kennelCareSessions',record:{id,staffID,staffName:'Employee'}});
before(async()=>{
 db=await PGlite.create();await db.exec('CREATE ROLE kennelflow_api NOSUPERUSER NOBYPASSRLS');
 for(const name of ['001_kennelflow.sql','002_revision_sync.sql','003_security_hardening.sql','004_auth.sql','005_access_control.sql','006_password_reset.sql','007_business.sql','008_files.sql','009_employees.sql'])await db.exec(await readFile(new URL('../schema/'+name,import.meta.url),'utf8'));
 await db.exec(`GRANT USAGE ON SCHEMA public TO kennelflow_api;
 GRANT SELECT ON kennels,kennel_memberships,app_users TO kennelflow_api;
 GRANT SELECT,INSERT,UPDATE ON kennel_records,kennel_attachments TO kennelflow_api;
 GRANT SELECT,INSERT,DELETE ON app_sessions TO kennelflow_api;
 GRANT EXECUTE ON FUNCTION kennelflow_can_access(uuid,boolean),upsert_kennel_record(uuid,uuid,text,integer,bigint,jsonb,timestamptz) TO kennelflow_api;`);
 await db.query('INSERT INTO kennels(id,name) VALUES($1,$2),($3,$4)',[kennel,'One',other,'Other']);
 for(const [id,role] of [[owner,'owner'],[admin,'admin'],[staff,'staff'],[viewer,'viewer']]){
  await db.query('INSERT INTO app_users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)',[id,role+'@example.com','existing-hash',role]);
  await db.query('INSERT INTO kennel_memberships(kennel_id,user_id,role) VALUES($1,$2,$3)',[kennel,id,role]);
 }
 await db.query("INSERT INTO kennel_records(id,kennel_id,record_type,payload) VALUES($1,$2,'expenses','{}'),($3,$2,'tasks','{}'),($4,$5,'dogs','{}'),($6,$2,'kennelCareSessions',$7::jsonb)",[uuid(20),kennel,uuid(21),uuid(22),other,uuid(23),payload(uuid(23),owner)]);
});
after(async()=>{await db?.close()});
test('migration can be reapplied without destroying data',async()=>{await db.exec(await readFile(new URL('../schema/007_business.sql',import.meta.url),'utf8'));assert.equal((await db.query('SELECT count(*)::int AS n FROM kennel_records')).rows[0].n,4)});
test('anonymous identity sees zero records through restricted role',async()=>{assert.equal(await as(null,async()=>(await db.query('SELECT count(*)::int AS n FROM kennel_records')).rows[0].n),0)});
test('employee SQL access hides financial, cross-kennel and other employee history',async()=>{const ids=await as(staff,async()=>(await db.query('SELECT id FROM kennel_records')).rows.map(r=>r.id));assert.deepEqual(ids,[uuid(21)])});
test('owner SQL access is still limited to own kennel',async()=>{const ids=await as(owner,async()=>(await db.query('SELECT id FROM kennel_records')).rows.map(r=>r.id));assert.equal(ids.includes(uuid(22)),false);assert.equal(ids.includes(uuid(20)),true)});
test('viewer SQL writes are denied',async()=>{await assert.rejects(as(viewer,()=>db.query("SELECT * FROM upsert_kennel_record($1,$2,'tasks',1,0,'{}',NULL)",[kennel,uuid(24)])),e=>e.code==='42501')});
test('staff SQL cannot create financial records',async()=>{await assert.rejects(as(staff,()=>db.query("SELECT * FROM upsert_kennel_record($1,$2,'expenses',1,0,'{}',NULL)",[kennel,uuid(25)])),e=>e.code==='42501')});
test('staff SQL cannot impersonate another employee',async()=>{await assert.rejects(as(staff,()=>db.query("SELECT * FROM upsert_kennel_record($1,$2,'kennelCareSessions',1,0,$3::jsonb,NULL)",[kennel,uuid(26),payload(uuid(26),owner)])),e=>e.code==='42501')});
test('revision conflicts reject stale updates and support tombstones',async()=>{
 await as(staff,()=>db.query("SELECT * FROM upsert_kennel_record($1,$2,'tasks',1,0,'{}',NULL)",[kennel,uuid(27)]));
 await as(staff,()=>db.query("SELECT * FROM upsert_kennel_record($1,$2,'tasks',1,1,'{}',NULL)",[kennel,uuid(27)]));
 await assert.rejects(as(staff,()=>db.query("SELECT * FROM upsert_kennel_record($1,$2,'tasks',1,1,'{}',NULL)",[kennel,uuid(27)])),e=>e.code==='40001');
 const r=await as(staff,()=>db.query("SELECT * FROM upsert_kennel_record($1,$2,'tasks',1,2,'{}',now())",[kennel,uuid(27)]));assert.equal(Number(r.rows[0].revision),3);assert.ok(r.rows[0].deleted_at);
});
test('admin SQL cannot create admin invitation',async()=>{await assert.rejects(as(admin,()=>db.query('SELECT business_invite($1,$2,$3,$4)',[kennel,'newadmin@example.com','admin','a'.repeat(64)])),e=>e.code==='42501')});
test('owner invitation accepts exactly once and cannot reset existing password',async()=>{
 const hash='b'.repeat(64);await as(owner,()=>db.query('SELECT business_invite($1,$2,$3,$4)',[kennel,'new@example.com','staff',hash]));
 await db.query('SELECT business_accept($1,$2,$3,$4,$5)',[hash,'new@example.com','new-hash','New',uuid(30)]);
 await assert.rejects(db.query('SELECT business_accept($1,$2,$3,$4,$5)',[hash,'new@example.com','changed-hash','New',uuid(31)]),e=>e.code==='42501');
 const stored=(await db.query('SELECT password_hash FROM app_users WHERE id=$1',[uuid(30)])).rows[0].password_hash;assert.equal(stored,'new-hash');
});
test('invitation cannot be claimed for another email',async()=>{
 const hash='c'.repeat(64);await as(owner,()=>db.query('SELECT business_invite($1,$2,$3,$4)',[kennel,'intended@example.com','viewer',hash]));
 await assert.rejects(db.query('SELECT business_accept($1,$2,$3,$4,$5)',[hash,'wrong@example.com','hash','Wrong',uuid(32)]),e=>e.code==='42501');
});
test('revocation ends sessions and removes SQL data access',async()=>{
 await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",['d'.repeat(64),uuid(30)]);
 await as(owner,()=>db.query('SELECT business_change_member($1,$2,$3,true)',[kennel,uuid(30),'staff']));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM app_sessions WHERE user_id=$1',[uuid(30)])).rows[0].n,0);
 assert.equal(await as(uuid(30),async()=>(await db.query('SELECT count(*)::int AS n FROM kennel_records')).rows[0].n),0);
});
test('admin cannot demote owner through SQL functions',async()=>{await assert.rejects(as(admin,()=>db.query('SELECT business_change_member($1,$2,$3,false)',[kennel,owner,'staff'])),e=>e.code==='42501')});

test('files require live authorized document records',async()=>{
 const doc=uuid(40);await db.query("INSERT INTO kennel_records(id,kennel_id,record_type,payload) VALUES($1,$2,'documents','{}')",[doc,kennel]);
 await as(owner,()=>db.query("INSERT INTO business_files(kennel_id,record_id,bytes,sha256) VALUES($1,$2,$3,$4)",[kennel,doc,new Uint8Array([1,2,3]),'a'.repeat(64)]));
 assert.equal(await as(staff,async()=>(await db.query('SELECT count(*)::int AS n FROM business_files')).rows[0].n),0);
 assert.equal(await as(owner,async()=>(await db.query('SELECT count(*)::int AS n FROM business_files')).rows[0].n),1);
 await db.query('UPDATE kennel_records SET deleted_at=now() WHERE id=$1',[doc]);
 assert.equal(await as(owner,async()=>(await db.query('SELECT count(*)::int AS n FROM business_files')).rows[0].n),0);
});

test('owner signup creates isolated kennel and cannot claim an existing email',async()=>{
 await as(null,()=>db.query('SELECT business_create_kennel($1,$2,$3,$4,$5,$6)',['fresh@example.com','hash','Fresh Owner','New Kennel',uuid(50),uuid(51)]));
 const row=(await db.query('SELECT role FROM kennel_memberships WHERE kennel_id=$1 AND user_id=$2',[uuid(51),uuid(50)])).rows[0];assert.equal(row.role,'owner');
 await assert.rejects(as(null,()=>db.query('SELECT business_create_kennel($1,$2,$3,$4,$5,$6)',['fresh@example.com','replacement','Attacker','Other',uuid(52),uuid(53)])),e=>e.code==='23505');
});
test('password change is self-only and invalidates prior sessions',async()=>{
 await db.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",['e'.repeat(64),viewer]);
 await assert.rejects(as(staff,()=>db.query('SELECT business_password($1,$2)',[viewer,'new-hash'])),e=>e.code==='42501');
 await as(viewer,()=>db.query('SELECT business_password($1,$2)',[viewer,'new-hash']));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM app_sessions WHERE user_id=$1',[viewer])).rows[0].n,0);
});

test('clock is self-only, idempotent and readable through native record sync',async()=>{
 const clock=action=>as(staff,async()=>(await db.query('SELECT business_clock($1,$2) AS result',[kennel,action])).rows[0].result);
 const started=(await clock('in')).record;assert.equal(started.data.record.staffID,staff);assert.equal(started.data.record.staffName,'staff');assert.match(started.data.record.clockIn,/Z$/);
 assert.equal((await clock('in')).record.id,started.id);
 await assert.rejects(as(owner,()=>db.query("SELECT * FROM upsert_kennel_record($1,$2,'staffTimeEntries',1,0,$3::jsonb,NULL)",[kennel,uuid(73),JSON.stringify({...started.data,record:{...started.data.record,id:uuid(73)}})])),e=>e.code==='23514');
 assert.equal((await clock('status')).record.id,started.id);
 const native=await as(staff,()=>db.query('SELECT * FROM kennel_records WHERE id=$1',[started.id]));assert.equal(native.rows.length,1);
 const stopped=(await clock('out')).record;assert.equal(Number(stopped.revision),2);assert.ok(stopped.data.record.clockOut);assert.equal((await clock('status')).record,null);assert.equal((await clock('out')).record,null);
 await assert.rejects(as(viewer,()=>db.query('SELECT business_clock($1,$2)',[kennel,'in'])),e=>e.code==='42501');
 await assert.rejects(as(staff,()=>db.query('SELECT business_clock($1,$2)',[other,'in'])),e=>e.code==='42501');
 await assert.rejects(as(staff,()=>db.query("SELECT * FROM upsert_kennel_record($1,$2,'staffTimeEntries',1,2,$3::jsonb,NULL)",[kennel,started.id,JSON.stringify({...stopped.data,record:{...stopped.data.record,staffID:owner}})])),e=>['42501','40001'].includes(e.code));
});
test('history attributes verified actor and survives deletion without exposing team history to staff',async()=>{
 const ident=uuid(71),data=JSON.stringify({record:{id:ident,title:'Clean kennel',staffName:'Fake owner'}});
 await as(staff,()=>db.query("SELECT * FROM upsert_kennel_record($1,$2,'tasks',1,0,$3::jsonb,NULL)",[kennel,ident,data]));
 await as(owner,()=>db.query("SELECT * FROM upsert_kennel_record($1,$2,'tasks',1,1,$3::jsonb,now())",[kennel,ident,data]));
 const history=await as(owner,async()=>(await db.query('SELECT * FROM business_history($1,NULL)',[kennel])).rows);
 const own=history.filter(h=>h.record_id===ident);assert.equal(own.length,2);assert.equal(own[0].action,'Deleted');assert.equal(own[1].actor_id,staff);assert.equal(own[1].actor_name,'staff');
 const visible=await as(staff,async()=>(await db.query('SELECT * FROM business_history($1,NULL)',[kennel])).rows);assert.ok(visible.every(h=>h.actor_id===staff));
 await assert.rejects(as(staff,()=>db.query('DELETE FROM business_work_history')),e=>e.code==='42501');
 await assert.rejects(as(staff,()=>db.query('SELECT * FROM business_history($1,NULL)',[other])),e=>e.code==='42501');
});
test('pending invitation listing never exposes tokens and cancellation prevents acceptance',async()=>{
 const hash='f'.repeat(64);await as(owner,()=>db.query('SELECT business_invite($1,$2,$3,$4)',[kennel,'cancel@example.com','staff',hash]));
 const pending=await as(owner,async()=>(await db.query('SELECT * FROM business_pending_invites($1)',[kennel])).rows);const invite=pending.find(i=>i.email==='cancel@example.com');assert.ok(invite.id);assert.equal(invite.token_hash,undefined);
 await assert.rejects(as(staff,()=>db.query('SELECT * FROM business_pending_invites($1)',[kennel])),e=>e.code==='42501');
 await as(owner,()=>db.query('SELECT business_revoke_invite($1,$2)',[kennel,invite.id]));
 await assert.rejects(db.query('SELECT business_accept($1,$2,$3,$4,$5)',[hash,'cancel@example.com','hash','Cancelled',uuid(72)]),e=>e.code==='42501');
});

