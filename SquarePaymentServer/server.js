import express from 'express';
import crypto from 'crypto';
import { Client, Environment } from 'square/legacy';
import { installYardPatrolPortalRoutes } from './yardpatrol-portal.js';
import { installKennelFlowOrderNotificationRoutes } from './kennelflow-order-notifications.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb', verify:(req,res,buf)=>{ req.rawBody=buf.toString('utf8'); } }));

const isProduction = process.env.SQUARE_ENVIRONMENT === 'production';
const accessToken = process.env.SQUARE_ACCESS_TOKEN;
const configuredLocationID = (process.env.SQUARE_LOCATION_ID || '').trim();
const maxPaymentCents = Number.parseInt(process.env.MAX_PAYMENT_CENTS || '5000000', 10);
const flatShippingCents = Math.max(0, Number.parseInt(process.env.STORE_FLAT_SHIPPING_CENTS || '0', 10));
const storeOrigin = process.env.STORE_ORIGIN || 'https://kennelflowpro.app';
const storeSuccessURL = process.env.STORE_SUCCESS_URL || 'https://kennelflowpro.app/order-success.html';
const quailFlowStoreSuccessURL = process.env.QUAILFLOW_STORE_SUCCESS_URL || 'https://quailflow.app/order-success.html';
// QuailFlow purchases are disabled unless an operator explicitly enables them.
const quailFlowSalesEnabled = process.env.QUAILFLOW_SALES_ENABLED === 'true';
const quailFlowFlatShippingCents = Math.max(0, Number.parseInt(process.env.QUAILFLOW_STORE_FLAT_SHIPPING_CENTS || process.env.STORE_FLAT_SHIPPING_CENTS || '0', 10));
const rabbitFlowStoreSuccessURL = process.env.RABBITFLOW_STORE_SUCCESS_URL || 'https://rabbitflow.app/order-success.html';
const rabbitFlowFlatShippingCents = Math.max(0, Number.parseInt(process.env.RABBITFLOW_STORE_FLAT_SHIPPING_CENTS || process.env.STORE_FLAT_SHIPPING_CENTS || '0', 10));
const squareApiBase = isProduction ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
const squareApiVersion = '2026-08-19';

if (!accessToken) { console.error('Missing SQUARE_ACCESS_TOKEN'); process.exit(1); }
if (!configuredLocationID) { console.error('Missing SQUARE_LOCATION_ID'); process.exit(1); }

const environment = isProduction ? Environment.Production : Environment.Sandbox;
const client = new Client({ bearerAuthCredentials: { accessToken }, environment });

// Non-transactional sandbox startup verification (never logs credentials).
{
  void (async()=>{
    try{
      const response=await fetch(squareApiBase+'/v2/locations',{headers:{Authorization:'Bearer '+accessToken,'Square-Version':squareApiVersion}});
      const result=await response.json();
      const active=(result.locations||[]).filter(location=>location.status==='ACTIVE'&&location.id);
      console.info('KennelFlow Square credential check',{
        environment:isProduction?'production':'sandbox',
        httpStatus:response.status,
        squareCode:response.ok?'OK':result.errors?.[0]?.code||'UNKNOWN',
        activeLocationCount:active.length,
        configuredLocationMatches:active.some(location=>location.id===configuredLocationID),
        autoSelectSingleLocation:active.length===1
      });
    }catch(error){console.warn('KennelFlow Square sandbox credential check network failure',{reason:error?.name||'unknown'});}
  })();
}


const PRODUCTS = Object.freeze({
  'dog-tag': { name: 'Smart Kennel Management Dog Tag', cents: 999 },
  'kennel-crate-tag': { name: 'Smart Kennel Management Kennel/Crate Tag', cents: 1499 },
  'nfc-1': { name: 'KennelFlow NFC Tag', cents: 499 },
  'nfc-5': { name: '5-Pack NFC Tags', cents: 2299 },
  'nfc-10': { name: '10-Pack NFC Tags', cents: 3999 },
  'nfc-25': { name: '25-Pack NFC Tags', cents: 8499 },
  'holder-kit': { name: 'NFC Tag + Kennel Holder', cents: 1499 },
  'holder-5': { name: '5-Kennel Smart Holder Set', cents: 6999 },
  'facility-kit': { name: '10-Kennel Smart Facility Kit', cents: 13499 }
});

