import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validateSquareWebhook,verifySquareSubscriptionWebhook} from '../billing-square-webhook.mjs';

const url='https://api.example.test/v2/billing/webhook/square';
const key='THIS-IS-A-TEST-ONLY-WEBHOOK-KEY';
const subscriptionId='SQUARE-SUB-ONE';
const payload={
 event_id:'EVT-123',
 type:'subscription.updated',
 data:{type:'subscription',id:subscriptionId}
};
const env={
 SQUARE_ENVIRONMENT:'sandbox',
 SQUARE_ACCESS_TOKEN:'SANDBOX-NO-REAL-CREDENTIALS',
 SQUARE_LOCATION_ID:'LOCATION-ONE',
 KO_SQUARE_MONTHLY_VARIATION_ID:'MONTHLY-ONE',
 KO_SQUARE_ANNUAL_VARIATION_ID:'ANNUAL-ONE'
};
function signed(body=payload){
 const rawBody=Buffer.from(JSON.stringify(body));
 const signature=createHmac('sha256',key).update(url).update(rawBody).digest('base64');
 return {signature,rawBody,signatureKey:key,notificationUrl:url,requestUrl:url};
}
const goodSub={
 id:subscriptionId,location_id:'LOCATION-ONE',
 plan_variation_id:'MONTHLY-ONE',customer_id:'BUYER-ONE',
 status:'ACTIVE',paid_until_date:'2099-12-31'
};
const fetchSquare=sub=>async(target,options)=>{
 assert.equal(options.method,'GET');
 assert.equal(new URL(target).hostname,'connect.squareupsandbox.com');
 return Response.json({subscription:sub});
};
test('Square HMAC authenticates the exact endpoint and raw bytes, rejects tampering and forgery',()=>{
 assert.equal(validateSquareWebhook(signed()).event_id,'EVT-123');
 for(const variant of [
  {...signed(),rawBody:Buffer.from(JSON.stringify({...payload,event_id:'FORGED'}))},
  {...signed(),requestUrl:'https://evil.example.com/v2/billing/webhook/square'},
  {...signed(),signature:'not-a-base64-signature'},
  {...signed(),signatureKey:'DIFFERENT-SIGNATURE-KEY'}
 ])assert.throws(()=>validateSquareWebhook(variant));
});
test('Square event is only a trigger: current Square API must show matching customer, location and plan',async()=>{
 const event=validateSquareWebhook(signed());
 const verified=await verifySquareSubscriptionWebhook(event,env,fetchSquare(goodSub));
 assert.equal(verified.providerPurchaseId,'sqsub:'+subscriptionId);
 assert.equal(verified.plan,'monthly');
 assert.equal(verified.state,'active');
 await assert.rejects(verifySquareSubscriptionWebhook(event,env,fetchSquare({...goodSub,customer_id:null})),{status:403});
 await assert.rejects(verifySquareSubscriptionWebhook(event,env,fetchSquare({...goodSub,location_id:'OTHER'})),{status:403});
 await assert.rejects(verifySquareSubscriptionWebhook(event,env,fetchSquare({...goodSub,plan_variation_id:'OTHER'})),{status:403});
 await assert.rejects(verifySquareSubscriptionWebhook(event,env,fetchSquare({...goodSub,status:'ACTIVE',paid_until_date:null})),{status:409});
});
test('Square canceled subscription respects already-paid days then expires',async()=>{
 const event=payload;
 const canceled=await verifySquareSubscriptionWebhook(event,env,fetchSquare({...goodSub,status:'CANCELED'}));
 assert.equal(canceled.state,'grace');
 const ended=await verifySquareSubscriptionWebhook(event,env,fetchSquare({...goodSub,status:'CANCELED',paid_until_date:'2020-01-01'}));
 assert.equal(ended.state,'expired');
 const deactivated=await verifySquareSubscriptionWebhook(event,env,fetchSquare({...goodSub,status:'DEACTIVATED',paid_until_date:'2020-01-01'}));
 assert.equal(deactivated.state,'expired');
});
test('Square invalid environments or unrelated event types cannot grant access',async()=>{
 assert.deepEqual(await verifySquareSubscriptionWebhook({...payload,type:'payment.updated'},env,async()=>{throw Error('Should not query Square')}),{ignored:true});
 await assert.rejects(verifySquareSubscriptionWebhook(payload,{...env,SQUARE_ACCESS_TOKEN:''},fetchSquare(goodSub)),{status:503});
});


test('Square refund verification requires completed refund and matching live payment',async()=>{
 const {verifySquareRefundWebhook}=await import('../billing-square-webhook.mjs');
 const event={event_id:'EVT-REFUND-100',type:'refund.updated',data:{id:'REFUND-100'}};
 const env={SQUARE_ENVIRONMENT:'sandbox',SQUARE_ACCESS_TOKEN:'sandbox-token',SQUARE_LOCATION_ID:'LOCATION'};
 const refund={id:'REFUND-100',status:'COMPLETED',payment_id:'PAY-100',order_id:'ORDER-100',
  location_id:'LOCATION',amount_money:{amount:1099,currency:'USD'}};
 const payment={id:'PAY-100',order_id:'ORDER-100',location_id:'LOCATION',
  refunded_money:{amount:1099,currency:'USD'}};
 const mock=(r=refund,p=payment)=>async url=>Response.json(
  url.includes('/v2/refunds/')?{refund:r}:{payment:p});
 const good=await verifySquareRefundWebhook(event,env,mock());
 assert.equal(good.orderId,'ORDER-100');assert.equal(good.paymentId,'PAY-100');
 assert.equal(good.state,'refunded');
 assert.equal((await verifySquareRefundWebhook(event,env,mock({...refund,status:'PENDING'}))).ignored,true);
 await assert.rejects(verifySquareRefundWebhook(event,env,mock(refund,{...payment,refunded_money:{amount:0,currency:'USD'}})),{status:409});
 await assert.rejects(verifySquareRefundWebhook(event,env,mock({...refund,location_id:'OTHER'})),{status:403});
 await assert.rejects(verifySquareRefundWebhook(event,env,mock(refund,{...payment,order_id:'OTHER'})),{status:409});
});
