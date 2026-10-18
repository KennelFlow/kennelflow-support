// Kennel One merchant notification for verified Square store orders.
// Merchant-only email. No buyer mail or personal data is persisted in D1.
// Resend supports 24-hour idempotency keys. The D1 SETTLED status also suppresses
// later deliveries after successful processing.
const PRODUCTS=new Set([
  'Smart Kennel Management Dog Tag','Smart Kennel Management Kennel/Crate Tag',
  'Kennel One NFC Tag','Kennel One-Compatible NFC Tag','5-Pack NFC Tags','10-Pack NFC Tags','25-Pack NFC Tags',
  'NFC Tag + Kennel Holder','5-Kennel Smart Holder Set','10-Kennel Smart Facility Kit'
]);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const money=cents=>'$'+(cents/100).toFixed(2);

export function kennelOneStoreDetails(verified) {
  if(verified?.type!=='store-order')return null;
  const p=verified.payment,o=verified.order;
  const note=String(p?.note||'');
  if(!note.startsWith('Kennel One Store'))return null;
  if(!Array.isArray(o?.line_items)||!o.line_items.length)return null;
  const productItems=o.line_items.filter(i=>PRODUCTS.has(String(i?.name||'')));
  if(productItems.length===0)return null;
  const cents=Number(p.amount_money?.amount);
  if(!Number.isSafeInteger(cents)||cents<100)return null;
  const address=(o.fulfillments||[]).map(f=>f?.shipment_details?.recipient).find(Boolean)||{};
  const ship=address.address||{};
  const shipping=[ship.address_line_1,ship.address_line_2,
    [ship.locality,ship.administrative_district_level_1,ship.postal_code].filter(Boolean).join(', '),ship.country
  ].filter(Boolean).join('\n');
  return {
    paymentID:p.id,
    orderID:o.id,
    amount:cents,
    customerName:String(address.display_name||note.split(' • ')[1]||'Customer').slice(0,120),
    email:String(p.buyer_email_address||'See Square order').slice(0,254),
    phone:String(address.phone_number||'See Square order').slice(0,50),
    items:productItems.map(i=>String(i.quantity||'1')+' × '+String(i.name)).join('\n'),
    shipping:shipping||'View Square order for shipping address',
    notes:note.split(' • ').slice(2).join(' • ').slice(0,350)
  };
}
export async function notifyKennelOneStore(verified,env={},fetcher=fetch) {
  const info=kennelOneStoreDetails(verified);
  if(!info)throw Error('Not a Kennel One store purchase');
  const apiKey=env.RESEND_API_KEY,to=env.ORDER_NOTIFICATION_EMAIL;
  const from=env.RESEND_FROM_EMAIL;
  if(!apiKey||!to||!from||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
    throw Error('Kennel One merchant email is not configured');
  const idempotencyKey='kennelone-store/'+info.paymentID;
  if(idempotencyKey.length>256)throw Error('Invalid email idempotency key');
  const subject='Kennel One New Order — '+money(info.amount);
  const text=[
    'KENNEL ONE NEW STORE ORDER','Total: '+money(info.amount),
    'Customer: '+info.customerName,'Email: '+info.email,'Phone: '+info.phone,
    'Items:',info.items,'Shipping:',info.shipping,
    ...(info.notes?['Order notes: '+info.notes]:[]),
    'Square Order: '+info.orderID
  ].join('\n');
  const html='<section style="font-family:Arial,sans-serif;max-width:620px">'+
    '<h2>Kennel One New Store Order</h2>'+
    '<p><strong>Total:</strong> '+esc(money(info.amount))+'</p>'+
    '<p><strong>Customer:</strong> '+esc(info.customerName)+'</p>'+
    '<p><strong>Email:</strong> '+esc(info.email)+'</p>'+
    '<p><strong>Phone:</strong> '+esc(info.phone)+'</p>'+
    '<h3>Items</h3><pre>'+esc(info.items)+'</pre>'+
    '<h3>Shipping</h3><pre>'+esc(info.shipping)+'</pre>'+
    (info.notes?'<p><strong>Notes:</strong> '+esc(info.notes)+'</p>':'')+
    '<p>Square Order: '+esc(info.orderID)+'</p></section>';
  const response=await fetcher('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},
    body:JSON.stringify({from,to:[to],subject,text,html}),
    redirect:'manual',signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('Email notification failed ('+response.status+')');
  const data=await response.json().catch(()=>({}));
  if(typeof data.id!=='string'||!data.id)throw Error('Email provider did not acknowledge receipt');
  return {sent:true,provider:'resend',messageID:data.id};
}