const QUAILFLOW_PRODUCTS = Object.freeze({
  'qf-nfc-1': { name: '1 Quail + Embedded NFC', cents: 499 },
  'qf-nfc-5': { name: '5 Quail + Embedded NFC', cents: 2299 },
  'qf-nfc-10': { name: '10 Quail + Embedded NFC', cents: 3999 },
  'qf-nfc-25': { name: '25 Quail + Embedded NFC', cents: 8499 }
});

const RABBITFLOW_PRODUCTS = Object.freeze({
  'rf-nfc-1': { name: '1 Rabbit + Embedded NFC', cents: 499 },
  'rf-nfc-5': { name: '5 Rabbits + Embedded NFC', cents: 2299 },
  'rf-nfc-10': { name: '10 Rabbits + Embedded NFC', cents: 3999 },
  'rf-nfc-25': { name: '25 Rabbits + Embedded NFC', cents: 8499 }
});

function cors(req,res,next){
  const origin=req.headers.origin;
  const allowed=new Set([storeOrigin,'https://kennelflow.github.io','https://kennelflowpro.app','https://www.kennelflowpro.app','https://quailflow.app','https://www.quailflow.app','https://rabbitflow.app','https://www.rabbitflow.app','https://yardpatrol.app','https://www.yardpatrol.app']);
  if(origin && allowed.has(origin)) res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS') return res.sendStatus(204);
  next();
}
app.use(cors);

app.get('/health', (_, res) => res.json({ ok: true, environment: isProduction ? 'production' : 'sandbox', storeCheckout: true, quailFlowStoreCheckout: quailFlowSalesEnabled, yardPatrolCheckout: true }));
app.get('/square/config', (_, res) => res.json({ environment: isProduction ? 'production' : 'sandbox', locationIDConfigured: Boolean(configuredLocationID), maxPaymentCents }));

installKennelFlowOrderNotificationRoutes(app,{
  accessToken,
  configuredLocationID,
  squareApiBase,
  squareApiVersion,
  stores:{ KennelFlow:PRODUCTS, QuailFlow:QUAILFLOW_PRODUCTS, RabbitFlow:RABBITFLOW_PRODUCTS }
});

