import test from 'node:test';
import assert from 'node:assert/strict';
import {createYardPatrolCheckout,verifyYardPatrolCheckout,cancelYardPatrolCheckout,handleYardPatrol} from '../functions/_lib/yardpatrol-checkout.mjs';
const env={SQUARE_ENVIRONMENT:'sandbox',SQUARE_ACCESS_TOKEN:'testing-only',SQUARE_LOCATION_ID:'square-test-location'};
const details={invoiceNumber:22,amountCents:2350,customerName:'Test Customer',email:'demo@example.test'};
test('Yard Patrol creates Square hosted link with exact amount and invoice',async()=>{
 let outgoing;
 const response=await createYardPatrolCheckout(details,env,async(u,opts)=>{
  outgoing={url:u,payload:JSON.parse(opts.body)};
  return Response.json({payment_link:{url:'https://sandbox.square.link/u/test',order_id:'order-22',id:'checkout-22'}});
 });
 assert.equal(response.orderID,'order-22');
 assert.equal(response.checkoutID,'checkout-22');
 assert.equal(outgoing.payload.quick_pay.price_money.amount,2350);
 assert.equal(outgoing.payload.quick_pay.name,'Yard Patrol Pet Waste Removal — Invoice #22');
 assert.equal(outgoing.payload.checkout_options.allow_tipping,false);
});
test('status is paid only when exact invoice, amount and location match Square',async()=>{
 const ok=async()=>Response.json({order:{id:'order-22',state:'COMPLETED',location_id:'square-test-location',total_money:{amount:2350},
  line_items:[{name:'Yard Patrol Pet Waste Removal — Invoice #22'}],tenders:[{payment_id:'pay-22'}]}});
 const r=await verifyYardPatrolCheckout({...details,orderID:'order-22'},env,ok);
 assert.equal(r.paid,true);assert.equal(r.paymentID,'pay-22');
 const bad=async()=>Response.json({order:{state:'COMPLETED',location_id:'elsewhere',total_money:{amount:2350}}});
 await assert.rejects(()=>verifyYardPatrolCheckout({...details,orderID:'order-22'},env,bad),{status:400});
});
test('cancel returns only matching order ID from Square',async()=>{
 const answer=await cancelYardPatrolCheckout({checkoutID:'checkout-22',orderID:'order-22'},env,
  async()=>Response.json({cancelled_order_id:'order-22'}));
 assert.equal(answer.canceled,true);
 await assert.rejects(()=>cancelYardPatrolCheckout({checkoutID:'checkout-22',orderID:'order-22'},env,
  async()=>Response.json({cancelled_order_id:'other-order'})),{status:400});
});
test('non-Square payment URL is rejected',async()=>{
 await assert.rejects(()=>createYardPatrolCheckout(details,env,
  async()=>Response.json({payment_link:{url:'https://fake-checkout.invalid/charge'}})),{status:502});
});
test('invalid amounts and invoices rejected before Square request',async()=>{
 let called=0;
 for(const input of [{...details,amountCents:0},{...details,invoiceNumber:0},{...details,customerName:''}])
  await assert.rejects(()=>createYardPatrolCheckout(input,env,async()=>{called++;return Response.json({})}),{status:400});
 assert.equal(called,0);
});
test('Yard Patrol Cross-Origin request denied; valid checkout is allowed',async()=>{
 const body=JSON.stringify(details);
 const req=origin=>new Request('https://payments.example/yardpatrol/create-checkout',{method:'POST',
  headers:{Origin:origin,'Content-Type':'application/json'},body});
 assert.equal((await handleYardPatrol(req('https://attacker.invalid'),env,'create')).status,403);
 const ok=await handleYardPatrol(req('https://yardpatrol.app'),env,'create',
  async()=>Response.json({payment_link:{url:'https://sandbox.square.link/u/test',order_id:'order-22',id:'checkout-22'}}));
 assert.equal(ok.status,200);
 assert.equal(ok.headers.get('access-control-allow-origin'),'https://yardpatrol.app');
});

test('Yard Patrol Square checkout permits authentic checkout.square.site long URL',async()=>{
 const ans=await createYardPatrolCheckout(details,env,async()=>Response.json({
  payment_link:{long_url:'https://checkout.square.site/EXAMPLE',order_id:'order-22',id:'checkout-22'}
 }));
 assert.equal(ans.url,'https://checkout.square.site/EXAMPLE');
});
