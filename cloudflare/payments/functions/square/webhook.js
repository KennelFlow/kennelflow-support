import {notifyMerchantOnceSMS} from '../_lib/store-sms.mjs';
import {classifyVerifiedOrder} from '../_lib/order-classification.mjs';
import {notifyVerifiedStore} from '../_lib/store-notifications.mjs';
import {settleVerifiedServicePayment} from '../_lib/settlement.mjs';
// Kennel One Cloudflare Square webhook — staging only.
// No production Square webhook should target this endpoint until atomic
// payment settlement + store email/SMS delivery have been migrated and audited.
// By default, VERIFIED_PENDING events deliberately return 503 so Square retries.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,
  headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const coder=new TextEncoder();
export async function verifySquareSignature(body,signature,secret,notificationURL){
 if(!secret||!notificationURL||!signature)return false;
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(signature)||signature.length>200)return false;
 try{
  const signatureBytes=Uint8Array.from(atob(signature),c=>c.charCodeAt(0));
  if(signatureBytes.length!==32)return false;
  const key=await crypto.subtle.importKey('raw',coder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,signatureBytes,coder.encode(notificationURL+body));
 }catch{return false}
}
const uuid=id=>typeof id==='string'&&id.length>0&&id.length<=192;
async function checkPayment(payment,env,fetcher){
 const token=env.SQUARE_ACCESS_TOKEN,location=env.SQUARE_LOCATION_ID;
 if(!token||!location||!['production','sandbox'].includes(env.SQUARE_ENVIRONMENT))throw Error('Square backend unavailable');
 const host=env.SQUARE_ENVIRONMENT==='production'?'https://connect.squareup.com':'https://connect.squareupsandbox.com';
 const headers={Authorization:'Bearer '+token,'Square-Version':'2026-08-19'};
 const pay=await fetcher(host+'/v2/payments/'+encodeURIComponent(payment.id),{headers,redirect:'manual',signal:AbortSignal.timeout(12000)});
 if(!pay.ok)throw Error('Payment verification temporarily unavailable');
 const confirmed=(await pay.json()).payment;
 if(confirmed?.id!==payment.id||confirmed?.status!=='COMPLETED'||confirmed?.order_id!==payment.order_id||confirmed?.location_id!==location)
  throw Error('Square payment verification mismatch');
 const orderRes=await fetcher(host+'/v2/orders/'+encodeURIComponent(payment.order_id),{headers,redirect:'manual',signal:AbortSignal.timeout(12000)});
 if(!orderRes.ok)throw Error('Square order verification temporarily unavailable');
 const order=(await orderRes.json()).order;
 const amount=Number(confirmed?.amount_money?.amount);
 if(!order||order.id!==payment.order_id||order.location_id!==location||
   !Number.isSafeInteger(amount)||amount<=0||Number(order.total_money?.amount)!==amount)
  throw Error('Square order amount mismatch');
 return {payment:confirmed,order,...classifyVerifiedOrder(order,confirmed)};
}
export async function processWebhook(request,env={},fetcher=fetch,settler=settleVerifiedServicePayment,notifier=notifyVerifiedStore,sms=notifyMerchantOnceSMS){
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const secret=env.SQUARE_WEBHOOK_SIGNATURE_KEY,notificationURL=env.SQUARE_WEBHOOK_URL;
 if(!secret||!notificationURL)return json({error:'Square webhook not configured'},503);
 if(Number(request.headers.get('content-length')||0)>262144)return json({error:'Request too large'},413);
 const raw=await request.text();if(raw.length>262144)return json({error:'Request too large'},413);
 const signature=request.headers.get('x-square-hmacsha256-signature')||'';
 if(!await verifySquareSignature(raw,signature,secret,notificationURL))
  return json({error:'Invalid webhook signature'},403);
 let event;
 try{event=JSON.parse(raw)}catch{return json({error:'Invalid payload'},400)}
 if(event.type!=='payment.updated')return json({ok:true,ignored:true});
 const payment=event?.data?.object?.payment;
 if(!payment||payment.status!=='COMPLETED'||!uuid(payment.id)||!uuid(payment.order_id))
  return json({ok:true,ignored:true});
 let verified;
 try{verified=await checkPayment(payment,env,fetcher)}
 catch{return json({error:'Square verification temporarily unavailable'},503)}
 if(verified.type==='unrelated')return json({ok:true,ignored:true});
 if(!env.EVENTS)return json({error:'Durable payment event storage not configured'},503);
 let existing;
 try{
  await env.EVENTS.prepare('INSERT INTO payment_events (payment_id, event_id, order_id, kind, status, received_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(payment_id) DO NOTHING')
    .bind(payment.id,String(event.event_id||event.id||'').slice(0,192),verified.order.id,verified.type,'VERIFIED_PENDING',Date.now()).run();
  existing=await env.EVENTS.prepare('SELECT status, order_id, kind, received_at FROM payment_events WHERE payment_id=?').bind(payment.id).first();
  if(!existing||existing.order_id!==verified.order.id||existing.kind!==verified.type)
    return json({error:'Payment event conflict'},409);
  if(existing.status==='SETTLED')return json({ok:true,alreadyRecorded:true});
 }catch{return json({error:'Payment event storage unavailable'},503)}
 // Production remains off. Only kennel-service transactions can be atomically
 // saved to the existing Neon checkout and kennel ledger schema. Store orders
 // require notification/outbox migration before their events can be accepted.
 if(verified.type==='store-order' && env.ENABLE_STORE_NOTIFICATIONS==='true') {
   // Resend stores idempotency keys for 24 hours. Beyond that window a partial
   // email-send failure must be manually reconciled to prevent duplicate mail.
   const elapsed=Date.now()-Number(existing.received_at);
   if(!Number.isSafeInteger(existing.received_at)||elapsed<0||elapsed>=23*60*60*1000)
     return json({error:'Store notification requires manual reconciliation'},503);
   try {
     await notifier(verified,env);
     if(env.ENABLE_STORE_SMS_NOTIFICATIONS==='true')await sms(verified,env);
     const result=await env.EVENTS.prepare("UPDATE payment_events SET status='SETTLED' WHERE payment_id=? AND order_id=? AND kind='store-order' AND status='VERIFIED_PENDING'")
       .bind(payment.id,verified.order.id).run();
     if(result?.success!==true)throw Error('Could not save notification outcome');
     return json({ok:true,notificationSent:true});
   }catch {
     return json({error:'Store notification retry required'},503);
   }
 }
 if(verified.type==='kennel-service' && env.ENABLE_ATOMIC_SERVICE_SETTLEMENT==='true'){
   try {
     const settled=await settler(verified,env);
     const result=await env.EVENTS.prepare("UPDATE payment_events SET status='SETTLED' WHERE payment_id=? AND order_id=? AND kind='kennel-service' AND status='VERIFIED_PENDING'")
       .bind(payment.id,verified.order.id).run();
     if(result?.success!==true)throw Error('Could not confirm durable event update');
     return json({ok:true,saved:settled.saved,alreadyRecorded:settled.alreadyRecorded});
   }catch {
     // The Neon function is retry-safe. If D1 fails AFTER Neon commits, Square
     // retries and Neon reports alreadyRecorded. Never acknowledge partial work.
     return json({error:'Payment settlement retry required'},503);
   }
 }
 return json({error:'Payment settlement processor not activated'},503);
}
export const onRequest=({request,env})=>processWebhook(request,env);
