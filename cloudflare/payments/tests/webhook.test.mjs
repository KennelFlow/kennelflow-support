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
 async run(){if(sql.startsWith('INSERT')&&!rows.has(params[0]))rows.set(params[0],{status:params[4],kind:params[3]});return {success:true}},
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
 const events=db();events.rows.set('test-payment',{status:'SETTLED',kind:'store-order'});
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
