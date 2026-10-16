import pg from 'pg';
import crypto from 'node:crypto';
const db=new pg.Pool({connectionString:process.env.KENNELFLOW_SQUARE_DATABASE_URL,ssl:{rejectUnauthorized:false},max:4});
export const cloudReady=()=>!!process.env.KENNELFLOW_SQUARE_DATABASE_URL;
export async function cloudDiagnostic(){
 if(!cloudReady())return {configured:false,connected:false,tableReady:false};
 try{
   const q=await db.query("SELECT to_regclass('public.kennelflow_square_checkouts') IS NOT NULL AS ready");
   return {configured:true,connected:true,tableReady:q.rows[0]?.ready===true};
 }catch(error){return {configured:true,connected:false,tableReady:false,errorCode:error?.code||'UNKNOWN'}}
}
export async function putCheckout(x){
 if(!cloudReady())throw Error('Cloud payment storage is not configured');
 await db.query('INSERT INTO public.kennelflow_square_checkouts(order_id,kennel_id,environment,customer_name,amount_cents,reference,checkout_url) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(order_id) DO NOTHING',[x.orderID,x.kennelID,x.environment,x.customerName,x.amountCents,x.reference,x.url]);
}
export async function getCheckouts(kennelID,environment){
 const r=await db.query('SELECT order_id,customer_name,amount_cents,reference,checkout_url,status,created_at,payment_id FROM public.kennelflow_square_checkouts WHERE kennel_id=$1 AND environment=$2 ORDER BY created_at DESC LIMIT 100',[kennelID,environment]);return r.rows;
}
export async function settlePayment({orderID,paymentID,amountCents,environment}){
 if(!cloudReady())throw Error('Cloud payment storage not configured');
 const c=await db.connect();
 try{
  await c.query('BEGIN');
  const pending=(await c.query('SELECT * FROM public.kennelflow_square_checkouts WHERE order_id=$1 AND environment=$2 FOR UPDATE',[orderID,environment])).rows[0];
  if(!pending){await c.query('COMMIT');return {ignored:true}};
  if(pending.amount_cents!==amountCents)throw Error('Square payment amount mismatch');
  if(pending.status==='COMPLETED'){if(pending.payment_id!==paymentID)throw Error('Conflicting Square payment ID');await c.query('COMMIT');return {alreadyRecorded:true}};
  const hex=crypto.createHash('sha256').update('kf-square-'+environment+'-'+paymentID).digest('hex');
  const id=[hex.slice(0,8),hex.slice(8,12),'4'+hex.slice(13,16),'a'+hex.slice(17,20),hex.slice(20,32)].join('-');
  const record={id,customerName:pending.customer_name,puppyName:'',date:new Date().toISOString().slice(0,19)+'Z',amount:amountCents/100,method:environment==='sandbox'?'Square Sandbox — TEST ONLY':'Square',reference:paymentID,notes:'Verified Square order '+orderID};
  const payload={platform:'ios',collection:'payments',record};
  const inserted=await c.query('INSERT INTO public.kennel_records(id,kennel_id,record_type,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(kennel_id,id) DO NOTHING RETURNING id',[id,pending.kennel_id,'payments',JSON.stringify(payload)]);
  if(!inserted.rowCount){const existing=(await c.query('SELECT payload FROM public.kennel_records WHERE kennel_id=$1 AND id=$2',[pending.kennel_id,id])).rows[0];if(existing?.payload?.record?.reference!==paymentID)throw Error('Existing payment record conflict')}
  await c.query("UPDATE public.kennelflow_square_checkouts SET status='COMPLETED',payment_id=$2,updated_at=now() WHERE order_id=$1",[orderID,paymentID]);
  await c.query('COMMIT');return {saved:!!inserted.rowCount,alreadyRecorded:!inserted.rowCount};
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
