import test from 'node:test';
import assert from 'node:assert/strict';
import {createTokenizedSquarePayment,handleDirectPayment,publicSquareConfig} from '../functions/_lib/direct-card-payments.mjs';
const origin='https://kennelone.app';
const env={ENABLE_DIRECT_CARD_PAYMENTS:'true',SQUARE_ENVIRONMENT:'sandbox',
 SQUARE_ACCESS_TOKEN:'not-a-real-token',SQUARE_LOCATION_ID:'sandbox-location',
 SQUARE_MAX_PAYMENT_CENTS:'5000000'};
const form={sourceID:'cnon:card-nonce-ok',locationID:'sandbox-location',amountCents:499,
 currency:'USD',customerName:'Demo customer',description:'Safe sandbox testing'};
const square=async(_u,_opts)=>Response.json({payment:{id:'fake-sandbox-payment',status:'COMPLETED',
 location_id:'sandbox-location',amount_money:{amount:499,currency:'USD'}}});
test('direct payments stay disabled unless explicitly enabled',async()=>{
 let calls=0;
 await assert.rejects(()=>createTokenizedSquarePayment(form,{...env,ENABLE_DIRECT_CARD_PAYMENTS:'false'},
 async()=>{calls++;return square()}),{status:503});
 assert.equal(calls,0);
});
test('Square SDK token is sent through server-only Square Sandbox REST API',async()=>{
 let data={};
 const res=await createTokenizedSquarePayment(form,env,async(url,options)=>{
  data={url,options};return square();
 });
 assert.equal(res.paymentID,'fake-sandbox-payment');
 assert.equal(res.status,'COMPLETED');
 assert.equal(data.url,'https://connect.squareupsandbox.com/v2/payments');
 assert.equal(data.options.headers.Authorization,'Bearer not-a-real-token');
 const body=JSON.parse(data.options.body);
 assert.equal(body.source_id,'cnon:card-nonce-ok');
 assert.equal(body.amount_money.amount,499);
 assert.equal(body.location_id,'sandbox-location');
 assert.equal(body.autocomplete,true);
 assert(!data.options.body.includes('cardNumber'));
});
test('payment retry with same token and amount has exactly the same idempotency key',async()=>{
 const keys=[];
 const f=async(_url,opts)=>{keys.push(JSON.parse(opts.body).idempotency_key);return square()};
 await createTokenizedSquarePayment(form,env,f);
 await createTokenizedSquarePayment(form,env,f);
 assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
 assert.equal(keys[0].length,45);
});
test('explicit valid idempotency key is preserved',async()=>{
 let key;
 await createTokenizedSquarePayment({...form,idempotencyKey:'test-payment-idempotency-0001'},env,
  async(_url,opts)=>{key=JSON.parse(opts.body).idempotency_key;return square()});
 assert.equal(key,'test-payment-idempotency-0001');
});
test('invalid amounts, locations, payment source, raw PAN and currency are rejected without charges',async()=>{
 let calls=0;const never=async()=>{calls++;throw Error('Square called')};
 for(const f of [
  {...form,amountCents:0},{...form,amountCents:1000000000},
  {...form,locationID:'other-merchant'},
  {...form,sourceID:'CASH'},{...form,sourceID:'EXTERNAL'},
  {...form,cardNumber:'4111111111111111'}, {...form,cvv:'123'},
  {...form,currency:'EUR'},{...form,idempotencyKey:'bad'}
 ])await assert.rejects(()=>createTokenizedSquarePayment(f,env,never),{status:400});
 assert.equal(calls,0);
});
test('Square mismatch or unverified status is never reported as success',async()=>{
 await assert.rejects(()=>createTokenizedSquarePayment(form,env,
  async()=>Response.json({payment:{id:'fake',status:'COMPLETED',location_id:'wrong',
   amount_money:{amount:499}}})),{status:502});
 await assert.rejects(()=>createTokenizedSquarePayment(form,env,
  async()=>Response.json({errors:[{code:'CARD_DECLINED'}]},{status:400})),{status:502});
});
test('public config only shows nonsecret merchant settings',()=>{
 const data=publicSquareConfig(env);
 assert.equal(data.environment,'sandbox');
 assert.equal(data.locationIDConfigured,true);
 assert.equal(data.maxPaymentCents,5000000);
 assert(!JSON.stringify(data).includes(env.SQUARE_ACCESS_TOKEN));
});
test('request endpoint rejects cross-site abuse and respects disabled gate',async()=>{
 const req=(site)=>new Request('https://payments.kennelone.app/square/create-payment',{method:'POST',
  headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify(form)});
 const denied=await handleDirectPayment(req('https://evil.example'),env,'charge',square);
 assert.equal(denied.status,403);
 const disabled=await handleDirectPayment(req(origin),{...env,ENABLE_DIRECT_CARD_PAYMENTS:'false'},'charge',square);
 assert.equal(disabled.status,503);
 const ok=await handleDirectPayment(req(origin),env,'charge',square);
 assert.equal(ok.status,200);
 assert.equal(ok.headers.get('access-control-allow-origin'),origin);
});
