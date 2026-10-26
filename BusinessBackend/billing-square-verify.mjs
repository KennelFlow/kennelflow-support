// Square settlement verification for Kennel One Windows purchases.
// Never grant access from a browser redirect, checkout URL, or unverified webhook.
import {WINDOWS_PLANS} from './billing-square.mjs';

const err=(message,status=403)=>Object.assign(Error(message),{status});
const dateValid=(value)=>typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&Date.parse(value+'T23:59:59Z')>Date.now();

async function fetchSquare(path,env,fetcher=fetch){
 const host=env.SQUARE_ENVIRONMENT==='production'
  ?'https://connect.squareup.com'
  :env.SQUARE_ENVIRONMENT==='sandbox'
   ?'https://connect.squareupsandbox.com':null;
 if(!host||!env.SQUARE_ACCESS_TOKEN||!env.SQUARE_LOCATION_ID)throw err('Square verification not configured',503);
 const result=await fetcher(host+path,{
  method:'GET',
  headers:{Authorization:'Bearer '+env.SQUARE_ACCESS_TOKEN,'Square-Version':'2026-09-16'},
  redirect:'manual',signal:AbortSignal.timeout(12000)
 });
 if(!result.ok||result.status>=300)throw err('Square verification unavailable',503);
 return await result.json();
}
export async function verifyCompletedCheckout({checkout,paymentId},env=process.env,fetcher=fetch){
 if(!checkout||!['monthly','annual','lifetime'].includes(checkout.plan)||
    typeof checkout.orderId!=='string'||typeof paymentId!=='string'||
    !/^[A-Za-z0-9:_-]{3,256}$/.test(paymentId)||! /^[A-Za-z0-9:_-]{3,256}$/.test(checkout.orderId))
  throw err('Invalid Square checkout identity',400);
 const result=await fetchSquare('/v2/payments/'+encodeURIComponent(paymentId),env,fetcher);
 const payment=result.payment;
 if(payment?.id!==paymentId||payment?.status!=='COMPLETED'||
   payment?.order_id!==checkout.orderId||payment?.location_id!==env.SQUARE_LOCATION_ID||
   payment?.amount_money?.currency!=='USD'||
   Number(payment?.amount_money?.amount)!==WINDOWS_PLANS[checkout.plan].amountCents)
  throw err('Square payment does not match the checkout');
 const orderResponse=await fetchSquare('/v2/orders/'+encodeURIComponent(checkout.orderId),env,fetcher);
 const order=orderResponse.order;
 if(order?.id!==checkout.orderId||order?.location_id!==env.SQUARE_LOCATION_ID||
   order?.total_money?.currency!=='USD'||
   Number(order?.total_money?.amount)!==WINDOWS_PLANS[checkout.plan].amountCents)
  throw err('Square order does not match checkout');
 return {paymentId,orderId:checkout.orderId,plan:checkout.plan,
   customerId:payment.customer_id||order.customer_id||null};
}
export async function verifyActiveSquareSubscription({subscriptionId,checkout,initialPayment},
 env=process.env,fetcher=fetch){
 if(!initialPayment||!checkout||!['monthly','annual'].includes(checkout.plan)||
    !/^[A-Za-z0-9:_-]{3,256}$/.test(subscriptionId||''))
  throw err('Invalid Square subscription',400);
 const cfg=checkout.plan==='monthly'?'KO_SQUARE_MONTHLY_VARIATION_ID':'KO_SQUARE_ANNUAL_VARIATION_ID';
 if(!env[cfg])throw err('Square subscription plan not configured',503);
 const r=await fetchSquare('/v2/subscriptions/'+encodeURIComponent(subscriptionId),env,fetcher);
 const sub=r.subscription;
 if(sub?.id!==subscriptionId||sub.status!=='ACTIVE'||
   sub.location_id!==env.SQUARE_LOCATION_ID||sub.plan_variation_id!==env[cfg]||
   !sub.customer_id||sub.customer_id!==initialPayment.customerId||
   !dateValid(sub.paid_until_date))
   throw err('Square subscription is not verified and paid through a future date');
 return {provider:'windows',providerPurchaseId:'sqsub:'+sub.id,plan:checkout.plan,
   state:'active',validThrough:new Date(sub.paid_until_date+'T23:59:59Z').toISOString()};
}
// Resolve the actual Square payment from a previously persisted order.
export async function verifyPendingWindowsCheckout(checkout,env=process.env,fetcher=fetch) {
 if(!checkout||!['monthly','annual','lifetime'].includes(checkout.plan)||
   !/^[A-Za-z0-9:_-]{3,256}$/.test(checkout.orderId||''))
   throw err('No valid pending Square checkout',400);
 const orderResponse=await fetchSquare('/v2/orders/'+encodeURIComponent(checkout.orderId),env,fetcher);
 const tender=(orderResponse.order?.tenders||[]).find(t=>typeof t.payment_id==='string'&&t.payment_id.length>2);
 if(!tender)throw err('Square payment is not yet completed',409);
 const initial=await verifyCompletedCheckout({checkout,paymentId:tender.payment_id},env,fetcher);
 if(checkout.plan==='lifetime')return verifiedLifetimeEntitlement(initial);
 if(!initial.customerId)throw err('Square buyer account cannot be verified',409);
 const host=env.SQUARE_ENVIRONMENT==='production'?'https://connect.squareup.com':'https://connect.squareupsandbox.com';
 const result=await fetcher(host+'/v2/subscriptions/search',{
  method:'POST',headers:{Authorization:'Bearer '+env.SQUARE_ACCESS_TOKEN,
    'Square-Version':'2026-09-16','Content-Type':'application/json'},
  body:JSON.stringify({limit:100,query:{filter:{
    location_ids:[env.SQUARE_LOCATION_ID],customer_ids:[initial.customerId]}}}),
  redirect:'manual',signal:AbortSignal.timeout(12000)
 });
 if(!result.ok)throw err('Square subscription verification unavailable',503);
 const data=await result.json();
 if(data.cursor)throw err('Multiple Square subscriptions need reconciliation',409);
 const variation=env[checkout.plan==='monthly'?'KO_SQUARE_MONTHLY_VARIATION_ID':'KO_SQUARE_ANNUAL_VARIATION_ID'];
 const earliest=Date.parse(checkout.createdAt||'');
 if(!variation||!Number.isFinite(earliest))throw err('Square purchase configuration unavailable',503);
 const candidates=(data.subscriptions||[]).filter(item=>
   item.plan_variation_id===variation&&item.customer_id===initial.customerId&&
   item.location_id===env.SQUARE_LOCATION_ID&&item.status==='ACTIVE'&&
   Number.isFinite(Date.parse(item.created_at))&&Date.parse(item.created_at)>=earliest-120000);
 if(candidates.length!==1)throw err('Square subscription confirmation pending or ambiguous',409);
 return await verifyActiveSquareSubscription({subscriptionId:candidates[0].id,
   checkout,initialPayment:initial},env,fetcher);
}
export function verifiedLifetimeEntitlement(initialPayment) {
 if(initialPayment?.plan!=='lifetime'||!initialPayment.paymentId)throw err('No verified lifetime payment');
 return {provider:'windows',providerPurchaseId:'sqpay:'+initialPayment.paymentId,
   plan:'lifetime',state:'active',validThrough:null};
}