// Authenticated KennelFlow Business payment links. Never mark an invoice paid here.
app.post('/kennelflow/checkout', async (req,res)=>{
  try{
    const secret=process.env.KENNELFLOW_CHECKOUT_SECRET;
    const stamp=req.header('X-KF-Timestamp')||'',sig=req.header('X-KF-Signature')||'';
    if(!secret||secret.length<32)return res.status(503).json({error:'Secure kennel checkout is unavailable'});
    if(!/^\d{13}$/.test(stamp)||Math.abs(Date.now()-Number(stamp))>120000||!/^[a-f0-9]{64}$/.test(sig)){console.warn('KF checkout rejected: timestamp or signature format');return res.status(403).json({error:'Invalid checkout authorization'});}
    const body=JSON.stringify(req.body);
    const expected=crypto.createHmac('sha256',secret).update(stamp+'.'+(req.rawBody||body)).digest('hex');
    if(!crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(expected,'hex'))){console.warn('KF checkout rejected: signed body mismatch');return res.status(403).json({error:'Invalid checkout authorization'});}
    const {kennelID,amountCents,customerName,description,reference,requestID}=req.body||{};
    if(!/^[a-f0-9-]{36}$/i.test(kennelID||'')||!Number.isSafeInteger(amountCents)||amountCents<100||amountCents>maxPaymentCents||
       typeof customerName!=='string'||!customerName.trim()||customerName.length>120||
       typeof description!=='string'||description.length>250||typeof reference!=='string'||reference.length>120||
       !/^[a-f0-9]{32}$/.test(requestID||''))return res.status(400).json({error:'Invalid checkout details'});
    // Sandbox credentials can be regenerated for a different Square application.
    // Resolve the sandbox location from Square rather than trusting a stale Render value.
    let checkoutLocationID=configuredLocationID;
    if(!isProduction){
      const locationsResponse=await fetch(squareApiBase+'/v2/locations',{
        headers:{Authorization:'Bearer '+accessToken,'Square-Version':squareApiVersion}
      });
      const locationsData=await locationsResponse.json();
      if(!locationsResponse.ok){
        const issue=locationsData?.errors?.[0]||{};
        console.warn('KennelFlow sandbox location lookup rejected',{httpStatus:locationsResponse.status,code:issue.code||'UNKNOWN'});
        return res.status(502).json({error:'Square sandbox location lookup failed ('+(issue.code||'UNKNOWN')+'). Check the sandbox credentials.'});
      }
      const available=(locationsData.locations||[]).filter(location=>location.status==='ACTIVE'&&location.id);
      const configured=available.find(location=>location.id===configuredLocationID);
      if(configured)checkoutLocationID=configured.id;
      else if(available.length===1){
        checkoutLocationID=available[0].id;
        console.info('KennelFlow sandbox selected the sole active location for the connected Square application');
      }else{
        console.warn('KennelFlow sandbox location cannot be resolved',{activeLocationCount:available.length});
        return res.status(409).json({error:'Square sandbox location mismatch. The connected Square application has '+available.length+' active locations; update SQUARE_SANDBOX_LOCATION_ID in Render to an active location in that application.'});
      }
    }
    const bodySquare={idempotency_key:requestID,order:{location_id:checkoutLocationID,line_items:[{
      name:'KennelFlow service payment',quantity:'1',base_price_money:{amount:amountCents,currency:'USD'}
    }]},payment_note:['KennelFlow Business',kennelID,customerName,description,reference].filter(Boolean).join(' • ').slice(0,500)};
    const sq=await fetch(squareApiBase+'/v2/online-checkout/payment-links',{
      method:'POST',headers:{Authorization:'Bearer '+accessToken,'Square-Version':squareApiVersion,'Content-Type':'application/json'},body:JSON.stringify(bodySquare)
    });
    const data=await sq.json();
    if(!sq.ok){const issue=data?.errors?.[0]||{};console.warn('KennelFlow Square checkout rejected',{environment:isProduction?'production':'sandbox',httpStatus:sq.status,code:issue.code||'UNKNOWN',category:issue.category||'UNKNOWN'});return res.status(502).json({error:'Square rejected checkout ('+(issue.code||'UNKNOWN')+'): '+(issue.detail||'Contact Square support'),squareCode:issue.code||'UNKNOWN'});}
    const url=data?.payment_link?.url||data?.payment_link?.long_url;
    if(typeof url!=='string'||!url.startsWith('https://'))return res.status(502).json({error:'Invalid Square checkout link'});
    return res.json({url,orderID:data.payment_link.order_id||'',status:'AWAITING_CUSTOMER_PAYMENT'});
  }catch(e){return res.status(502).json({error:'Unable to create checkout'})}
});
app.post('/kennelflow/checkout-status',async(req,res)=>{
  try{
    const secret=process.env.KENNELFLOW_CHECKOUT_SECRET;
    const stamp=req.header('X-KF-Timestamp')||'',sig=req.header('X-KF-Signature')||'';
    if(!secret||secret.length<32)return res.status(503).json({error:'Secure verification unavailable'});
    if(!/^\d{13}$/.test(stamp)||Math.abs(Date.now()-Number(stamp))>120000||!/^[a-f0-9]{64}$/.test(sig))return res.status(403).json({error:'Unauthorized'});
    const expected=crypto.createHmac('sha256',secret).update(stamp+'.'+(req.rawBody||JSON.stringify(req.body))).digest('hex');
    if(!crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(expected,'hex')))return res.status(403).json({error:'Unauthorized'});
    const {orderID,amountCents}=req.body||{};
    if(typeof orderID!=='string'||!orderID||orderID.length>192||!Number.isSafeInteger(amountCents)||amountCents<100)return res.status(400).json({error:'Invalid order details'});
    const headers={Authorization:'Bearer '+accessToken,'Square-Version':squareApiVersion};
    let verifiedLocationID=configuredLocationID;
    if(!isProduction){
      const locationsRes=await fetch(squareApiBase+'/v2/locations',{headers});
      const locationsData=await locationsRes.json();
      if(!locationsRes.ok)return res.status(502).json({error:'Could not verify sandbox location'});
      const active=(locationsData.locations||[]).filter(location=>location.status==='ACTIVE'&&location.id);
      if(active.some(location=>location.id===verifiedLocationID))verifiedLocationID=configuredLocationID;
      else if(active.length===1)verifiedLocationID=active[0].id;
      else return res.status(409).json({error:'Sandbox location is ambiguous'});
    }
    const orderRes=await fetch(squareApiBase+'/v2/orders/'+encodeURIComponent(orderID),{headers});
    const orderData=await orderRes.json();
    if(!orderRes.ok)return res.status(502).json({error:'Could not verify Square order'});
    const order=orderData?.order;
    const valid=order?.location_id===verifiedLocationID&&Number(order?.total_money?.amount)===amountCents&&Array.isArray(order?.line_items)&&order.line_items.some(x=>x.name==='KennelFlow service payment');
    if(!valid)return res.status(409).json({error:'Square order details do not match'});
    const ids=(order.tenders||[]).map(x=>x.payment_id).filter(Boolean);
    let paid=false,paymentID='';
    for(const id of ids){
      const response=await fetch(squareApiBase+'/v2/payments/'+encodeURIComponent(id),{headers});
      if(!response.ok)continue;
      const payment=(await response.json()).payment;
      if(payment?.status==='COMPLETED'&&payment?.order_id===orderID&&payment?.location_id===verifiedLocationID&&Number(payment?.amount_money?.amount)===amountCents){paid=true;paymentID=id;break}
    }
    return res.json({paid,paymentID,orderID,status:paid?'COMPLETED':String(order?.state||'PENDING'),environment:isProduction?'production':'sandbox'});
  }catch{return res.status(502).json({error:'Square payment verification failed'})}
});
// Recover an already completed KennelFlow checkout by merchant reference.
// Only signed calls can use this route, and a payment must be tied to the caller's kennel.
app.post('/kennelflow/recover-payment',async(req,res)=>{
  try{
    const secret=process.env.KENNELFLOW_CHECKOUT_SECRET;
    const stamp=req.header('X-KF-Timestamp')||'',sig=req.header('X-KF-Signature')||'';
    if(!secret||secret.length<32)return res.status(503).json({error:'Secure payment recovery unavailable'});
    if(!/^[0-9]{13}$/.test(stamp)||Math.abs(Date.now()-Number(stamp))>120000||!/^[a-f0-9]{64}$/.test(sig))return res.status(403).json({error:'Unauthorized'});
    const expected=crypto.createHmac('sha256',secret).update(stamp+'.'+(req.rawBody||JSON.stringify(req.body))).digest('hex');
    if(!crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(expected,'hex')))return res.status(403).json({error:'Unauthorized'});
    const {kennelID,reference,amountCents}=req.body||{};
    if(!/^[a-f0-9-]{36}$/i.test(kennelID||'')||typeof reference!=='string'||!reference.trim()||reference.length>120||!Number.isSafeInteger(amountCents)||amountCents<100||amountCents>maxPaymentCents)return res.status(400).json({error:'Invalid payment recovery details'});
    const headers={Authorization:'Bearer '+accessToken,'Square-Version':squareApiVersion};
    const begin=new Date(Date.now()-30*86400000).toISOString();
    let cursor='',match=null,matchingCount=0,pages=0;
    do{
      const params=new URLSearchParams({begin_time:begin,location_id:configuredLocationID,sort_order:'DESC',limit:'100'});
      if(cursor)params.set('cursor',cursor);
      const response=await fetch(squareApiBase+'/v2/payments?'+params,{headers});
      const payload=await response.json();
      if(!response.ok)return res.status(502).json({error:'Square payment search failed',squareCode:payload.errors?.[0]?.code||'UNKNOWN'});
      for(const payment of payload.payments||[]){
        if(payment.status!=='COMPLETED'||payment.location_id!==configuredLocationID||Number(payment.amount_money?.amount)!==amountCents||!payment.order_id)continue;
        const orderRes=await fetch(squareApiBase+'/v2/orders/'+encodeURIComponent(payment.order_id),{headers});
        if(!orderRes.ok)continue;
        const order=(await orderRes.json()).order;
        if(order?.location_id!==configuredLocationID||Number(order?.total_money?.amount)!==amountCents||!order.line_items?.some(x=>x.name==='KennelFlow service payment'))continue;
        const combined=[payment.note||'',order.note||''].join(' • ');
        // Checkout notes contain "KennelFlow Business • <kennel UUID> • customer • description • reference".
        const parts=combined.split(' • ').map(x=>x.trim());
        const base=parts.findIndex(x=>x==='KennelFlow Business');
        if(base<0||parts[base+1]?.toLowerCase()!==kennelID.toLowerCase()||parts[base+parts.length-1]===undefined)continue;
        if(!parts.slice(base+2).includes(reference.trim()))continue;
        matchingCount++;
        match={paid:true,status:'COMPLETED',orderID:payment.order_id,paymentID:payment.id,amountCents,environment:isProduction?'production':'sandbox'};
        if(matchingCount>1)break;
      }
      if(matchingCount>1)break;
      cursor=payload.cursor||'';pages++;
    }while(cursor&&pages<10);
    if(matchingCount>1)return res.status(409).json({error:'More than one matching payment found. Narrow the reference to a unique value.'});
    if(!match)return res.status(404).json({error:'No completed Square payment matched this kennel, amount, and reference in the last 30 days.'});
    return res.json(match);
  }catch(e){console.warn('KennelFlow payment recovery error',{name:e?.name||'unknown'});return res.status(502).json({error:'Could not recover Square payment'})}
});
app.post('/square/create-payment', async (req, res) => {
  try {
    const { sourceID, locationID, amountCents, currency='USD', customerName='', description='', idempotencyKey:clientIdempotencyKey='' } = req.body ?? {};
    if (!sourceID || !locationID || !Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error:'Missing or invalid payment fields.' });
    if (amountCents > maxPaymentCents) return res.status(400).json({ error:'Payment amount exceeds the configured server limit.' });
    if (configuredLocationID && locationID !== configuredLocationID) return res.status(400).json({ error:'Location ID does not match the configured Square location.' });
    if (currency !== 'USD') return res.status(400).json({ error:'Only USD payments are enabled for this KennelFlow server.' });
    const idempotencyKey=(clientIdempotencyKey||crypto.randomUUID()).slice(0,45);
    const response=await client.paymentsApi.createPayment({ sourceId:sourceID,idempotencyKey,locationId:locationID,amountMoney:{amount:BigInt(amountCents),currency},note:[customerName,description].filter(Boolean).join(' • ').slice(0,500) });
    const payment=response.result.payment;
    return res.json({ paymentID:payment?.id??idempotencyKey,status:payment?.status??'COMPLETED' });
  } catch (error) {
    const detail=error?.result?.errors?.[0]?.detail||error?.message||'Square payment failed.';
    return res.status(500).json({ error:detail });
  }
});

