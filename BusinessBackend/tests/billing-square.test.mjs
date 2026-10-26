import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindowsPaymentLink,WINDOWS_PLANS} from '../billing-square.mjs';
const base={SQUARE_ACCESS_TOKEN:'sandbox-test-only',SQUARE_LOCATION_ID:'test-location',
 SQUARE_ENVIRONMENT:'sandbox',KO_SQUARE_MONTHLY_VARIATION_ID:'month-variation',
 KO_SQUARE_ANNUAL_VARIATION_ID:'year-variation'};
const account={plan:'monthly',kennelId:'b8f281ab-44c2-46a8-a9c0-4fd9109c973f',email:'owner@example.invalid',
 idempotencyKey:'replay-safe-checkout'};
const sq=async()=>Response.json({payment_link:{url:'https://square.link/u/KENNELTEST',id:'link-test',order_id:'order-test'}});
test('monthly and annual checkout use Square recurring plan variations, fixed prices',async()=>{
 const calls=[];
 for(const plan of ['monthly','annual']){
  const out=await createWindowsPaymentLink({...account,plan},base,async(url,req)=>{calls.push({url,body:JSON.parse(req.body)});return sq()});
  assert.equal(out.amountCents,WINDOWS_PLANS[plan].amountCents);
 }
 assert.equal(calls[0].body.quick_pay.price_money.amount,1099);
 assert.equal(calls[1].body.quick_pay.price_money.amount,9999);
 assert.equal(calls[0].body.checkout_options.subscription_plan_id,'month-variation');
 assert.equal(calls[1].body.checkout_options.subscription_plan_id,'year-variation');
 assert.equal(calls[0].body.idempotency_key,'replay-safe-checkout');
});
test('lifetime is nonrecurring and fixed at $299.99',async()=>{
 let body;
 const r=await createWindowsPaymentLink({...account,plan:'lifetime'},base,async(_,req)=>{body=JSON.parse(req.body);return sq()});
 assert.equal(r.amountCents,29999);
 assert.equal(body.checkout_options.subscription_plan_id,undefined);
});
test('no payments created without Square configuration or a known plan',async()=>{
 let contacted=false;
 const fake=async()=>{contacted=true;return sq()};
 await assert.rejects(createWindowsPaymentLink(account,{},fake),{status:503});
 await assert.rejects(createWindowsPaymentLink({...account,plan:'custom-price'},base,fake),{status:400});
 assert.equal(contacted,false);
});
test('Square URL validation rejects malicious lookalike checkout site',async()=>{
 await assert.rejects(createWindowsPaymentLink(account,base,async()=>Response.json({payment_link:{url:'https://checkout.square.site.attacker.test/pay',id:'link-test',order_id:'order-test'}})),{status:502});
});
test('failed payment link response never counts as a paid entitlement',async()=>{
 await assert.rejects(createWindowsPaymentLink(account,base,async()=>Response.json({errors:[{detail:'payment blocked'}]},{status:400})),{status:503});
});
