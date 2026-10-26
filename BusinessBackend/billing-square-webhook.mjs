// A Square webhook is a trigger to RECHECK Square. Its JSON is never
// accepted as payment or as a subscription entitlement.
import {createHmac,timingSafeEqual} from 'node:crypto';

const failure=(reason,status=403)=>Object.assign(Error(reason),{status});
const validDate=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&
  Number.isFinite(Date.parse(value+'T23:59:59Z'));

export function validateSquareWebhook({signature,rawBody,notificationUrl,signatureKey,requestUrl}){
 if(!signatureKey||!notificationUrl)throw failure('Webhook not configured',503);
 if(typeof notificationUrl!=='string'||!notificationUrl.startsWith('https://')||
   notificationUrl!==requestUrl)throw failure('Webhook URL misconfigured',503);
 if(!Buffer.isBuffer(rawBody)||rawBody.length>131072||!rawBody.length)
   throw failure('Invalid Square webhook body',400);
 if(typeof signature!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(signature))
   throw failure('Invalid Square webhook signature');
 const expected=createHmac('sha256',signatureKey).update(notificationUrl).update(rawBody).digest();
 const received=Buffer.from(signature,'base64');
 if(received.length!==expected.length||!timingSafeEqual(received,expected))
   throw failure('Invalid Square webhook signature');
 let payload;
 try{payload=JSON.parse(rawBody.toString('utf8'))}catch{throw failure('Invalid webhook JSON',400)}
 if(!payload||typeof payload!=='object')throw failure('Invalid webhook event',400);
 if(typeof payload.event_id!=='string'||!/^[A-Za-z0-9:_-]{3,256}$/.test(payload.event_id))
   throw failure('Invalid Square event identity',400);
 return payload;
}
// Refund event only supplies a refund ID. Verify its COMPLETED status and
// exact corresponding payment/order from Square before touching a paid account.
export async function verifySquareRefundWebhook(event,env=process.env,fetcher=fetch){
 if(!['refund.created','refund.updated'].includes(event.type))return {ignored:true};
 const id=event?.data?.id;
 if(typeof id!=='string'||!/^[A-Za-z0-9:_-]{3,256}$/.test(id))
   throw failure('Invalid refund identity',400);
 if(!['sandbox','production'].includes(env.SQUARE_ENVIRONMENT)||
    !env.SQUARE_ACCESS_TOKEN||!env.SQUARE_LOCATION_ID)
   throw failure('Square refund verification not configured',503);
 const host=env.SQUARE_ENVIRONMENT==='production'
   ?'https://connect.squareup.com':'https://connect.squareupsandbox.com';
 const get=async path=>{
  const response=await fetcher(host+path,{
   method:'GET',headers:{Authorization:'Bearer '+env.SQUARE_ACCESS_TOKEN,
   'Square-Version':'2026-09-16'},redirect:'manual',signal:AbortSignal.timeout(12000)
  });
  if(!response.ok||response.status>=300)throw failure('Square refund verification unavailable',503);
  return response.json();
 };
 const {refund}=await get('/v2/refunds/'+encodeURIComponent(id));
 if(refund?.id!==id||refund.status!=='COMPLETED')return {ignored:true};
 if(refund.location_id!==env.SQUARE_LOCATION_ID||
   typeof refund.payment_id!=='string'||!refund.order_id||
   Number(refund.amount_money?.amount)<=0||refund.amount_money?.currency!=='USD')
   throw failure('Refund is not a verified Kennel One payment',403);
 const {payment}=await get('/v2/payments/'+encodeURIComponent(refund.payment_id));
 if(payment?.id!==refund.payment_id||payment.order_id!==refund.order_id||
   payment.location_id!==env.SQUARE_LOCATION_ID||
   Number(payment.refunded_money?.amount||0)<Number(refund.amount_money.amount))
   throw failure('Square payment refund confirmation incomplete',409);
 return {eventId:event.event_id,orderId:refund.order_id,paymentId:refund.payment_id,
   state:'refunded'};
}

export async function verifySquareSubscriptionWebhook(event,env=process.env,fetcher=fetch){
 if(!['subscription.created','subscription.updated'].includes(event.type))
   return {ignored:true};
 const id=event?.data?.id||event?.data?.object?.subscription?.id;
 if(typeof id!=='string'||!/^[A-Za-z0-9:_-]{3,256}$/.test(id))
   throw failure('Invalid subscription identity',400);
 if(!['sandbox','production'].includes(env.SQUARE_ENVIRONMENT)||
   !env.SQUARE_ACCESS_TOKEN||!env.SQUARE_LOCATION_ID||
   !env.KO_SQUARE_MONTHLY_VARIATION_ID||!env.KO_SQUARE_ANNUAL_VARIATION_ID)
   throw failure('Square verification is not configured',503);
 const host=env.SQUARE_ENVIRONMENT==='production'
   ?'https://connect.squareup.com':'https://connect.squareupsandbox.com';
 const reply=await fetcher(host+'/v2/subscriptions/'+encodeURIComponent(id),{
   method:'GET',
   headers:{Authorization:'Bearer '+env.SQUARE_ACCESS_TOKEN,'Square-Version':'2026-09-16'},
   redirect:'manual',signal:AbortSignal.timeout(12000)
 });
 if(!reply.ok||reply.status>=300)throw failure('Square subscription lookup unavailable',503);
 const data=await reply.json(),sub=data.subscription;
 if(sub?.id!==id||!sub.customer_id||sub.location_id!==env.SQUARE_LOCATION_ID)
   throw failure('Square subscription identity does not match');
 const plan=sub.plan_variation_id===env.KO_SQUARE_MONTHLY_VARIATION_ID?'monthly':
   sub.plan_variation_id===env.KO_SQUARE_ANNUAL_VARIATION_ID?'annual':null;
 if(!plan)throw failure('Square subscription plan is not Kennel One');
 const until=validDate(sub.paid_until_date)?new Date(sub.paid_until_date+'T23:59:59Z').toISOString():null;
 const hasPaidTime=until!==null&&Date.parse(until)>Date.now();
 let state;
 if(sub.status==='ACTIVE'){
   if(!hasPaidTime)throw failure('Active Square subscription lacks paid-through proof',409);
   state='active';
 } else if(['CANCELED','DEACTIVATED','PAUSED','COMPLETED'].includes(sub.status)){
   // A cancel may become effective at the END of an already-paid period.
   state=hasPaidTime?'grace':'expired';
 } else {
   throw failure('Square subscription state requires reconciliation',409);
 }
 return {eventId:event.event_id,providerPurchaseId:'sqsub:'+id,plan,
   state,validThrough:until};
}
