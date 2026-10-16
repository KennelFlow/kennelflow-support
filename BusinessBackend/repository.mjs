import pg from 'pg';
export function createRepository(connectionString) {
 if(!connectionString)throw Error('Restricted DATABASE_URL is required');
 const pool=new pg.Pool({connectionString,max:5,connectionTimeoutMillis:10000});
 async function scoped(actor,kennel,fn){
  const c=await pool.connect();try{
   await c.query('BEGIN');
   if(kennel)await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[kennel]);
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[actor.tokenHash]);
   const session=await c.query('SELECT user_id FROM app_sessions WHERE token_hash=$1 AND expires_at>now()',[actor.tokenHash]);
   if(session.rows[0]?.user_id!==actor.id)throw Object.assign(Error('Session expired'),{code:'28000'});
   await c.query("SELECT set_config('request.user_id',$1,true)",[actor.id]);
   const r=await fn(c);await c.query('COMMIT');return r;
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 return {
  async allowLogin(key){return (await pool.query('SELECT business_login_allowed($1) AS allowed',[key])).rows[0].allowed},
  async createOwner(email,hash,name,kennelName,user,kennel){await pool.query('SELECT business_create_kennel($1,$2,$3,$4,$5,$6)',[email,hash,name,kennelName,user,kennel])},
  async changePassword(actor,hash){return scoped(actor,null,c=>c.query('SELECT business_password($1,$2)',[actor.id,hash]))},
  async updateProfile(actor,kennel,profile){return scoped(actor,kennel,c=>c.query(
   'SELECT business_update_profile($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
   [kennel,actor.id,profile.expectedEmail,profile.expectedBusinessName,profile.email,profile.ownerName,
    profile.businessName,profile.phone,profile.address,profile.website]))},
  async account(email){return (await pool.query('SELECT id,password_hash FROM app_users WHERE email=$1',[email])).rows[0]},
  async issueSession(user,hash){await pool.query("INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '24 hours')",[hash,user])},
  async session(hash){return (await pool.query("SELECT u.id,u.email,u.display_name AS name FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",[hash])).rows[0]},
  async logout(actor){await scoped(actor,null,c=>c.query('DELETE FROM app_sessions WHERE token_hash=$1 AND user_id=$2',[actor.tokenHash,actor.id]))},
  async kennels(actor){return scoped(actor,null,async c=>(await c.query('SELECT k.id,k.name,k.contact_phone AS "phone",k.contact_address AS "address",k.website,m.role FROM kennels k JOIN kennel_memberships m ON m.kennel_id=k.id WHERE m.user_id=$1 ORDER BY k.name',[actor.id])).rows)},
  async members(actor,kennel){return scoped(actor,kennel,async c=>(await c.query('SELECT * FROM business_members($1)',[kennel])).rows)},
  async invitations(actor,kennel){return scoped(actor,kennel,async c=>(await c.query('SELECT * FROM business_pending_invites($1)',[kennel])).rows)},
  async revokeInvite(actor,kennel,id){return scoped(actor,kennel,c=>c.query('SELECT business_revoke_invite($1,$2)',[kennel,id]))},
  async history(actor,kennel,before){return scoped(actor,kennel,async c=>(await c.query('SELECT * FROM business_history($1,$2)',[kennel,before])).rows)},
  async clock(actor,kennel,action){return scoped(actor,kennel,async c=>(await c.query('SELECT business_clock($1,$2) AS result',[kennel,action])).rows[0].result)},
  async invite(actor,kennel,email,role,hash){return scoped(actor,kennel,c=>c.query('SELECT business_invite($1,$2,$3,$4)',[kennel,email,role,hash]))},
  async acceptInvite(hash,email,password,name,id){await pool.query('SELECT business_accept($1,$2,$3,$4,$5)',[hash,email,password,name,id])},
  async changeMember(actor,kennel,user,role,remove){return scoped(actor,kennel,c=>c.query('SELECT business_change_member($1,$2,$3,$4)',[kennel,user,role,remove]))},
  async records(actor,kennel,after,limit){return scoped(actor,kennel,async c=>(await c.query(
   `SELECT id,record_type AS type,revision,payload AS data,deleted_at,updated_at::text AS updated_at FROM kennel_records WHERE kennel_id=$1 AND ($2::timestamptz IS NULL OR (updated_at,id)>($2::timestamptz,$3::uuid)) ORDER BY updated_at,id LIMIT $4`,[kennel,after?.at||null,after?.id||null,limit])).rows)},
  async putRecord(actor,kennel,id,input){return scoped(actor,kennel,async c=>{
   const r=await c.query('SELECT * FROM upsert_kennel_record($1,$2,$3,1,$4,$5::jsonb,$6)',[kennel,id,input.type,input.expectedRevision,JSON.stringify(input.data),input.deletedAt||null]);
   const row=r.rows[0];return {id:row.id,type:row.record_type,revision:Number(row.revision),data:row.payload,updated_at:row.updated_at,deleted_at:row.deleted_at};
  })},
  async file(actor,kennel,id){return scoped(actor,kennel,async c=>(await c.query('SELECT bytes,sha256 FROM business_files WHERE kennel_id=$1 AND record_id=$2',[kennel,id])).rows[0])},
  async putFile(actor,kennel,id,bytes,hash){return scoped(actor,kennel,async c=>{
   const existing=(await c.query('SELECT sha256 FROM business_files WHERE kennel_id=$1 AND record_id=$2',[kennel,id])).rows[0];
   if(existing){if(existing.sha256!==hash)throw Object.assign(Error('File conflict'),{code:'40001'});return}
   await c.query('INSERT INTO business_files(kennel_id,record_id,bytes,sha256) VALUES($1,$2,$3,$4)',[kennel,id,bytes,hash]);
  })},
  async readiness(){
   const r=(await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
   if(r.rolsuper||r.rolbypassrls)throw Error('Business API requires a restricted database role');
   await pool.query('SELECT business_login_allowed($1)',['readiness']);
  },
  async close(){await pool.end()}
 };
}

