// Square Web Payments SDK tokenized-payments endpoint, preview only.
// Never accept card numbers / CVV or record cash or off-platform charges here.
// Production remains with the existing backend until Sandbox verifies parity.
import {createHash} from 'node:crypto';
const error=(status,message)=>Object.assign(new Error(message),{status});
const knownOrigins=new Set([
 'https://kennelone.app','https://www.kennelone.app',
 'https://app.kennelone.app','https://quailflow.app','https://www.quailflow.app',
 'https://rabbitflow.app','https://www.rabbitflow.app',
 'https://yardpatrol.app','https://www.yardpatrol.app'
]);
const amountLimit=env=>{
 const raw=Number(env.SQUARE_MAX_PAYMENT_CENTS||5000000);
 if(!Number.isSafeInteger(raw)||raw<100||raw>5000000)throw error(503,'Payment limit is unavailable');
 return raw;
};
const environment=env=>{
 if(!['sandbox','production'].includes(env.SQUARE_ENVIRONMENT))throw error(503,'Square is not configured');
 return env.SQUARE_ENVIRONMENT==='sandbox'?'https://connect.squareupsandbox.com':'https://connect.squareup.com';
};
const response=(data,status=200,origin='')=>Response.json(data,{
 status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',
  ...(origin?{'Access-Control-Allow-Origin':origin}:{})}
});
function originFrom(request){
 const origin=request.headers.get('Origin')||'';
 if(origin&&!knownOrigins.has(origin))throw error(403,'Origin not allowed');
 if(request.headers.get('Sec-Fetch-Site')==='cross-site'&&!origin)throw error(403,'Origin required');
 return origin;
}
export function publicSquareConfig(env={}){
 return {
  environment:['sandbox','production'].includes(env.SQUARE_ENVIRONMENT)?env.SQUARE_ENVIRONMENT:'unavailable',
  locationIDConfigured:Boolean(env.SQUARE_LOCATION_ID&&env.SQUARE_ACCESS_TOKEN),
  maxPaymentCents:amountLimit(env)
 };
}
export async function createTokenizedSquarePayment(data,env={},fetcher=fetch){
 if(env.ENABLE_DIRECT_CARD_PAYMENTS!=='true')throw error(503,'Direct card payments are not activated');
 const host=environment(env);
 if(!env.SQUARE_ACCESS_TOKEN||!env.SQUARE_LOCATION_ID)throw error(503,'Square is not configured');
 const sourceID=data?.sourceID,locationID=data?.locationID;
 const amount=Number(data?.amountCents);
 if(typeof sourceID!=='string'||!sourceID||sourceID.length>256||
    ['CASH','EXTERNAL'].includes(sourceID.toUpperCase()))throw error(400,'Valid payment token is required');
 if(locationID!==env.SQUARE_LOCATION_ID)throw error(400,'Payment location mismatch');
 if(!Number.isSafeInteger(amount)||amount<1||amount>amountLimit(env))throw error(400,'Payment amount exceeds the configured limit');
 if(data?.currency!==undefined&&data.currency!=='USD')throw error(400,'Only USD payments are supported');
 if(data?.cardNumber!==undefined||data?.cvv!==undefined||data?.pan!==undefined)
  throw error(400,'Only Square payment tokens are accepted');
 const supplied=data?.idempotencyKey;
 if(supplied!==undefined&&(typeof supplied!=='string'||!/^[A-Za-z0-9_-]{8,45}$/.test(supplied)))
  throw error(400,'Invalid idempotency key');
 // A token reused after a network timeout must NOT charge a second time.
 const retryKey=supplied||'ko-'+createHash('sha256').update(sourceID+'|'+locationID+'|'+amount).digest('hex').slice(0,42);
 const customer=typeof data.customerName==='string'?data.customerName.trim().slice(0,120):'';
 const details=typeof data.description==='string'?data.description.trim().slice(0,360):'';
 const payload={
  source_id:sourceID,idempotency_key:retryKey,location_id:locationID,
  amount_money:{amount,currency:'USD'},
  note:[customer,details].filter(Boolean).join(' • ').slice(0,500),
  autocomplete:true
 };
 const upstream=await fetcher(host+'/v2/payments',{
  method:'POST',redirect:'manual',signal:AbortSignal.timeout(20000),
  headers:{'Authorization':'Bearer '+env.SQUARE_ACCESS_TOKEN,
   'Square-Version':'2026-08-19','Content-Type':'application/json'},
  body:JSON.stringify(payload)
 });
 if(upstream.status>=300&&upstream.status<400)throw error(502,'Unexpected Square redirect');
 const body=await upstream.json().catch(()=>({}));
 if(!upstream.ok)throw error(502,body?.errors?.[0]?.detail||'Square payment could not be processed');
 const payment=body?.payment;
 if(!payment||typeof payment.id!=='string'||!payment.id||!['COMPLETED','APPROVED','PENDING'].includes(payment.status)||
   payment.location_id!==locationID||payment.amount_money?.amount!==amount)
  throw error(502,'Square did not confirm the expected payment');
 return {paymentID:payment.id,status:payment.status};
}
export async function handleDirectPayment(request,env={},operation,fetcher=fetch){
 let origin='';
 try{
  origin=originFrom(request);
  if(operation==='config'&&request.method==='GET')return response(publicSquareConfig(env),200,origin);
  if(request.method==='OPTIONS')return new Response(null,{status:204,
   headers:{'Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type',
   'Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})}});
  if(operation!=='charge'||request.method!=='POST')return response({error:'Method not allowed'},405,origin);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))throw error(415,'JSON required');
  if(Number(request.headers.get('Content-Length')||0)>16384)throw error(413,'Request too large');
  const text=await request.text();
  if(text.length>16384)throw error(413,'Request too large');
  const data=JSON.parse(text);
  return response(await createTokenizedSquarePayment(data,env,fetcher),200,origin);
 }catch(e){
  return response({error:e.status?e.message:'Square is temporarily unavailable'},e.status||503,origin);
 }
}
