import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyKennelOneStore,kennelOneStoreDetails,sharedStoreDetails,notifyVerifiedStore} from '../functions/_lib/store-notifications.mjs';
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
test('legacy Square Kennel One single-tag order label is still recognized',()=>{
 const old={...verification,order:{...verification.order,line_items:[{name:'Kennel One-Compatible NFC Tag',quantity:'1'}]}};
 const order=kennelOneStoreDetails(old);
 assert(order);
 assert.match(order.items,/Kennel One-Compatible NFC Tag/);
});


test('QuailFlow merchant notifications preserve store attribution and send exact Square-verified items',async()=>{
 const p={...verification,
  storeName:'QuailFlow',payment:{...verification.payment,note:'QuailFlow Store • Buyer'},
  order:{...verification.order,line_items:[{name:'5 Quail + Embedded NFC',quantity:'1'}]}};
 assert.equal(sharedStoreDetails(p).storeName,'QuailFlow');
 let outgoing;
 const sent=await notifyVerifiedStore(p,env,async(u,opts)=>{
  outgoing={url:u,headers:opts.headers,body:JSON.parse(opts.body)};
  return Response.json({id:'test-email-quailflow'});
 });
 assert.equal(sent.storeName,'QuailFlow');
 assert.match(outgoing.body.subject,/QuailFlow New Order/);
 assert.match(outgoing.body.text,/5 Quail \+ Embedded NFC/);
 assert.match(outgoing.headers['Idempotency-Key'],/quailflow-store\/test-payment-unique/);
});
test('RabbitFlow merchant notifications use isolated idempotency key and HTML escaping',async()=>{
 const p={...verification,
  storeName:'RabbitFlow',payment:{...verification.payment,note:'RabbitFlow Store • <b>Buyer</b>'},
  order:{...verification.order,line_items:[{name:'25 Rabbits + Embedded NFC',quantity:'1'}]}};
 let payload;
 await notifyVerifiedStore(p,env,async(u,opts)=>{payload=JSON.parse(opts.body);return Response.json({id:'test-email-rabbitflow'})});
 assert.match(payload.html,/&lt;b&gt;Buyer&lt;\/b&gt;/);
 assert.match(payload.text,/25 Rabbits \+ Embedded NFC/);
});
test('misattributed store orders never trigger merchant mail',async()=>{
 const p={...verification,
  storeName:'RabbitFlow',payment:{...verification.payment,note:'QuailFlow Store • Customer'},
  order:{...verification.order,line_items:[{name:'5 Rabbits + Embedded NFC',quantity:'1'}]}};
 let count=0;
 await assert.rejects(()=>notifyVerifiedStore(p,env,async()=>{count++;return Response.json({id:'should-not-send'})}),/Unrecognized store/);
 assert.equal(count,0);
});
