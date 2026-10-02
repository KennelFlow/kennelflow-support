import { WebhooksHelper } from 'square';

const emailedPayments = new Map();
const textedPayments = new Map();

function remember(map,id){
  if(!id || map.has(id)) return false;
  map.set(id,Date.now());
  if(map.size>500){
    const old=[...map.entries()].sort((a,b)=>a[1]-b[1]).slice(0,100);
    for(const [key] of old) map.delete(key);
  }
  return true;
}

function money(amount){
  return '$' + (Number(amount||0)/100).toFixed(2);
}

function escapeHTML(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
function orderDetails(order,payment,products){
  const productNames=new Set(Object.values(products).map(p=>p.name));
  const allItems=Array.isArray(order?.line_items)?order.line_items:[];
  const items=allItems.filter(item=>productNames.has(String(item?.name||'')));
  if(!items.length) return null;

  const shipment=(Array.isArray(order?.fulfillments)?order.fulfillments:[])
    .map(f=>f?.shipment_details?.recipient).find(Boolean)||{};
  const address=shipment?.address||{};
  const noteParts=String(payment?.note||'').split(' • ');

  return {
    customerName:shipment.display_name||noteParts[1]||'Customer',
    customerEmail:payment?.buyer_email_address||'See Square order',
    customerPhone:shipment.phone_number||'See Square order',
    total:money(order?.total_money?.amount ?? payment?.amount_money?.amount ?? 0),
    items:items.map(item=>(item.quantity||'1')+' × '+item.name).join('\n'),
    shippingAddress:[
      address.address_line_1,address.address_line_2,
      [address.locality,address.administrative_district_level_1,address.postal_code].filter(Boolean).join(', '),
      address.country
    ].filter(Boolean).join('\n')||'View Square order for shipping address',
    orderID:String(order?.id||payment?.order_id||''),
    paymentID:String(payment?.id||''),
    note:noteParts.slice(2).join(' • ')
  };
}
async function sendEmail(details){
  const to=String(process.env.ORDER_NOTIFICATION_EMAIL||'').trim();
  if(!to) return {skipped:true};

  const subject='KennelFlow New Order — '+details.total;
  const text=[
    'NEW KENNELFLOW STORE ORDER',
    'Total: '+details.total,
    'Customer: '+details.customerName,
    'Email: '+details.customerEmail,
    'Phone: '+details.customerPhone,'','Items:',details.items,'',
    'Shipping:',details.shippingAddress,
    details.note?'\nOrder notes: '+details.note:'',
    '\nSquare Order ID: '+details.orderID
  ].filter(Boolean).join('\n');

  const html='<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:640px">'+
    '<h2 style="color:#174d35">New KennelFlow Store Order</h2>'+
    '<p style="font-size:24px;font-weight:700">'+escapeHTML(details.total)+'</p>'+
    '<p><strong>Customer:</strong> '+escapeHTML(details.customerName)+'<br>'+
    '<strong>Email:</strong> '+escapeHTML(details.customerEmail)+'<br>'+
    '<strong>Phone:</strong> '+escapeHTML(details.customerPhone)+'</p>'+
    '<h3>Items</h3><pre style="font-family:inherit;white-space:pre-wrap">'+escapeHTML(details.items)+'</pre>'+
    '<h3>Shipping</h3><pre style="font-family:inherit;white-space:pre-wrap">'+escapeHTML(details.shippingAddress)+'</pre>'+
    (details.note?'<p><strong>Order notes:</strong> '+escapeHTML(details.note)+'</p>':'')+
    '<p style="color:#667">Square Order ID: '+escapeHTML(details.orderID)+'</p></div>';

  const sid=String(process.env.TWILIO_ACCOUNT_SID||'').trim();
  const token=String(process.env.TWILIO_AUTH_TOKEN||'').trim();
  if(sid && token){
    const auth=Buffer.from(sid+':'+token).toString('base64');
    const response=await fetch('https://comms.twilio.com/v1/Emails',{
      method:'POST',
      headers:{Authorization:'Basic '+auth,'Content-Type':'application/json'},
      body:JSON.stringify({
        from:{address:sid+'@twilio.email',name:'KennelFlow Orders'},
        to:[{address:to}],
        content:{subject,html}
      })
    });
    if(response.ok) return {ok:true,provider:'twilio'};
    const detail=await response.text();
    console.error('Twilio email failed ('+response.status+'): '+detail.slice(0,300));
  }

  const apiKey=String(process.env.RESEND_API_KEY||'').trim();
  if(apiKey){
    const from=String(process.env.RESEND_FROM_EMAIL||
      'KennelFlow Orders <onboarding@resend.dev>').trim();
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
      body:JSON.stringify({from,to:[to],subject,text,html})
    });
    if(response.ok) return {ok:true,provider:'resend'};
    const detail=await response.text();
    throw new Error('Email delivery failed. Resend ('+response.status+'): '+detail.slice(0,300));
  }

  return {skipped:true};
}

