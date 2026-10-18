// Server-authoritative catalogs copied from the existing live Square server.
// Kept in Cloudflare staging: production remains on Render until settlement and
// notification parity is verified across all affected applications.
export const catalogs=Object.freeze({
 quailflow:Object.freeze({
  'qf-nfc-1':{name:'1 Quail + Embedded NFC',cents:499},
  'qf-nfc-5':{name:'5 Quail + Embedded NFC',cents:2299},
  'qf-nfc-10':{name:'10 Quail + Embedded NFC',cents:3999},
  'qf-nfc-25':{name:'25 Quail + Embedded NFC',cents:8499}
 }),
 rabbitflow:Object.freeze({
  'rf-nfc-1':{name:'1 Rabbit + Embedded NFC',cents:499},
  'rf-nfc-5':{name:'5 Rabbits + Embedded NFC',cents:2299},
  'rf-nfc-10':{name:'10 Rabbits + Embedded NFC',cents:3999},
  'rf-nfc-25':{name:'25 Rabbits + Embedded NFC',cents:8499}
 })
});
const configs={
 quailflow:{prefix:'QUAILFLOW',brand:'QuailFlow Store',origin:'https://quailflow.app',disabledByDefault:true},
 rabbitflow:{prefix:'RABBITFLOW',brand:'RabbitFlow Store',origin:'https://rabbitflow.app'}
};
const fail=(status,message)=>Object.assign(new Error(message),{status});
const clean=(text,max=120)=>typeof text==='string'?text.trim().slice(0,max):'';
const allowOrigins=new Set(['https://quailflow.app','https://www.quailflow.app','https://rabbitflow.app','https://www.rabbitflow.app']);
export async function buildSharedCheckout(store,body,env,fetcher=fetch){
 const spec=configs[store],products=catalogs[store];
 if(!spec)throw fail(404,'Unknown store');
 if(spec.disabledByDefault&&env.QUAILFLOW_SALES_ENABLED!=='true')throw fail(503,'QuailFlow purchases are temporarily disabled');
 if(!['production','sandbox'].includes(env.SQUARE_ENVIRONMENT)||!env.SQUARE_ACCESS_TOKEN||!env.SQUARE_LOCATION_ID)throw fail(503,'Square checkout is not configured');
 if(!Array.isArray(body?.items)||body.items.length===0||body.items.length>50)throw fail(400,'Cart is empty or too large');
 if(typeof body.buyer?.email!=='string'||body.buyer.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.buyer.email))throw fail(400,'Valid buyer email required');
 let merchandise=0;
 const lineItems=[];
 for(const row of body.items){
  const product=products[String(row?.id||'')],quantity=Number(row?.quantity);
  if(!product)throw fail(400,'Unavailable product');
  if(!Number.isInteger(quantity)||quantity<1||quantity>50)throw fail(400,'Invalid quantity');
  merchandise+=product.cents*quantity;
  if(!Number.isSafeInteger(merchandise)||merchandise>5000000)throw fail(400,'Amount exceeds store limit');
  lineItems.push({name:product.name,quantity:String(quantity),item_type:'ITEM',base_price_money:{amount:product.cents,currency:'USD'}});
 }
 const shipping=Number(env[spec.prefix+'_STORE_FLAT_SHIPPING_CENTS']??env.STORE_FLAT_SHIPPING_CENTS??0);
 if(!Number.isSafeInteger(shipping)||shipping<0||shipping>100000||merchandise+shipping>5000000)throw fail(503,'Invalid shipping configuration');
 if(shipping)lineItems.push({name:'Standard Shipping',quantity:'1',item_type:'ITEM',base_price_money:{amount:shipping,currency:'USD'}});
 const name=[clean(body.buyer.firstName,80),clean(body.buyer.lastName,80)].filter(Boolean).join(' ').slice(0,120);
 const note=[spec.brand,name,clean(body.notes,350)].filter(Boolean).join(' • ').slice(0,500);
 const payload={
  idempotency_key:crypto.randomUUID(),
  order:{location_id:env.SQUARE_LOCATION_ID,line_items:lineItems,pricing_options:{auto_apply_taxes:true}},
  payment_note:note,
  checkout_options:{ask_for_shipping_address:true,redirect_url:env[spec.prefix+'_STORE_SUCCESS_URL']||spec.origin+'/order-success.html'},
  pre_populated_data:{buyer_email:body.buyer.email.trim()}
 };
 if(clean(body.buyer.phone,40))payload.pre_populated_data.buyer_phone_number=clean(body.buyer.phone,40);
 const host=env.SQUARE_ENVIRONMENT==='production'?'https://connect.squareup.com':'https://connect.squareupsandbox.com';
 const response=await fetcher(host+'/v2/online-checkout/payment-links',{
  method:'POST',redirect:'manual',
  headers:{Authorization:'Bearer '+env.SQUARE_ACCESS_TOKEN,'Square-Version':'2026-08-19','Content-Type':'application/json'},
  body:JSON.stringify(payload)
 });
 if(!response.ok)throw fail(502,'Square checkout failed');
 const link=(await response.json().catch(()=>({}))).payment_link||{};
 let url;try{url=new URL(link.url||link.long_url)}catch{throw fail(502,'Invalid Square URL')}
 if(url.protocol!=='https:'||!(url.hostname==='square.link'||url.hostname.endsWith('.square.link')||url.hostname.endsWith('.squareup.com')||url.hostname.endsWith('.squareupsandbox.com')))throw fail(502,'Unexpected Square URL');
 return {url:url.href,orderID:link.order_id||'',shippingCents:shipping};
}
const reply=(data,status,origin)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})}});
export async function handleSharedStore(request,env={},store,fetcher=fetch){
 const origin=request.headers.get('Origin')||'';
 if(origin&&!allowOrigins.has(origin))return reply({error:'Origin not allowed'},403,'');
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})}});
 if(request.method!=='POST')return reply({error:'Method not allowed'},405,origin);
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return reply({error:'JSON required'},415,origin);
 if(Number(request.headers.get('content-length')||0)>40000)return reply({error:'Cart too large'},413,origin);
 try{
  const raw=await request.text();
  if(raw.length>40000)throw fail(413,'Cart too large');
  const body=JSON.parse(raw);
  return reply(await buildSharedCheckout(store,body,env,fetcher),200,origin);
 }catch(e){return reply({error:e.status?e.message:'Checkout temporarily unavailable'},e.status||503,origin)}
}
