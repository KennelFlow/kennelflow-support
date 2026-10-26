import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCompletedCheckout,verifyActiveSquareSubscription,verifiedLifetimeEntitlement} from '../billing-square-verify.mjs';

const env={SQUARE_ACCESS_TOKEN:'sandbox-token',SQUARE_ENVIRONMENT:'sandbox',SQUARE_LOCATION_ID:'LOCATION',
 KO_SQUARE_MONTHLY_VARIATION_ID:'MON-VAR',KO_SQUARE_ANNUAL_VARIATION_ID:'ANNUAL-VAR'};
const checkout={orderId:'ORDER-100',plan:'annual'};
const pay={id:'PAY-100',status:'COMPLETED',order_id:'ORDER-100',location_id:'LOCATION',
 amount_money:{amount:9999,currency:'USD'},customer_id:'CUSTOMER-100'};
const order={id:'ORDER-100',location_id:'LOCATION',total_money:{amount:9999,currency:'USD'}};
const sub={id:'SUB-100',status:'ACTIVE',location_id:'LOCATION',plan_variation_id:'ANNUAL-VAR',
 customer_id:'CUSTOMER-100',paid_until_date:'2099-12-31'};
const stub=(payment=pay,orderValue=order,subscription=sub)=>async (url)=>{
 if(url.includes('/payments/'))return Response.json({payment});
 if(url.includes('/orders/'))return Response.json({order:orderValue});
 if(url.includes('/subscriptions/'))return Response.json({subscription});
 throw Error('Unexpected Square endpoint');
};
test('genuine Square completed payment is matched to stored pending checkout',async()=>{
 const verified=await verifyCompletedCheckout({checkout,paymentId:'PAY-100'},env,stub());
 assert.equal(verified.orderId,'ORDER-100');
 assert.equal(verified.customerId,'CUSTOMER-100');
});
test('browser redirect alone cannot count as purchase; mismatched payment is rejected',async()=>{
 await assert.rejects(verifyCompletedCheckout({checkout,paymentId:'PAY-100'},env,stub({...pay,status:'PENDING'})),{status:403});
 await assert.rejects(verifyCompletedCheckout({checkout,paymentId:'PAY-100'},env,stub({...pay,order_id:'OTHER'})),{status:403});
 await assert.rejects(verifyCompletedCheckout({checkout,paymentId:'PAY-100'},env,stub({...pay,amount_money:{amount:1099,currency:'USD'}})),{status:403});
 await assert.rejects(verifyCompletedCheckout({checkout,paymentId:'PAY-100'},env,stub(pay,{...order,location_id:'OTHER'})),{status:403});
});
test('Square recurring subscription requires active status, correct plan, customer and paid through date',async()=>{
 const initial=await verifyCompletedCheckout({checkout,paymentId:'PAY-100'},env,stub());
 const result=await verifyActiveSquareSubscription({subscriptionId:'SUB-100',checkout,initialPayment:initial},env,stub());
 assert.equal(result.providerPurchaseId,'sqsub:SUB-100');
 assert.equal(result.plan,'annual');
 await assert.rejects(verifyActiveSquareSubscription({subscriptionId:'SUB-100',checkout,initialPayment:initial},env,stub(pay,order,{...sub,status:'CANCELED'})),{status:403});
 await assert.rejects(verifyActiveSquareSubscription({subscriptionId:'SUB-100',checkout,initialPayment:initial},env,stub(pay,order,{...sub,customer_id:'OTHER'})),{status:403});
 await assert.rejects(verifyActiveSquareSubscription({subscriptionId:'SUB-100',checkout,initialPayment:initial},env,stub(pay,order,{...sub,plan_variation_id:'OTHER'})),{status:403});
 await assert.rejects(verifyActiveSquareSubscription({subscriptionId:'SUB-100',checkout,initialPayment:initial},env,stub(pay,order,{...sub,paid_until_date:'2020-01-01'})),{status:403});
});
test('lifetime entitlement only results from completed verified lifetime checkout',async()=>{
 const lifetime={orderId:'LIFE-ORDER',plan:'lifetime'};
 const lifePayment={...pay,id:'LIFE-PAY',order_id:'LIFE-ORDER',amount_money:{amount:29999,currency:'USD'}};
 const lifeOrder={...order,id:'LIFE-ORDER',total_money:{amount:29999,currency:'USD'}};
 const initial=await verifyCompletedCheckout({checkout:lifetime,paymentId:'LIFE-PAY'},env,stub(lifePayment,lifeOrder));
 assert.equal(verifiedLifetimeEntitlement(initial).providerPurchaseId,'sqpay:LIFE-PAY');
 assert.throws(()=>verifiedLifetimeEntitlement({...initial,plan:'annual'}),{status:403});
});
test('lack of Square credentials fails closed',async()=>{
 await assert.rejects(verifyCompletedCheckout({checkout,paymentId:'PAY-100'},{},stub()),{status:503});
});