async function sendText(details){
  const sid=String(process.env.TWILIO_ACCOUNT_SID||'').trim();
  const token=String(process.env.TWILIO_AUTH_TOKEN||'').trim();
  const from=String(process.env.TWILIO_FROM_NUMBER||'').trim();
  const to=String(process.env.ORDER_NOTIFICATION_PHONE||'').trim();
  if(!sid || !token || !from || !to) return {skipped:true};
  const body=('KennelFlow NEW ORDER: '+details.total+' from '+details.customerName+
    '. '+details.items.replace(/\n/g,'; ')+'. Order '+details.orderID).slice(0,1000);
  const form=new URLSearchParams({To:to,From:from,Body:body});
  const auth=Buffer.from(sid+':'+token).toString('base64');
  const response=await fetch(
    'https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(sid)+'/Messages.json',
    {method:'POST',headers:{Authorization:'Basic '+auth,
      'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()}
  );
  if(!response.ok){
    const detail=await response.text();
    throw new Error('Twilio SMS failed ('+response.status+'): '+detail.slice(0,300));
  }
  return {ok:true};
}

async function fetchOrder(orderID,config){
  const response=await fetch(config.squareApiBase+'/v2/orders/'+encodeURIComponent(orderID),{
    headers:{Authorization:'Bearer '+config.accessToken,
      'Square-Version':config.squareApiVersion,'Content-Type':'application/json'}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(
    data?.errors?.[0]?.detail||data?.errors?.[0]?.code||'Unable to retrieve Square order.'
  );
  return data?.order||null;
}
export function installKennelFlowOrderNotificationRoutes(app,config){
  app.post('/square/webhook',async(req,res)=>{
    try{
      const signatureKey=String(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY||'').trim();
      const notificationURL=String(process.env.SQUARE_WEBHOOK_URL||
        'https://kennelflow-payments.onrender.com/square/webhook').trim();
      if(!signatureKey) return res.status(503).json({error:'Square webhook is not configured.'});

      const valid=await WebhooksHelper.verifySignature({
        requestBody:String(req.rawBody||''),
        signatureHeader:String(req.get('x-square-hmacsha256-signature')||''),
        signatureKey,notificationUrl:notificationURL
      });
      if(!valid) return res.status(403).json({error:'Invalid Square webhook signature.'});

      const event=req.body||{};
      if(event.type!=='payment.updated') return res.sendStatus(200);
      const payment=event?.data?.object?.payment;
      if(!payment || payment.status!=='COMPLETED' || !payment.order_id) return res.sendStatus(200);
      if(config.configuredLocationID && payment.location_id!==config.configuredLocationID) return res.sendStatus(200);

      const order=await fetchOrder(payment.order_id,config);
      const details=orderDetails(order,payment,config.products);
      if(!details) return res.sendStatus(200);
      const tasks=[];
      if(String(process.env.ORDER_NOTIFICATION_EMAIL||'').trim() &&
         ((String(process.env.TWILIO_ACCOUNT_SID||'').trim() && String(process.env.TWILIO_AUTH_TOKEN||'').trim()) || String(process.env.RESEND_API_KEY||'').trim()) &&
         remember(emailedPayments,details.paymentID)){
        tasks.push(sendEmail(details).catch(error=>{
          emailedPayments.delete(details.paymentID);
          console.error('KennelFlow order email error:',error?.message||error);
        }));
      }
      if(String(process.env.TWILIO_ACCOUNT_SID||'').trim() &&
         String(process.env.ORDER_NOTIFICATION_PHONE||'').trim() &&
         remember(textedPayments,details.paymentID)){
        tasks.push(sendText(details).catch(error=>{
          textedPayments.delete(details.paymentID);
          console.error('KennelFlow order text error:',error?.message||error);
        }));
      }

      await Promise.all(tasks);
      console.log('KennelFlow order notification processed:',details.orderID,details.total);
      return res.sendStatus(200);
    }catch(error){
      console.error('KennelFlow Square webhook error:',error?.message||error);
      return res.sendStatus(500);
    }
  });
}