app.post('/store/create-checkout', async (req,res) => {
  try {
    const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
    const buyer=req.body?.buyer||{};
    const notes=String(req.body?.notes||'').trim().slice(0,350);
    if(!rawItems.length) return res.status(400).json({error:'Your cart is empty.'});
    if(!String(buyer.email||'').includes('@')) return res.status(400).json({error:'A valid email address is required.'});

    const lineItems=[];
    let merchandiseCents=0;
    for(const row of rawItems){
      const product=PRODUCTS[String(row?.id||'')];
      const quantity=Math.max(1,Math.min(50,Number.parseInt(row?.quantity,10)||0));
      if(!product) return res.status(400).json({error:'Your cart contains an unavailable item.'});
      merchandiseCents += product.cents*quantity;
      lineItems.push({name:product.name,quantity:String(quantity),item_type:'ITEM',base_price_money:{amount:product.cents,currency:'USD'}});
    }
    if(merchandiseCents<=0 || merchandiseCents>maxPaymentCents) return res.status(400).json({error:'Order total is outside the allowed range.'});

    if(flatShippingCents>0){lineItems.push({name:'Standard Shipping',quantity:'1',item_type:'ITEM',base_price_money:{amount:flatShippingCents,currency:'USD'}});}

    const name=[buyer.firstName,buyer.lastName].filter(Boolean).join(' ').trim();
    const paymentNote=['KennelFlow Store',name,notes].filter(Boolean).join(' • ').slice(0,500);
    const body={
      idempotency_key:crypto.randomUUID(),
      order:{location_id:configuredLocationID,line_items:lineItems,pricing_options:{auto_apply_taxes:true}},
      payment_note:paymentNote,
      checkout_options:{ask_for_shipping_address:true,redirect_url:storeSuccessURL},
      pre_populated_data:{buyer_email:String(buyer.email||'').trim()}
    };
    if(String(buyer.phone||'').trim()) body.pre_populated_data.buyer_phone_number=String(buyer.phone).trim();

    const sq=await fetch(`${squareApiBase}/v2/online-checkout/payment-links`,{
      method:'POST',headers:{'Authorization':`Bearer ${accessToken}`,'Square-Version':squareApiVersion,'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    const data=await sq.json();
    if(!sq.ok){const detail=data?.errors?.[0]?.detail||data?.errors?.[0]?.code||'Square checkout could not be created.';return res.status(502).json({error:detail});}
    return res.json({url:data?.payment_link?.url||data?.payment_link?.long_url,orderID:data?.payment_link?.order_id||'',shippingCents:flatShippingCents});
  } catch(error){return res.status(500).json({error:error?.message||'Unable to create checkout.'});}
});


app.post('/quailflow/store/create-checkout', async (req,res) => {
  if (!quailFlowSalesEnabled) {
    return res.status(503).json({ error: 'QuailFlow purchases are temporarily disabled. Please check back later.' });
  }
  try {
    const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
    const buyer=req.body?.buyer||{};
    const notes=String(req.body?.notes||'').trim().slice(0,350);
    if(!rawItems.length) return res.status(400).json({error:'Your cart is empty.'});
    if(!String(buyer.email||'').includes('@')) return res.status(400).json({error:'A valid email address is required.'});

    const lineItems=[];
    let merchandiseCents=0;
    for(const row of rawItems){
      const product=QUAILFLOW_PRODUCTS[String(row?.id||'')];
      const quantity=Math.max(1,Math.min(50,Number.parseInt(row?.quantity,10)||0));
      if(!product) return res.status(400).json({error:'Your cart contains an unavailable item.'});
      merchandiseCents += product.cents*quantity;
      lineItems.push({name:product.name,quantity:String(quantity),item_type:'ITEM',base_price_money:{amount:product.cents,currency:'USD'}});
    }
    if(merchandiseCents<=0 || merchandiseCents>maxPaymentCents) return res.status(400).json({error:'Order total is outside the allowed range.'});

    if(quailFlowFlatShippingCents>0){
      lineItems.push({name:'Standard Shipping',quantity:'1',item_type:'ITEM',base_price_money:{amount:quailFlowFlatShippingCents,currency:'USD'}});
    }

    const name=[buyer.firstName,buyer.lastName].filter(Boolean).join(' ').trim();
    const paymentNote=['QuailFlow Store',name,notes].filter(Boolean).join(' • ').slice(0,500);
    const body={
      idempotency_key:crypto.randomUUID(),
      order:{location_id:configuredLocationID,line_items:lineItems,pricing_options:{auto_apply_taxes:true}},
      payment_note:paymentNote,
      checkout_options:{ask_for_shipping_address:true,redirect_url:quailFlowStoreSuccessURL},
      pre_populated_data:{buyer_email:String(buyer.email||'').trim()}
    };
    if(String(buyer.phone||'').trim()) body.pre_populated_data.buyer_phone_number=String(buyer.phone).trim();

    const sq=await fetch(squareApiBase+'/v2/online-checkout/payment-links',{
      method:'POST',
      headers:{'Authorization':'Bearer '+accessToken,'Square-Version':squareApiVersion,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const data=await sq.json();
    if(!sq.ok){
      const detail=data?.errors?.[0]?.detail||data?.errors?.[0]?.code||'Square checkout could not be created.';
      return res.status(502).json({error:detail});
    }
    return res.json({url:data?.payment_link?.url||data?.payment_link?.long_url,orderID:data?.payment_link?.order_id||'',shippingCents:quailFlowFlatShippingCents});
  } catch(error){
    return res.status(500).json({error:error?.message||'Unable to create checkout.'});
  }
});

app.post('/rabbitflow/store/create-checkout', async (req,res) => {
  try {
    const rawItems=Array.isArray(req.body?.items)?req.body.items:[];
    const buyer=req.body?.buyer||{};
    const notes=String(req.body?.notes||'').trim().slice(0,350);
    if(!rawItems.length) return res.status(400).json({error:'Your cart is empty.'});
    if(!String(buyer.email||'').includes('@')) return res.status(400).json({error:'A valid email address is required.'});

    const lineItems=[];
    let merchandiseCents=0;
    for(const row of rawItems){
      const product=RABBITFLOW_PRODUCTS[String(row?.id||'')];
      const quantity=Math.max(1,Math.min(50,Number.parseInt(row?.quantity,10)||0));
      if(!product) return res.status(400).json({error:'Your cart contains an unavailable item.'});
      merchandiseCents += product.cents*quantity;
      lineItems.push({name:product.name,quantity:String(quantity),item_type:'ITEM',base_price_money:{amount:product.cents,currency:'USD'}});
    }
    if(merchandiseCents<=0 || merchandiseCents>maxPaymentCents) return res.status(400).json({error:'Order total is outside the allowed range.'});

    if(rabbitFlowFlatShippingCents>0){
      lineItems.push({name:'Standard Shipping',quantity:'1',item_type:'ITEM',base_price_money:{amount:rabbitFlowFlatShippingCents,currency:'USD'}});
    }

    const name=[buyer.firstName,buyer.lastName].filter(Boolean).join(' ').trim();
    const paymentNote=['RabbitFlow Store',name,notes].filter(Boolean).join(' • ').slice(0,500);
    const body={
      idempotency_key:crypto.randomUUID(),
      order:{location_id:configuredLocationID,line_items:lineItems,pricing_options:{auto_apply_taxes:true}},
      payment_note:paymentNote,
      checkout_options:{ask_for_shipping_address:true,redirect_url:rabbitFlowStoreSuccessURL},
      pre_populated_data:{buyer_email:String(buyer.email||'').trim()}
    };
    if(String(buyer.phone||'').trim()) body.pre_populated_data.buyer_phone_number=String(buyer.phone).trim();

    const sq=await fetch(squareApiBase+'/v2/online-checkout/payment-links',{
      method:'POST',
      headers:{'Authorization':'Bearer '+accessToken,'Square-Version':squareApiVersion,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const data=await sq.json();
    if(!sq.ok){
      const detail=data?.errors?.[0]?.detail||data?.errors?.[0]?.code||'Square checkout could not be created.';
      return res.status(502).json({error:detail});
    }
    return res.json({url:data?.payment_link?.url||data?.payment_link?.long_url,orderID:data?.payment_link?.order_id||'',shippingCents:rabbitFlowFlatShippingCents});
  } catch(error){
    return res.status(500).json({error:error?.message||'Unable to create checkout.'});
  }
});


app.post('/yardpatrol/create-checkout', async (req,res) => {
  try {
    const invoiceNumber=Number.parseInt(req.body?.invoiceNumber,10);
    const amountCents=Number.parseInt(req.body?.amountCents,10);
    const customerName=String(req.body?.customerName||'').trim().slice(0,120);
    const email=String(req.body?.email||'').trim().slice(0,254);
    const phone=String(req.body?.phone||'').trim().slice(0,40);
    if(!Number.isInteger(invoiceNumber) || invoiceNumber<=0) return res.status(400).json({error:'A valid invoice number is required.'});
    if(!Number.isInteger(amountCents) || amountCents<=0 || amountCents>maxPaymentCents) return res.status(400).json({error:'Payment amount is outside the allowed range.'});
    if(!customerName) return res.status(400).json({error:'Customer name is required.'});

    const body={
      idempotency_key:crypto.randomUUID(),
      description:`Yard Patrol Invoice #${invoiceNumber}`,
      quick_pay:{
        name:`Yard Patrol Pet Waste Removal — Invoice #${invoiceNumber}`,
        price_money:{amount:amountCents,currency:'USD'},
        location_id:configuredLocationID
      },
      payment_note:[`Yard Patrol Invoice #${invoiceNumber}`,customerName].join(' • ').slice(0,500),
      checkout_options:{allow_tipping:false}
    };
    if(email.includes('@') || phone){
      body.pre_populated_data={};
      if(email.includes('@')) body.pre_populated_data.buyer_email=email;
      if(phone) body.pre_populated_data.buyer_phone_number=phone;
    }

    const sq=await fetch(`${squareApiBase}/v2/online-checkout/payment-links`,{
      method:'POST',
      headers:{'Authorization':`Bearer ${accessToken}`,'Square-Version':squareApiVersion,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const data=await sq.json();
    if(!sq.ok){
      const detail=data?.errors?.[0]?.detail||data?.errors?.[0]?.code||'Square checkout could not be created.';
      return res.status(502).json({error:detail});
    }
    const link=data?.payment_link;
    return res.json({url:link?.url||link?.long_url,orderID:link?.order_id||'',checkoutID:link?.id||''});
  } catch(error){
    return res.status(500).json({error:error?.message||'Unable to create Yard Patrol checkout.'});
  }
});

app.post('/yardpatrol/checkout-status', async (req,res) => {
  try {
    const orderID=String(req.body?.orderID||'').trim();
    const expectedAmountCents=Number.parseInt(req.body?.amountCents,10);
    const invoiceNumber=Number.parseInt(req.body?.invoiceNumber,10);
    if(!orderID || orderID.length>192) return res.status(400).json({error:'A valid Square order ID is required.'});
    if(!Number.isInteger(expectedAmountCents) || expectedAmountCents<=0) return res.status(400).json({error:'A valid expected amount is required.'});
    if(!Number.isInteger(invoiceNumber) || invoiceNumber<=0) return res.status(400).json({error:'A valid invoice number is required.'});

    const sq=await fetch(`${squareApiBase}/v2/orders/${encodeURIComponent(orderID)}`,{
      headers:{'Authorization':`Bearer ${accessToken}`,'Square-Version':squareApiVersion,'Content-Type':'application/json'}
    });
    const data=await sq.json();
    if(!sq.ok){
      const detail=data?.errors?.[0]?.detail||data?.errors?.[0]?.code||'Square order status could not be retrieved.';
      return res.status(502).json({error:detail});
    }
    const order=data?.order;
    if(!order) return res.status(502).json({error:'Square returned no order.'});
    if(order.location_id!==configuredLocationID) return res.status(400).json({error:'Square order location does not match.'});

    const total=Number(order?.total_money?.amount||0);
    const expectedLabel=`Yard Patrol Pet Waste Removal — Invoice #${invoiceNumber}`;
    const hasExpectedLine=Array.isArray(order?.line_items) && order.line_items.some(item=>String(item?.name||'')===expectedLabel);
    if(total!==expectedAmountCents || !hasExpectedLine) return res.status(400).json({error:'Square order does not match this Yard Patrol invoice.'});

    const state=String(order?.state||'OPEN');
    const tender=Array.isArray(order?.tenders) ? order.tenders.find(t=>t?.payment_id) : null;
    return res.json({
      paid:state==='COMPLETED',
      status:state,
      orderID,
      paymentID:String(tender?.payment_id||'')
    });
  } catch(error){
    return res.status(500).json({error:error?.message||'Unable to verify Yard Patrol checkout.'});
  }
});


app.post('/yardpatrol/cancel-checkout', async (req,res) => {
  try {
    const checkoutID=String(req.body?.checkoutID||'').trim();
    const orderID=String(req.body?.orderID||'').trim();
    if(!checkoutID || checkoutID.length>192 || !orderID || orderID.length>192) {
      return res.status(400).json({error:'Valid Square checkout and order IDs are required.'});
    }
    const sq=await fetch(`${squareApiBase}/v2/online-checkout/payment-links/${encodeURIComponent(checkoutID)}`,{
      method:'DELETE',
      headers:{'Authorization':`Bearer ${accessToken}`,'Square-Version':squareApiVersion,'Content-Type':'application/json'}
    });
    const data=await sq.json();
    if(!sq.ok){
      const detail=data?.errors?.[0]?.detail||data?.errors?.[0]?.code||'Square checkout could not be canceled.';
      return res.status(502).json({error:detail});
    }
    const cancelledOrderID=String(data?.cancelled_order_id||'');
    if(cancelledOrderID && cancelledOrderID!==orderID) {
      return res.status(400).json({error:'Canceled Square order does not match this Yard Patrol checkout.'});
    }
    return res.json({canceled:true,orderID:cancelledOrderID||orderID});
  } catch(error){
    return res.status(500).json({error:error?.message||'Unable to cancel Yard Patrol checkout.'});
  }
});

installYardPatrolPortalRoutes(app);

const port=Number.parseInt(process.env.PORT||'3000',10);
app.listen(port,'0.0.0.0',()=>console.log(`KennelFlow payment server running on port ${port} (${isProduction?'production':'sandbox'})`));
