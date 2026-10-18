import test from 'node:test';
import assert from 'node:assert/strict';
import {createSquareCheckout, PRODUCT_CATALOG} from '../functions/_lib/square-checkout.mjs';
import {onRequest} from '../functions/store/create-checkout.js';
const origin='https://kennelone-public.pages.dev';
const env={SQUARE_DIRECT_CHECKOUT:'true', SQUARE_ENVIRONMENT:'sandbox',
  SQUARE_LOCATION_ID:'test-location',SQUARE_ACCESS_TOKEN:'test-not-real',STORE_FLAT_SHIPPING_CENTS:'0'};
const buyer={email:'sandbox@test.example',firstName:'Sandbox',lastName:'Buyer'};
const req=(payload)=>new Request(origin+'/store/create-checkout',{
  method:'POST',headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},
  body:JSON.stringify(payload)
});
test('server-controlled catalog prices match existing storefront',()=>{
  assert.equal(PRODUCT_CATALOG['nfc-1'].cents,499);
  assert.equal(PRODUCT_CATALOG['nfc-5'].cents,2299);
  assert.equal(PRODUCT_CATALOG['nfc-10'].cents,3999);
  assert.equal(PRODUCT_CATALOG['nfc-25'].cents,8499);
  assert.equal(PRODUCT_CATALOG['facility-kit'].cents,13499);
});
test('direct checkout uses server-side pricing and keeps cards on Square',async()=>{
 const p={items:[{id:'nfc-5',quantity:2,price:1}],buyer};let dest,upstream;
 const answer=await createSquareCheckout(p,env,async(url,options)=>{
   dest=url;upstream=options;return Response.json({payment_link:{url:'https://sandbox.square.link/u/test',order_id:'sandbox-order'}});
 });
 assert.equal(dest,'https://connect.squareupsandbox.com/v2/online-checkout/payment-links');
 const details=JSON.parse(upstream.body);
 assert.equal(details.order.line_items[0].base_price_money.amount,2299);
 assert.equal(details.order.line_items[0].quantity,'2');
 assert.equal(details.checkout_options.ask_for_shipping_address,true);
 assert.equal(details.pre_populated_data.buyer_email,buyer.email);
 assert.equal(answer.orderID,'sandbox-order');
 assert.equal(answer.shippingCents,0);
 assert(!upstream.body.includes('sourceID')&&!upstream.body.includes('cardNumber'));
});
test('rejects manipulated product id, quantities and email',async()=>{
 for(const v of [
   {items:[{id:'nonexistent',quantity:1}],buyer},
   {items:[{id:'nfc-5',quantity:-1}],buyer},
   {items:[{id:'nfc-5',quantity:100}],buyer},
   {items:[{id:'nfc-5',quantity:1}],buyer:{email:'invalid'}},
 ]) await assert.rejects(()=>createSquareCheckout(v,env,async()=>{throw Error('Square called!')}),{status:400});
});
test('caps totals to approved limit before calling Square',async()=>{
 await assert.rejects(()=>createSquareCheckout({items:Array.from({length:50},()=>({id:'facility-kit',quantity:50})),buyer},env,async()=>{throw Error('Square called!')}),{status:400});
});
test('Square failure is never marked paid',async()=>{
 await assert.rejects(()=>createSquareCheckout({items:[{id:'nfc-1',quantity:1}],buyer},env,async()=>Response.json({errors:[{detail:'Sandbox invalid'}]},{status:401})),{status:502});
});
test('requires complete direct-mode settings',async()=>{
 const response=await onRequest({request:req({items:[{id:'nfc-1',quantity:1}],buyer}),env:{SQUARE_DIRECT_CHECKOUT:'true'}});
 assert.equal(response.status,503);
 assert.match((await response.json()).error,/not configured/);
});
test('storefront CSRF guard remains enforced in direct mode',async()=>{
 const request=req({items:[{id:'nfc-1',quantity:1}],buyer});
 request.headers.set('Origin','https://evil.example');
 const response=await onRequest({request,env});
 assert.equal(response.status,403);
});
test('reject non-Square payment link despite successful Square API response',async()=>{
 await assert.rejects(()=>createSquareCheckout({items:[{id:'nfc-1',quantity:1}],buyer},env,
  async()=>Response.json({payment_link:{url:'https://evil.example/charge',order_id:'fake'}})),{status:502});
});
