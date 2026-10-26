import {randomUUID} from 'node:crypto';

// The prices are set by the seller. Callers can choose a plan but cannot
// override pricing, subscription variation ID or checkout location.
export const WINDOWS_PLANS=Object.freeze({
 monthly:{amountCents:1099,name:'Kennel One Monthly',envKey:'KO_SQUARE_MONTHLY_VARIATION_ID'},
 annual:{amountCents:9999,name:'Kennel One Yearly',envKey:'KO_SQUARE_ANNUAL_VARIATION_ID'},
 lifetime:{amountCents:29999,name:'Kennel One Lifetime'}
});
const checkoutHost=url=>{
 try{
  const u=new URL(url);
  return u.protocol==='https:'&&(
   u.hostname==='square.link'||u.hostname.endsWith('.square.link')||
   u.hostname==='checkout.square.site'||u.hostname==='square.site'
  );
 }catch{return false}
};
const required=name=>Object.assign(Error(name+' is not configured'),{status:503});
export async function createWindowsPaymentLink({plan,kennelId,email,idempotencyKey=randomUUID()},env=process.env,fetcher=fetch){
 const offer=WINDOWS_PLANS[plan];
 if(!offer||typeof kennelId!=='string'||!/^[0-9a-f-]{36}$/.test(kennelId)||
    typeof email!=='string'||email.length>254||!email.includes('@'))
  throw Object.assign(Error('Invalid checkout request'),{status:400});
 const location=env.SQUARE_LOCATION_ID,token=env.SQUARE_ACCESS_TOKEN;
 if(!location)throw required('Square location');
 if(!token)throw required('Square access token');
 if(env.SQUARE_ENVIRONMENT!=='production'&&env.SQUARE_ENVIRONMENT!=='sandbox')
  throw required('Square environment');
 const variation=offer.envKey?env[offer.envKey]:null;
 if(offer.envKey&&!variation)throw required('Square subscription plan');
 const domain=env.SQUARE_ENVIRONMENT==='production'?'https://connect.squareup.com':'https://connect.squareupsandbox.com';
 const payload={
  idempotency_key:idempotencyKey,
  quick_pay:{name:offer.name,location_id:location,price_money:{amount:offer.amountCents,currency:'USD'}},
  checkout_options:{
   allow_tipping:false,
   redirect_url:'https://app.kennelone.app/?checkout=return',
   ...(variation?{subscription_plan_id:variation}:{})
  },
  description:offer.name+' · one Kennel One account on Windows, iPhone and Android',
  payment_note:'Kennel One subscription checkout'
 };
 const res=await fetcher(domain+'/v2/online-checkout/payment-links',{
  method:'POST',
  headers:{Authorization:'Bearer '+token,'Square-Version':'2026-09-16','Content-Type':'application/json'},
  body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(15000)
 });
 if(!res.ok)throw Object.assign(Error('Square checkout unavailable'),{status:503});
 const result=(await res.json()).payment_link;
 const link=result?.url||result?.long_url;
 if(!checkoutHost(link)||!result?.order_id||typeof result.order_id!=='string'||!result.id)
  throw Object.assign(Error('Square checkout verification failed'),{status:502});
 return {url:link,orderId:result.order_id,linkId:result.id,plan,amountCents:offer.amountCents};
}
