import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {processWebhook,verifySquareSignature} from '../functions/square/webhook.js';
globalThis.crypto||=webcrypto;
globalThis.atob||=(str)=>Buffer.from(str,'base64').toString('binary');
const url='https://preview-payment.example/square/webhook',secret='a-synthetic-key-never-used-in-production';
const env={SQUARE_WEBHOOK_URL:url,SQUARE_WEBHOOK_SIGNATURE_KEY:secret,
  SQUARE_ACCESS_TOKEN:'fake-test-token',SQUARE_LOCATION_ID:'test-location',SQUARE_ENVIRONMENT:'sandbox'};
const basePayment={id:'test-payment',status:'COMPLETED',order_id:'test-order',location_id:'test-location'};
let baseEvent={type:'payment.updated',event_id:'evt-123',data:{object:{payment:basePayment}}};
const signed=(event=baseEvent,key=secret)=>{const body=JSON.stringify(event);
 const signature=createHmac('sha256',key).update(url+body).digest('base64');
 return new Request(url,{method:'POST',headers:{'x-square-hmacsha256-signature':signature,'content-type':'application/json'},body});};
const f=async (target)=>{
 if(target.includes('/v2/payments/'))return Response.json({payment:{...basePayment,amount_money:{amount:499}}});
 if(target.includes('/v2/orders/'))return Response.json({order:{id:'test-order',location_id:'test-location',total_money:{amount:499},line_items:[{name:'Kennel One NFC Tag'}]}});
 throw Error('Unexpected Square route '+target);
};
function db(){
 const rows=new Map();
 return {rows,prepare(sql){let params=[];return {bind(...a){params=a;return this},
 async run(){if(sql.startsWith('INSERT')&&!rows.has(params[0]))rows.set(params[0],{status:params[4],kind:params[3],order_id:params[2],received_at:params[5]});if(sql.startsWith('UPDATE')&&rows.has(params[0]))rows.get(params[0]).status='SETTLED';return {success:true}},
 async first(){return rows.get(params[0])||null}
 }}};
}
test('rejects invalid signatures before accessing payments',async()=>{
 let requests=0;const r=await processWebhook(signed(baseEvent,'incorrect'),env,async()=>{requests++;throw Error('Called Square')});
 assert.equal(r.status,403);assert.equal(requests,0);
});
test('Square HMAC-SHA256 signature verification is bound to exact notification URL',async()=>{
 const req=signed();
 const body=await req.text(),sig=req.headers.get('x-square-hmacsha256-signature');
 assert.equal(await verifySquareSignature(body,sig,secret,url),true);
 assert.equal(await verifySquareSignature(body,sig,secret,url+'?x=1'),false);
});
test('ignores unrelated Square event types only after signature verification',async()=>{
 const r=await processWebhook(signed({type:'order.updated',event_id:'evt-2'}),env,f);
 assert.equal(r.status,200);assert.equal((await r.json()).ignored,true);
});
test('never acknowledges completed un-settled payment',async()=>{
 const events=db();const r=await processWebhook(signed(),{...env,EVENTS:events},f);
 assert.equal(r.status,503);assert.equal(events.rows.size,1);
 assert.equal(events.rows.get('test-payment').status,'VERIFIED_PENDING');
});
test('webhook retries cannot insert duplicate payments',async()=>{
 const events=db();
 await processWebhook(signed(),{...env,EVENTS:events},f);
 const r=await processWebhook(signed({...baseEvent,event_id:'second-delivery'}),{...env,EVENTS:events},f);
 assert.equal(r.status,503);assert.equal(events.rows.size,1);
});
test('completed and verified SETTLED event can be acknowledged safely',async()=>{
 const events=db();events.rows.set('test-payment',{status:'SETTLED',kind:'store-order',order_id:'test-order'});
 const r=await processWebhook(signed(),{...env,EVENTS:events},f);
 assert.equal(r.status,200);assert.equal((await r.json()).alreadyRecorded,true);
});
test('reject mismatched Square order amount',async()=>{
 const events=db(),bad=async u=>u.includes('/payments/')?Response.json({payment:{...basePayment,amount_money:{amount:500}}}):f(u);
 const r=await processWebhook(signed(),{...env,EVENTS:events},bad);
 assert.equal(r.status,503);assert.equal(events.rows.size,0);
});
test('missing webhook secret or D1 never acknowledges a completed transaction',async()=>{
 assert.equal((await processWebhook(signed(),{},f)).status,503);
 assert.equal((await processWebhook(signed(),env,f)).status,503);
});

