import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyMerchantOnceSMS,sendMerchantOrderSMS} from '../functions/_lib/store-sms.mjs';
const testPayment={type:'store-order',storeName:'QuailFlow',
 payment:{id:'test-sms-payment',note:'QuailFlow Store • Customer',amount_money:{amount:2299}},
 order:{id:'test-sms-order',line_items:[{name:'5 Quail + Embedded NFC',quantity:'1'}]}};
const env={TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'fake-test-token',
 TWILIO_FROM_NUMBER:'+18005550101',ORDER_NOTIFICATION_PHONE:'+18005550102'};
function database(){
 const records=new Map();
 return {records,prepare(sql){
  let args=[];
  return {bind(...a){args=a;return this},
   async first(){
    if(sql.startsWith('INSERT')){
     const k=args[0]+':'+args[1];
     if(records.has(k))return null;
     records.set(k,{status:args[2]});return {status:args[2]};
    }
    if(sql.startsWith('SELECT'))return records.get(args[0]+':'+args[1])||null;
    throw Error('Unexpected SQL');
   },
   async run(){
    if(!sql.startsWith('UPDATE'))throw Error('Unexpected SQL');
    records.set(args[2]+':sms',{status:'SENT',messageID:args[0]});
    return {success:true};
   }
  };
 }};
}
test('Twilio SMS uses server credentials and only Square-verifiable purchase details',async()=>{
 let result;
 const r=await sendMerchantOrderSMS(testPayment,env,async(url,options)=>{
  result={url,options};
  return Response.json({sid:'SM'+'b'.repeat(32)});
 });
 assert.equal(r.sent,true);
 assert.match(result.url,/api\.twilio\.com\/2010-04-01\/Accounts\/AC/);
 assert.equal(result.options.headers['Content-Type'],'application/x-www-form-urlencoded');
 assert.match(result.options.body,/QuailFlow/);
 assert.match(result.options.headers.Authorization,/^Basic /);
 assert(!result.options.body.includes(env.TWILIO_AUTH_TOKEN));
});
test('exactly one claim and send across duplicate webhook deliveries',async()=>{
 const db=database();let sends=0;
 const notifier=async()=>{sends++;return {sent:true,messageID:'SM'+ 'b'.repeat(32)}};
 const local={...env,EVENTS:db};
 const first=await notifyMerchantOnceSMS(testPayment,local,notifier);
 assert.equal(first.sent,true);assert.equal(first.alreadySent,false);
 const repeat=await notifyMerchantOnceSMS(testPayment,local,notifier);
 assert.equal(repeat.alreadySent,true);assert.equal(sends,1);
 assert.equal(db.records.size,1);
});
test('uncertain SMS gateway failure cannot be automatically re-sent',async()=>{
 const db=database();let sends=0;
 const notifier=async()=>{sends++;throw Error('Twilio timeout')};
 const local={...env,EVENTS:db};
 await assert.rejects(()=>notifyMerchantOnceSMS(testPayment,local,notifier),/Twilio timeout/);
 await assert.rejects(()=>notifyMerchantOnceSMS(testPayment,local,notifier),/manual reconciliation/);
 assert.equal(sends,1);
 assert.equal(db.records.get('test-sms-payment:sms').status,'CLAIMED');
});
test('unknown store attribution cannot claim an SMS delivery',async()=>{
 const db=database();
 await assert.rejects(()=>notifyMerchantOnceSMS({...testPayment,storeName:'Unknown Store'},{...env,EVENTS:db}),/Unknown merchant/);
 assert.equal(db.records.size,0);
});
test('merchant texting fails closed when missing Twilio configuration',async()=>{
 await assert.rejects(()=>sendMerchantOrderSMS(testPayment,{}),/not configured/);
});
