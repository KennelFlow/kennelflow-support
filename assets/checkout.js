const STORE_API_BASE = 'https://kennelflow-payments.onrender.com';

function checkoutCart(){
  try{return JSON.parse(localStorage.getItem('kfCheckoutCart')||localStorage.getItem('kfCart')||'{}')||{}}catch{return{}}
}

function renderCheckoutPage(){
  const cart=checkoutCart();
  const items=document.getElementById('checkout-items');
  let subtotal=0;
  const rows=Object.entries(cart).map(([id,q])=>{
    const p=PRODUCTS[id];
    const qty=Math.max(1,Math.min(50,Number(q)||1));
    if(!p)return '';
    subtotal += p.price*qty;
    return `<div class="checkout-line"><div><strong>${p.name}</strong><small>Quantity ${qty} × $${p.price.toFixed(2)}</small></div><strong>$${(p.price*qty).toFixed(2)}</strong></div>`;
  }).filter(Boolean);
  items.innerHTML=rows.join('')||'<div class="empty-checkout"><p>Your cart is empty.</p><a class="btn btn-primary" href="shop.html">Shop NFC Hardware</a></div>';
  document.getElementById('checkout-subtotal').textContent=`$${subtotal.toFixed(2)}`;
  document.getElementById('checkout-total').textContent=`$${subtotal.toFixed(2)}`;
  const form=document.getElementById('secure-checkout-form');
  if(form) form.addEventListener('submit',startSquareCheckout);
  if(!rows.length && form){form.querySelector('button[type="submit"]').disabled=true;}
}

async function startSquareCheckout(event){
  event.preventDefault();
  const button=document.getElementById('square-checkout-btn');
  const status=document.getElementById('checkout-status');
  const cart=checkoutCart();
  if(!Object.keys(cart).length){status.textContent='Your cart is empty.';return;}
  const form=new FormData(event.currentTarget);
  const payload={
    items:Object.entries(cart).map(([id,quantity])=>({id,quantity:Number(quantity)})),
    buyer:{
      firstName:String(form.get('firstName')||'').trim(),
      lastName:String(form.get('lastName')||'').trim(),
      email:String(form.get('email')||'').trim(),
      phone:String(form.get('phone')||'').trim()
    },
    notes:String(form.get('notes')||'').trim()
  };
  button.disabled=true;
  button.textContent='Opening Square Checkout…';
  status.textContent='Creating your secure checkout…';
  try{
    const response=await fetch(`${STORE_API_BASE}/store/create-checkout`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok || !data.url) throw new Error(data.error||'Unable to start secure checkout.');
    window.location.assign(data.url);
  }catch(error){
    status.textContent=`Checkout could not start: ${error.message}`;
    button.disabled=false;
    button.textContent='Continue to Secure Square Checkout';
  }
}
