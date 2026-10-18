// Atomic Neon settlement uses a Postgres function which performs locking,
// conflict detection, insert and checkout update in one DB transaction.
// DATABASE_URL must be a privileged SERVER-SIDE secret, never browser-visible.
export function deterministicRecordId(paymentID,environment) {
  // The Square payment ID is independently validated through Square's API.
  if(typeof paymentID!=='string'||!paymentID||paymentID.length>192
   ||!['sandbox','production'].includes(environment))throw Error('Invalid Square payment identity');
  return {paymentID,environment};
}
export async function paymentRecordId(paymentID,environment) {
  deterministicRecordId(paymentID,environment);
  const buffer=await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode('kf-square-'+environment+'-'+paymentID));
  const hex=Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),'4'+hex.slice(13,16),
    'a'+hex.slice(17,20),hex.slice(20,32)].join('-');
}
export async function settleVerifiedServicePayment(verification,env,dbExecute) {
  if(verification.type!=='kennel-service')throw Error('Only verified kennel-service payments may enter the ledger');
  if(!env.DATABASE_URL)throw Error('Neon settlement database secret is missing');
  if(!['sandbox','production'].includes(env.SQUARE_ENVIRONMENT))throw Error('Invalid Square environment');
  const amountCents=Number(verification.payment?.amount_money?.amount);
  const paymentID=verification.payment?.id,orderID=verification.order?.id;
  if(typeof orderID!=='string'||!orderID||orderID.length>192||
    !Number.isSafeInteger(amountCents)||amountCents<100||amountCents>5000000)throw Error('Invalid verified Square amount or order');
  const recordID=await paymentRecordId(paymentID,env.SQUARE_ENVIRONMENT);
  const runner=dbExecute||defaultDbExecute;
  const result=await runner(env.DATABASE_URL,[orderID,paymentID,amountCents,env.SQUARE_ENVIRONMENT,recordID]);
  const row=Array.isArray(result)?result[0]:null;
  if(!row||typeof row.saved!=='boolean'||typeof row.already_recorded!=='boolean'||typeof row.ignored!=='boolean')
    throw Error('Invalid atomic settlement result');
  if(row.ignored)throw Error('No matching stored checkout; cannot mark this as paid');
  if(row.saved===row.already_recorded)throw Error('Conflicting settlement flags');
  return {saved:row.saved,alreadyRecorded:row.already_recorded};
}
async function defaultDbExecute(connectionString,parameters) {
  const {neon}=await import('@neondatabase/serverless');
  const sql=neon(connectionString);
  // The SQL function is installed only after isolated-branch validation. HTTP
  // query is a single PostgreSQL statement and one atomic DB transaction.
  return sql.query(
    'SELECT saved,already_recorded,ignored FROM public.ko_settle_service_payment_v1($1::text,$2::text,$3::bigint,$4::text,$5::uuid)',
    parameters
  );
}