test('a conflicting duplicate with the same payment ID but different order is rejected',async()=>{
 const events=db();events.rows.set('test-payment',{status:'SETTLED',kind:'store-order',order_id:'different-order'});
 const response=await processWebhook(signed(),{...env,EVENTS:events},f);
 assert.equal(response.status,409);
 assert.equal(events.rows.size,1);
});
test('a completed kennel-service payment settles once and acknowledges only after Neon success',async()=>{
 const events=db();let settlements=0;
 const serviceFetch=async(url)=>{
  if(url.includes('/v2/orders/'))return Response.json({order:{id:'test-order',location_id:'test-location',total_money:{amount:499},line_items:[{name:'Kennel One service payment'}]}});
  return f(url);
 };
 const settle=async()=>{settlements++;return {saved:true,alreadyRecorded:false}};
 const migrated={...env,EVENTS:events,DATABASE_URL:'postgres://isolated-staging',ENABLE_ATOMIC_SERVICE_SETTLEMENT:'true'};
 const r=await processWebhook(signed(),migrated,serviceFetch,settle);
 assert.equal(r.status,200);assert.deepEqual((await r.json()).saved,true);
 assert.equal(events.rows.get('test-payment').status,'SETTLED');
 const again=await processWebhook(signed(),migrated,serviceFetch,settle);
 assert.equal(again.status,200);assert.equal(settlements,1);
});
test('Neon failure leaves webhook retryable; next event settles one record',async()=>{
 const events=db();let attempts=0;
 const serviceFetch=async url=>url.includes('/v2/orders/')?
   Response.json({order:{id:'test-order',location_id:'test-location',total_money:{amount:499},line_items:[{name:'Kennel One service payment'}]}}):f(url);
 const settle=async()=>{attempts++;if(attempts===1)throw Error('Neon unavailable');return {saved:false,alreadyRecorded:true}};
 const migrated={...env,EVENTS:events,ENABLE_ATOMIC_SERVICE_SETTLEMENT:'true'};
 const first=await processWebhook(signed(),migrated,serviceFetch,settle);
 assert.equal(first.status,503);assert.equal(events.rows.get('test-payment').status,'VERIFIED_PENDING');
 const second=await processWebhook(signed(),migrated,serviceFetch,settle);
 assert.equal(second.status,200);assert.equal(events.rows.get('test-payment').status,'SETTLED');
 assert.equal(attempts,2);assert.equal(events.rows.size,1);
});
test('store orders stay blocked even if service ledger feature is enabled',async()=>{
 const events=db(),migrated={...env,EVENTS:events,ENABLE_ATOMIC_SERVICE_SETTLEMENT:'true'};
 let calls=0;
 const r=await processWebhook(signed(),migrated,f,async()=>{calls++;return {saved:true}});
 assert.equal(r.status,503);assert.equal(calls,0);
});
test('an event with the same payment ID but incompatible category is rejected',async()=>{
 const events=db();events.rows.set('test-payment',{status:'SETTLED',kind:'kennel-service',order_id:'test-order'});
 const r=await processWebhook(signed(),{...env,EVENTS:events},f);
 assert.equal(r.status,409);
});

test('staged Kennel One store email is sent once and duplicate webhook is acknowledged without resending',async()=>{
 const events=db();let sent=0;
 const notify=async()=>{sent++;return {sent:true,provider:'resend',messageID:'test-email'}};
 const enabled={...env,EVENTS:events,ENABLE_STORE_NOTIFICATIONS:'true'};
 const first=await processWebhook(signed(),enabled,f,undefined,notify);
 assert.equal(first.status,200);assert.equal((await first.json()).notificationSent,true);
 assert.equal(events.rows.get('test-payment').status,'SETTLED');
 const replay=await processWebhook(signed(),enabled,f,undefined,notify);
 assert.equal(replay.status,200);assert.equal(sent,1);
});
test('email provider failure leaves store event safely pending and retryable',async()=>{
 const events=db(),enabled={...env,EVENTS:events,ENABLE_STORE_NOTIFICATIONS:'true'};
 let calls=0;
 const notify=async()=>{calls++;if(calls===1)throw Error('Provider down');return {sent:true}};
 const first=await processWebhook(signed(),enabled,f,undefined,notify);
 assert.equal(first.status,503);
 assert.equal(events.rows.get('test-payment').status,'VERIFIED_PENDING');
 const retried=await processWebhook(signed(),enabled,f,undefined,notify);
 assert.equal(retried.status,200);
 assert.equal(calls,2);
 assert.equal(events.rows.size,1);
});
test('old uncertain notifications fail closed after provider idempotency protection expires',async()=>{
 const events=db();
 events.rows.set('test-payment',{status:'VERIFIED_PENDING',kind:'store-order',order_id:'test-order',received_at:Date.now()-24*60*60*1000});
 let sent=0;
 const result=await processWebhook(signed(),{...env,EVENTS:events,ENABLE_STORE_NOTIFICATIONS:'true'},f,undefined,async()=>{sent++;return {sent:true}});
 assert.equal(result.status,503);
 assert.match((await result.json()).error,/manual reconciliation/);
 assert.equal(sent,0);
});
