// Yard Patrol Square-hosted payment link compatibility (isolated staging only).
// Its separate customer portal PostgreSQL database must also migrate before Render retirement.
const failure=(status,message)=>Object.assign(Error(message),{status});
const sqHost=env=>{
 if(!env.SQUARE_ACCESS_TOKEN||!env.SQUARE_LOCATION_ID||!['production','sandbox'].includes(env.SQUARE_ENVIRONMENT))throw failure(503,'Square gateway unavailable');
 return env.SQUARE_ENVIRONMENT==='production'?'https://connect.squareup.com':'https://connect.squareupsandbox.com';
};
const sqHeaders=env=>({Authorization:'Bearer '+env.SQUARE_ACCESS_TOKEN,'Square-Version':'2026-08-19','Content-Type':'application/json'});
const money=value=>Number.isSafeInteger(value)&&value>0&&value<=5000000;
const invoice=value=>Number.isSafeInteger(value)&&value>0;
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const squareLink=link=>{
 let url;try{url=new URL(link?.url||link?.long_url)}catch{throw failure(502,'Invalid Square checkout URL')}
 if(url.protocol!=='https:'||!(url.hostname==='square.link'||url.hostname==='checkout.square.site'||url.hostname.endsWith('.square.link')||url.hostname.endsWith('.squareup.com')||url.hostname.endsWith('.squareupsandbox.com')))throw failure(502,'Unexpected Square checkout URL');
 return url.href;
};
export async function createYardPatrolCheckout(data,env,fetcher=fetch){
 const invoiceNumber=Number(data?.invoiceNumber),amountCents=Number(data?.amountCents),customerName=text(data?.customerName,120),email=text(data?.email,254),phone=text(data?.phone,40);
 if(!invoice(invoiceNumber))throw failure(400,'A valid invoice number is required');
 if(!money(amountCents))throw failure(400,'Payment amount is invalid');
 if(!customerName)throw failure(400,'Customer name is required');
 const host=sqHost(env);
 const body={
  idempotency_key:crypto.randomUUID(),
  description:'Yard Patrol Invoice #'+invoiceNumber,
  quick_pay:{name:'Yard Patrol Pet Waste Removal — Invoice #'+invoiceNumber,
   price_money:{amount:amountCents,currency:'USD'},location_id:env.SQUARE_LOCATION_ID},
  payment_note:'Yard Patrol Invoice #'+invoiceNumber+' • '+customerName,
  checkout_options:{allow_tipping:false}
 };
 if(email.includes('@')||phone)body.pre_populated_data={...(email.includes('@')?{buyer_email:email}:{}),...(phone?{buyer_phone_number:phone}:{})};
 const response=await fetcher(host+'/v2/online-checkout/payment-links',{method:'POST',
  headers:sqHeaders(env),body:JSON.stringify(body),redirect:'manual'});
 if(!response.ok)throw failure(502,'Square checkout could not be created');
 const link=(await response.json().catch(()=>({}))).payment_link;
 return {url:squareLink(link),orderID:link?.order_id||'',checkoutID:link?.id||''};
}
export async function verifyYardPatrolCheckout(data,env,fetcher=fetch){
 const orderID=text(data?.orderID,193),expectedAmountCents=Number(data?.amountCents),invoiceNumber=Number(data?.invoiceNumber);
 if(!orderID||orderID.length>192)throw failure(400,'A valid Square order ID is required');
 if(!money(expectedAmountCents)||!invoice(invoiceNumber))throw failure(400,'A valid invoice and payment amount are required');
 const host=sqHost(env),response=await fetcher(host+'/v2/orders/'+encodeURIComponent(orderID),{
  headers:sqHeaders(env),redirect:'manual'});
 if(!response.ok)throw failure(502,'Square order could not be retrieved');
 const order=(await response.json().catch(()=>({}))).order;
 if(!order||order.location_id!==env.SQUARE_LOCATION_ID)throw failure(400,'Square order location mismatch');
 const label='Yard Patrol Pet Waste Removal — Invoice #'+invoiceNumber;
 if(Number(order.total_money?.amount)!==expectedAmountCents||!order.line_items?.some(x=>x?.name===label))
  throw failure(400,'Square order does not match this invoice');
 const paid=order.state==='COMPLETED';
 const tender=order.tenders?.find(x=>x?.payment_id);
 return {paid,status:order.state||'OPEN',orderID,paymentID:String(tender?.payment_id||'')};
}
export async function cancelYardPatrolCheckout(data,env,fetcher=fetch){
 const checkoutID=text(data?.checkoutID,193),orderID=text(data?.orderID,193);
 if(!checkoutID||checkoutID.length>192||!orderID||orderID.length>192)throw failure(400,'Checkout and order ID required');
 const host=sqHost(env),response=await fetcher(host+'/v2/online-checkout/payment-links/'+encodeURIComponent(checkoutID),{
  method:'DELETE',headers:sqHeaders(env),redirect:'manual'});
 if(!response.ok)throw failure(502,'Square checkout cancellation failed');
 const returned=String((await response.json().catch(()=>({}))).cancelled_order_id||'');
 if(returned&&returned!==orderID)throw failure(400,'Square canceled an unexpected order');
 return {canceled:true,orderID:returned||orderID};
}
export async function handleYardPatrol(request,env={},operation,fetcher=fetch){
 const origin=request.headers.get('Origin')||'';
 const allowed=new Set(['https://yardpatrol.app','https://www.yardpatrol.app']);
 if(origin&&!allowed.has(origin))return Response.json({error:'Origin not allowed'},{status:403});
 const headers={'Cache-Control':'no-store','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{})};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
 if(request.method!=='POST')return Response.json({error:'Method not allowed'},{status:405,headers});
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return Response.json({error:'JSON required'},{status:415,headers});
 if(Number(request.headers.get('Content-Length')||0)>32768)return Response.json({error:'Request too large'},{status:413,headers});
 try{
  const raw=await request.text();
  if(raw.length>32768)throw failure(413,'Request too large');
  const body=JSON.parse(raw);
  const fn={create:createYardPatrolCheckout,status:verifyYardPatrolCheckout,cancel:cancelYardPatrolCheckout}[operation];
  if(!fn)throw failure(404,'Unknown operation');
  return Response.json(await fn(body,env,fetcher),{headers});
 }catch(e){return Response.json({error:e.status?e.message:'Gateway temporarily unavailable'},{status:e.status||503,headers})}
}
