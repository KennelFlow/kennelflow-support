import express from 'express';
import crypto from 'crypto';
import { Client, Environment } from 'square/legacy';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

const isProduction = process.env.SQUARE_ENVIRONMENT === 'production';
const accessToken = process.env.SQUARE_ACCESS_TOKEN;
const configuredLocationID = (process.env.SQUARE_LOCATION_ID || '').trim();
const maxPaymentCents = Number.parseInt(process.env.MAX_PAYMENT_CENTS || '5000000', 10);
const flatShippingCents = Math.max(0, Number.parseInt(process.env.STORE_FLAT_SHIPPING_CENTS || '0', 10));
const storeOrigin = process.env.STORE_ORIGIN || 'https://kennelflow.github.io';
const storeSuccessURL = process.env.STORE_SUCCESS_URL || 'https://kennelflow.github.io/kennelflow-support/order-success.html';
const squareApiBase = isProduction ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
const squareApiVersion = '2026-08-19';

if (!accessToken) { console.error('Missing SQUARE_ACCESS_TOKEN'); process.exit(1); }
if (!configuredLocationID) { console.error('Missing SQUARE_LOCATION_ID'); process.exit(1); }

const environment = isProduction ? Environment.Production : Environment.Sandbox;
const client = new Client({ bearerAuthCredentials: { accessToken }, environment });

const PRODUCTS = Object.freeze({
  'nfc-1': { name: 'KennelFlow NFC Tag', cents: 1299 },
  'nfc-5': { name: '5-Pack NFC Tags', cents: 5499 },
  'nfc-10': { name: '10-Pack NFC Tags', cents: 9999 },
  'nfc-25': { name: '25-Pack NFC Tags', cents: 21999 },
  'holder-kit': { name: 'NFC Tag + Kennel Holder', cents: 2999 },
  'facility-kit': { name: '10-Kennel Smart Facility Kit', cents: 25999 }
});

function cors(req,res,next){
  const origin=req.headers.origin;
  const allowed=new Set([storeOrigin,'https://kennelflow.github.io','https://kennelflowpro.app','https://www.kennelflowpro.app']);
  if(origin && allowed.has(origin)) res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(req.method==='OPTIONS') return res.sendStatus(204);
  next();
}
app.use(cors);

app.get('/health', (_, res) => res.json({ ok: true, environment: isProduction ? 'production' : 'sandbox', storeCheckout: true }));
app.get('/square/config', (_, res) => res.json({ environment: isProduction ? 'production' : 'sandbox', locationIDConfigured: Boolean(configuredLocationID), maxPaymentCents }));

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

const port=Number.parseInt(process.env.PORT||'3000',10);
app.listen(port,'0.0.0.0',()=>console.log(`KennelFlow payment server running on port ${port} (${isProduction?'production':'sandbox'})`));
