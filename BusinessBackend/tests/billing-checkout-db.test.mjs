import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const owner=id(741),staff=id(742),kennel=id(743),key=id(744),keyTwo=id(745);
async function as(user,sql,args){
 await db.exec('SET ROLE kennelflow_api');
 try{
  await db.query("SELECT set_config('request.user_id',$1,false)",[user]);
  return await db.query(sql,args);
 }finally{
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.user_id','',false)");
 }
}
before(async()=>{
 db=await PGlite.create();
 await db.exec('CREATE ROLE kennelflow_api NOSUPERUSER NOBYPASSRLS');
 for(const n of ['001_kennelflow.sql','002_revision_sync.sql','003_security_hardening.sql',
  '004_auth.sql','005_access_control.sql','006_password_reset.sql','007_business.sql',
  '008_files.sql','009_employees.sql','010_business_profile.sql','011_private_messages.sql',
  '012_unified_billing.sql','013_windows_checkout.sql','014_windows_settlement.sql'])
  await db.exec(await readFile(new URL('../schema/'+n,import.meta.url),'utf8'));
 await db.query('INSERT INTO kennels(id,name) VALUES($1,$2)',[kennel,'Staging Kennel']);
 for(const [user,role] of [[owner,'owner'],[staff,'staff']]){
  await db.query('INSERT INTO app_users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)',
   [user,role+'@example.invalid','example-hash',role]);
  await db.query('INSERT INTO kennel_memberships(kennel_id,user_id,role) VALUES($1,$2,$3)',[kennel,user,role]);
 }
});
after(async()=>db?.close());
test('only kennel owner can create and reuse Square pending checkout link',async()=>{
 const url='https://square.link/u/DEVELOPMENTCHECKOUT';
 const sql='SELECT business_save_windows_checkout($1,$2,$3,$4,$5,$6) AS checkout';
 await assert.rejects(as(staff,sql,[kennel,'annual',key,'test-link','test-order',url]),{code:'42501'});
 const first=await as(owner,sql,[kennel,'annual',key,'test-link','test-order',url]);
 assert.equal(first.rows[0].checkout.plan,'annual');
 const repeat=await as(owner,sql,[kennel,'annual',key,'test-link','test-order',url]);
 assert.deepEqual(repeat.rows[0],first.rows[0]);
 const pending=await as(owner,'SELECT business_pending_windows_checkout($1) AS pending',[kennel]);
 assert.equal(pending.rows[0].pending.url,url);
});
test('second pending checkout cannot be created for same kennel',async()=>{
 await assert.rejects(as(owner,'SELECT business_save_windows_checkout($1,$2,$3,$4,$5,$6)',
  [kennel,'monthly',keyTwo,'another-link','another-order','https://square.link/u/ANOTHER']),{code:'23505'});
});
test('customers and employees cannot forge successful payment status through checkout table',async()=>{
 await db.exec('SET ROLE kennelflow_api');
 try {
  await assert.rejects(db.query("UPDATE kennelone_windows_checkout_links SET state='paid'"),{code:'42501'});
  await assert.rejects(db.query("INSERT INTO kennelone_purchase_entitlements(user_id,provider,provider_purchase_id,plan,state,valid_through,verified_at) VALUES($1,'windows','fake','lifetime','active',null,now())",[staff]),{code:'42501'});
 }finally{await db.exec('RESET ROLE')}
});
test('only verified Square settlement route can activate a matching pending Windows checkout',async()=>{
 const statement='SELECT business_settle_windows_checkout($1,$2,$3,$4,$5,$6,$7) AS status';
 const proof=[kennel,'test-order','sqpay:verified-payment-01','annual','active',new Date(Date.now()+365*86400000).toISOString(),new Date().toISOString()];
 await assert.rejects(as(staff,statement,proof),{code:'42501'});
 await assert.rejects(as(owner,statement,[...proof.slice(0,1),'incorrect-order',...proof.slice(2)]),{code:'42501'});
 const result=await as(owner,statement,proof);
 assert.equal(result.rows[0].status.provider,'windows');
 assert.equal(result.rows[0].status.active,true);
 const row=(await db.query("SELECT state FROM kennelone_windows_checkout_links WHERE square_order_id='test-order'")).rows[0];
 assert.equal(row.state,'paid');
 const retry=await as(owner,statement,proof);
 assert.equal(retry.rows[0].status.provider,'windows');
});
test('settled Square purchase cannot be forged as another subscription or by a different kennel',async()=>{
 const stmt='SELECT business_settle_windows_checkout($1,$2,$3,$4,$5,$6,$7)';
 await assert.rejects(as(owner,stmt,[kennel,'test-order','sqpay:other','monthly','active',new Date(Date.now()+86400000).toISOString(),new Date().toISOString()]),{code:'42501'});
});
