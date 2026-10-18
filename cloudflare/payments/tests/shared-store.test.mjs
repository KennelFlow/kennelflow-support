import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogs,buildSharedCheckout,handleSharedStore} from '../functions/_lib/shared-store.mjs';
const env={SQUARE_ENVIRONMENT:'sandbox',SQUARE_ACCESS_TOKEN:'fake-sandbox-token',SQUARE_LOCATION_ID:'test-location',QUAILFLOW_SALES_ENABLED:'true'};
const buyer={email:'buyer@example.test',firstName:'Test'};
const square=async()=>Response.json({payment_link:{url:'https://sandbox.square.link/u/example',order_id:'order-1'}});
test('catalogs reproduce existing QuailFlow and RabbitFlow product prices and names',()=>{
 assert.deepEqual(Object.values(catalogs.quailflow).map(x=>x.cents),[499,2299,3999,8499]);
 assert.deepEqual(Object.values(catalogs.rabbitflow).map(x=>x.cents),[499,2299,3999,8499]);
 assert.equal(catalogs.rabbitflow['rf-nfc-25'].name,'25 Rabbits + Embedded NFC');
});
test('QuailFlow remains disabled by default',async()=>{
 await assert.rejects(()=>buildSharedCheckout('quailflow',{items:[{id:'qf-nfc-1',quantity:1}],buyer},{...env,QUAILFLOW_SALES_ENABLED:'false'},square),{status:503});
});
test('QuailFlow server-side price is authoritative despite client manipulation',async()=>{
 let last;
 const reply=await buildSharedCheckout('quailflow',{items:[{id:'qf-nfc-5',quantity:2,price:1}],buyer},env,
   async(url,opts)=>{last={url,opts};return square()});
 assert.equal(last.url,'https://connect.squareupsandbox.com/v2/online-checkout/payment-links');
 const data=JSON.parse(last.opts.body);
 assert.equal(data.order.line_items[0].base_price_money.amount,2299);
 assert.equal(data.order.line_items[0].quantity,'2');
 assert.equal(data.checkout_options.redirect_url,'https://quailflow.app/order-success.html');
 assert.equal(reply.orderID,'order-1');
});
test('RabbitFlow shipping, redirect and Square format match its live endpoint',async()=>{
 let last;
 const reply=await buildSharedCheckout('rabbitflow',{items:[{id:'rf-nfc-1',quantity:1}],buyer},
   {...env,RABBITFLOW_STORE_FLAT_SHIPPING_CENTS:'150'},async(u,o)=>{last=JSON.parse(o.body);return square()});
 assert.equal(reply.shippingCents,150);
 assert.equal(last.order.line_items[0].name,'1 Rabbit + Embedded NFC');
 assert.equal(last.order.line_items[1].base_price_money.amount,150);
 assert.equal(last.checkout_options.redirect_url,'https://rabbitflow.app/order-success.html');
});
test('invalid SKU, quantity and email are rejected before calling Square',async()=>{
 let calls=0;
 const badSquare=async()=>{calls++;return square()};
 const scenarios=[
  {items:[{id:'unknown',quantity:1}],buyer},
  {items:[{id:'rf-nfc-1',quantity:0}],buyer},
  {items:[{id:'rf-nfc-1',quantity:51}],buyer},
  {items:[{id:'rf-nfc-1',quantity:1}],buyer:{email:'no'}},
 ];
 for(const input of scenarios)await assert.rejects(()=>buildSharedCheckout('rabbitflow',input,env,badSquare),{status:400});
 assert.equal(calls,0);
});
test('per-store origin validation and preflight behavior',async()=>{
 const body=JSON.stringify({items:[{id:'rf-nfc-1',quantity:1}],buyer});
 const mk=(origin,method='POST')=>new Request('https://pay.example/rabbitflow/store/create-checkout',{
   method,headers:{Origin:origin,'Content-Type':'application/json'},body:method==='POST'?body:undefined
 });
 assert.equal((await handleSharedStore(mk('https://attacker.example'),env,'rabbitflow',square)).status,403);
 const ok=await handleSharedStore(mk('https://rabbitflow.app'),env,'rabbitflow',square);
 assert.equal(ok.status,200);
 assert.equal(ok.headers.get('access-control-allow-origin'),'https://rabbitflow.app');
 const preflight=await handleSharedStore(mk('https://rabbitflow.app','OPTIONS'),env,'rabbitflow',square);
 assert.equal(preflight.status,204);
});
test('Square API failures are not represented as paid',async()=>{
 await assert.rejects(()=>buildSharedCheckout('rabbitflow',{items:[{id:'rf-nfc-1',quantity:1}],buyer},env,
   async()=>Response.json({errors:[{code:'TOKEN_EXPIRED'}]},{status:401})),{status:502});
});
test('returned checkout URL is restricted to legitimate Square-owned destinations',async()=>{
 await assert.rejects(()=>buildSharedCheckout('rabbitflow',{items:[{id:'rf-nfc-1',quantity:1}],buyer},env,
   async()=>Response.json({payment_link:{url:'https://attacker.example/charge',order_id:'x'}})),{status:502});
});
