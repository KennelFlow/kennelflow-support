// Merchant SMS for Square-verified store purchases.
// The caller MUST acquire a durable D1 claim before contacting Twilio.
// Twilio SMS has no general, portable retry idempotency key. An uncertain
// attempt remains CLAIMED for manual reconciliation, never auto-resends.
import {kennelOneStoreDetails,sharedStoreDetails} from './store-notifications.mjs';
export async function sendMerchantOrderSMS(verified,env={},fetcher=fetch) {
 const details=verified.storeName==='Kennel One'?
   {...kennelOneStoreDetails(verified),storeName:'Kennel One'}:sharedStoreDetails(verified);
 if(!details)throw Error('Unknown verified merchant order');
 const sid=env.TWILIO_ACCOUNT_SID,secret=env.TWILIO_AUTH_TOKEN;
 const from=env.TWILIO_FROM_NUMBER,to=env.ORDER_NOTIFICATION_PHONE;
 if(!sid||!secret||!from||!to)throw Error('Merchant SMS service is not configured');
 if(!/^AC[0-9a-f]{32}$/i.test(sid))throw Error('Invalid Twilio account');
 const body=(details.storeName+' NEW ORDER / PAYMENT RECEIVED: $'+(details.amount/100).toFixed(2)+
  ' from '+details.customerName+'. '+details.items.replace(/\n/g,'; ')+
  '. Square order '+details.orderID).slice(0,1000);
 const form=new URLSearchParams({To:to,From:from,Body:body});
 const auth=Buffer.from(sid+':'+secret).toString('base64');
 const response=await fetcher('https://api.twilio.com/2010-04-01/Accounts/'+sid+'/Messages.json',{
  method:'POST',headers:{Authorization:'Basic '+auth,'Content-Type':'application/x-www-form-urlencoded'},
  body:form.toString(),redirect:'manual',signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('SMS gateway returned '+response.status);
 const message=await response.json().catch(()=>({}));
 if(typeof message.sid!=='string'||!message.sid.startsWith('SM'))
  throw Error('SMS gateway did not acknowledge the send');
 return {sent:true,messageID:message.sid};
}
export async function notifyMerchantOnceSMS(verified,env,notifier=sendMerchantOrderSMS){
 const store=verified?.storeName,paymentID=verified?.payment?.id;
 if(!['Kennel One','QuailFlow','RabbitFlow'].includes(store)||typeof paymentID!=='string'||!paymentID||
    paymentID.length>192)throw Error('Unknown merchant payment');
 if(!env.EVENTS)throw Error('Durable delivery database is not configured');
 // Atomic insert provides exactly one permitted send attempt for each
 // payment/channel across concurrent Cloudflare instances and webhook retries.
 const claimed=await env.EVENTS.prepare(
  'INSERT INTO notification_deliveries(payment_id,channel,status,created_at) VALUES (?, ?, ?, ?) ON CONFLICT(payment_id,channel) DO NOTHING RETURNING status'
 ).bind(paymentID,'sms','CLAIMED',Date.now()).first();
 if(!claimed){
  const prior=await env.EVENTS.prepare(
   'SELECT status FROM notification_deliveries WHERE payment_id=? AND channel=?'
  ).bind(paymentID,'sms').first();
  if(prior?.status==='SENT')return {sent:true,alreadySent:true};
  throw Error('SMS delivery status requires manual reconciliation');
 }
 // If Twilio receives the message but D1 update fails, the event remains
 // CLAIMED and all retries refuse to generate a duplicate text.
 const answer=await notifier(verified,env);
 if(!answer?.sent||!answer?.messageID)throw Error('SMS provider did not confirm delivery request');
 const result=await env.EVENTS.prepare(
  "UPDATE notification_deliveries SET status='SENT',provider_message_id=?,updated_at=? WHERE payment_id=? AND channel='sms' AND status='CLAIMED'"
 ).bind(answer.messageID,Date.now(),paymentID).run();
 if(result?.success!==true)throw Error('SMS confirmation could not be stored');
 return {sent:true,alreadySent:false};
}
