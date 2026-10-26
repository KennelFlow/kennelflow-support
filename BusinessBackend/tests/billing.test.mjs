import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const owner=id(800),staff=id(801),kennel=id(802),outsider=id(803);
async function status(actor=owner,scope=kennel){
 await db.exec('SET ROLE kennelflow_api');
 try {
  await db.query("SELECT set_config('request.user_id',$1,false)",[actor]);
  return (await db.query('SELECT business_billing_status($1) AS status',[scope])).rows[0].status;
 }finally{
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.user_id','',false)");
 }
}
before(async()=>{
 db=await PGlite.create();
 await db.exec('CREATE ROLE kennelflow_api NOSUPERUSER NOBYPASSRLS');
 for(const n of ['001_kennelflow.sql','002_revision_sync.sql','003_security_hardening.sql','004_auth.sql','005_access_control.sql','006_password_reset.sql','007_business.sql','008_files.sql','009_employees.sql','010_business_profile.sql','011_private_messages.sql','012_unified_billing.sql'])
  await db.exec(await readFile(new URL('../schema/'+n,import.meta.url),'utf8'));
 await db.query('INSERT INTO kennels(id,name) VALUES($1,$2)',[kennel,'KennelOne Test']);
 for(const [u,role] of [[owner,'owner'],[staff,'staff'],[outsider,null]]){
  await db.query('INSERT INTO app_users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)',[u,role||'outsider'+'@example.invalid','unusable-test-password','Tester']);
  if(role)await db.query('INSERT INTO kennel_memberships(kennel_id,user_id,role) VALUES($1,$2,$3)',[kennel,u,role]);
 }
});
after(async()=>db?.close());
test('unpaid account is denied, employee is denied too',async()=>{
 assert.equal((await status()).active,false);
 assert.equal((await status(staff)).active,false);
});
test('first Windows account gets one 14-day trial, staff inherits trial',async()=>{
 await db.query("INSERT INTO kennelone_account_trials(user_id,started_at,ends_at) VALUES($1,now(),now()+interval '14 days')",[owner]);
 assert.equal((await status()).state,'trial');
 assert.equal((await status(staff)).state,'trial');
 await assert.rejects(db.query("INSERT INTO kennelone_account_trials(user_id,started_at,ends_at) VALUES($1,now(),now()+interval '14 days')",[owner]), e=>e.code==='23505');
});
test('trial expiry locks owner and staff',async()=>{
 await db.query("UPDATE kennelone_account_trials SET started_at=now()-interval '15 days',ends_at=now()-interval '1 day' WHERE user_id=$1",[owner]);
 assert.equal((await status()).active,false);
 assert.equal((await status(staff)).active,false);
});
test('verified Apple purchase unlocks the Windows account without new charge',async()=>{
 await db.query("INSERT INTO kennelone_purchase_entitlements(user_id,provider,provider_purchase_id,plan,state,valid_through,verified_at) VALUES($1,'apple','test-appstore-annual','annual','active',now()+interval '365 days',now())",[owner]);
 assert.equal((await status()).provider,'apple');
 assert.equal((await status(staff)).active,true);
 await assert.rejects(db.query("INSERT INTO kennelone_purchase_entitlements(user_id,provider,provider_purchase_id,plan,state,valid_through,verified_at) VALUES($1,'apple','test-appstore-annual','annual','active',now()+interval '365 days',now())",[outsider]),e=>e.code==='23505');
});
test('refund removes access, Windows payment unlocks account',async()=>{
 await db.query("UPDATE kennelone_purchase_entitlements SET state='refunded' WHERE provider_purchase_id='test-appstore-annual'");
 assert.equal((await status()).active,false);
 await db.query("INSERT INTO kennelone_purchase_entitlements(user_id,provider,provider_purchase_id,plan,state,valid_through,verified_at) VALUES($1,'windows','test-square-monthly','monthly','active',now()+interval '30 days',now())",[owner]);
 assert.equal((await status()).provider,'windows');
});
test('expired monthly payment does not unlock account',async()=>{
 await db.query("UPDATE kennelone_purchase_entitlements SET valid_through=now()-interval '1 day' WHERE provider_purchase_id='test-square-monthly'");
 assert.equal((await status()).active,false);
});
test('lifetime verified purchase unlocks owner and staff',async()=>{
 await db.query("INSERT INTO kennelone_purchase_entitlements(user_id,provider,provider_purchase_id,plan,state,valid_through,verified_at) VALUES($1,'google','test-lifetime','lifetime','active',null,now())",[owner]);
 assert.equal((await status()).plan,'lifetime');
 assert.equal((await status(staff)).active,true);
});
test('non-members cannot ask for another kennel billing status',async()=>{
 await assert.rejects(status(outsider),e=>e.code==='42501');
});
test('restricted app role cannot forge its own paid entitlement',async()=>{
 await db.exec('SET ROLE kennelflow_api');
 try{await assert.rejects(db.query("INSERT INTO kennelone_purchase_entitlements(user_id,provider,provider_purchase_id,plan,state,valid_through,verified_at) VALUES($1,'apple','fraud','lifetime','active',null,now())",[outsider]),e=>e.code==='42501')}
 finally{await db.exec('RESET ROLE')}
});
test('restricted signup creates a single trial atomically',async()=>{
 const newUser=id(804),newKennel=id(805);
 await db.exec('SET ROLE kennelflow_api');
 try {
  await db.query('SELECT business_signup_with_trial($1,$2,$3,$4,$5,$6)',[
   'new-customer@example.invalid','sample-hash','Windows Customer','Windows Kennel',newUser,newKennel]);
 }finally{await db.exec('RESET ROLE')}
 const trial=(await db.query('SELECT ends_at>started_at AS valid FROM kennelone_account_trials WHERE user_id=$1',[newUser])).rows[0];
 assert.equal(trial?.valid,true);
 assert.equal((await status(newUser,newKennel)).state,'trial');
});
