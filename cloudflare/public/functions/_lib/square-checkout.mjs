// Standalone Kennel One storefront checkout for Cloudflare Pages Functions.
// Runtime secrets are Cloudflare bindings, never source code or browser inputs.
// Store orders remain Square-hosted (no card PAN/CVV enters this application).
export const PRODUCT_CATALOG = Object.freeze({
  'dog-tag': {name:'Smart Kennel Management Dog Tag',cents:999},
  'kennel-crate-tag': {name:'Smart Kennel Management Kennel/Crate Tag',cents:1499},
  'nfc-1': {name:'Kennel One NFC Tag',cents:499},
  'nfc-5': {name:'5-Pack NFC Tags',cents:2299},
  'nfc-10': {name:'10-Pack NFC Tags',cents:3999},
  'nfc-25': {name:'25-Pack NFC Tags',cents:8499},
  'holder-kit': {name:'NFC Tag + Kennel Holder',cents:1499},
  'holder-5': {name:'5-Kennel Smart Holder Set',cents:6999},
  'facility-kit': {name:'10-Kennel Smart Facility Kit',cents:13499}
});
const error = (message,status=400)=>Object.assign(new Error(message),{status});
function clean(v,max){return typeof v==='string'?v.trim().slice(0,max):''}
export async function createSquareCheckout(payload,env,fetcher=fetch) {
  if(!env.SQUARE_ACCESS_TOKEN||!env.SQUARE_LOCATION_ID||!['production','sandbox'].includes(env.SQUARE_ENVIRONMENT))
    throw error('Square checkout is not configured',503);
  const items=payload.items,buyer=payload.buyer;
  if(!Array.isArray(items)||!items.length||items.length>50)throw error('Your cart is empty or too large.');
  if(!buyer||typeof buyer!=='object'||typeof buyer.email!=='string'||buyer.email.length>254||!/^\S+@\S+\.\S+$/.test(buyer.email))
    throw error('A valid email address is required.');
  const lineItems=[];let merchandiseCents=0;
  for(const row of items){
    if(!row||typeof row!=='object'||!Object.hasOwn(PRODUCT_CATALOG,String(row.id||'')))throw error('Your cart contains an unavailable item.');
    const product=PRODUCT_CATALOG[String(row.id)];
    const count=Number(row.quantity);
    if(!Number.isInteger(count)||count<1||count>50)throw error('Choose a valid quantity (1–50).');
    const cents=product.cents*count;
    merchandiseCents+=cents;
    if(!Number.isSafeInteger(merchandiseCents)||merchandiseCents>5000000)throw error('Order total is outside the allowed range.');
    lineItems.push({name:product.name,quantity:String(count),item_type:'ITEM',
      base_price_money:{amount:product.cents,currency:'USD'}});
  }
  if(merchandiseCents===0)throw error('Your cart is empty.');
  const configuredShipping=Number(env.STORE_FLAT_SHIPPING_CENTS||0);
  if(!Number.isSafeInteger(configuredShipping)||configuredShipping<0||configuredShipping>100000)
    throw error('Store shipping is incorrectly configured',503);
  if(merchandiseCents+configuredShipping>5000000)throw error('Order total is outside the allowed range.');
  if(configuredShipping>0)lineItems.push({name:'Standard Shipping',quantity:'1',
    item_type:'ITEM',base_price_money:{amount:configuredShipping,currency:'USD'}});
  const fullName=[clean(buyer.firstName,120),clean(buyer.lastName,120)].filter(Boolean).join(' ').slice(0,120);
  const paymentNote=['Kennel One Store',fullName,clean(payload.notes,350)].filter(Boolean).join(' • ').slice(0,500);
  const body={
    idempotency_key:crypto.randomUUID(),
    order:{location_id:env.SQUARE_LOCATION_ID,line_items:lineItems,pricing_options:{auto_apply_taxes:true}},
    payment_note:paymentNote,
    checkout_options:{ask_for_shipping_address:true,redirect_url:env.STORE_SUCCESS_URL||'https://kennelone.app/order-success.html'},
    pre_populated_data:{buyer_email:buyer.email.trim()}
  };
  const phone=clean(buyer.phone,40);
  if(phone)body.pre_populated_data.buyer_phone_number=phone;
  const squareHost=env.SQUARE_ENVIRONMENT==='production'?'https://connect.squareup.com':'https://connect.squareupsandbox.com';
  const response=await fetcher(squareHost+'/v2/online-checkout/payment-links',{
    method:'POST',headers:{Authorization:'Bearer '+env.SQUARE_ACCESS_TOKEN,'Square-Version':'2026-08-19','Content-Type':'application/json'},
    body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(20000)
  });
  if(response.status>=300&&response.status<400)throw error('Square returned an unexpected redirect',502);
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw error(data?.errors?.[0]?.detail||data?.errors?.[0]?.code||'Square checkout could not be created.',502);
  const url=data?.payment_link?.url||data?.payment_link?.long_url;
  let parsed;try{parsed=new URL(url)}catch{throw error('Square returned an invalid checkout link',502)}
  if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.square.link')&&!['square.link','squareup.com','sandbox.square.link'].includes(parsed.hostname)&&!parsed.hostname.endsWith('.squareup.com')&&
    !parsed.hostname.endsWith('.squareupsandbox.com'))throw error('Square returned an unexpected checkout domain',502);
  return {url,orderID:data?.payment_link?.order_id||'',shippingCents:configuredShipping};
}
