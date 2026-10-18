import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyKennelOneStore,kennelOneStoreDetails} from '../functions/_lib/store-notifications.mjs';
const verification={
 type:'store-order',
 payment:{id:'test-payment-unique',amount_money:{amount:499,currency:'USD'},
  note:'Kennel One Store • Test Customer • requested blue holder',
  buyer_email_address:'buyer@example.test'},
 order:{id:'order-test-123',line_items:[{name:'Kennel One NFC Tag',quantity:'1'}],fulfillments:[]}
};
const env={RESEND_API_KEY:'fake-secret',ORDER_NOTIFICATION_EMAIL:'merchant@example.test',
 RESEND_FROM_EMAIL:'Kennel One <orders@example.test>'};
test('recognized store order uses Square-verified product and excludes unknown lines',()=>{
 const info=kennelOneStoreDetails(verification);
 assert.equal(info.amount,499);
 assert.match(info.items,/Kennel One NFC Tag/);
 assert.equal(kennelOneStoreDetails({...verification,type:'kennel-service'}),null);
});
test('notification is deterministic, escaped and idempotent using Square payment ID',async()=>{
 let request;
 await notifyKennelOneStore({...verification,
   payment:{...verification.payment,note:'Kennel One Store • <script>alert(1)</script>'}
 },env,async(u,options)=>{request={u,options};return Response.json({id:'email-mock-123'})});
 assert.equal(request.u,'https://api.resend.com/emails');
 assert.equal(request.options.headers['Idempotency-Key'],'kennelone-store/test-payment-unique');
 const body=JSON.parse(request.options.body);
 assert.match(body.html,/&lt;script&gt;/);
 assert.doesNotMatch(body.html,/<script>/);
 assert.match(body.subject,/\$4\.99/);
 assert.equal(body.to[0],env.ORDER_NOTIFICATION_EMAIL);
});
test('merchant notifications fail closed if unconfigured',async()=>{
 await assert.rejects(()=>notifyKennelOneStore(verification,{}),/not configured/);
});
test('provider error cannot be treated as delivery',async()=>{
 await assert.rejects(()=>notifyKennelOneStore(verification,env,async()=>Response.json({error:'retry'},{status:503})),/Email notification failed/);
});
test('different provider payload cannot masquerade as a completed delivery',async()=>{
 await assert.rejects(()=>notifyKennelOneStore(verification,env,async()=>Response.json({ok:true})),/did not acknowledge/);
});
test('foreign store orders are excluded from Kennel One merchant email',async()=>{
 const other={...verification,payment:{...verification.payment,note:'RabbitFlow Store • Buyer'}};
 assert.equal(kennelOneStoreDetails(other),null);
 await assert.rejects(()=>notifyKennelOneStore(other,env),/Not a Kennel One store purchase/);
});
