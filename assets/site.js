const PRODUCTS = {
  'nfc-1': {name:'KennelFlow NFC Tag', price:12.99},
  'nfc-5': {name:'5-Pack NFC Tags', price:54.99},
  'nfc-10': {name:'10-Pack NFC Tags', price:99.99},
  'nfc-25': {name:'25-Pack NFC Tags', price:219.99},
  'holder-kit': {name:'NFC Tag + Kennel Holder', price:29.99},
  'facility-kit': {name:'10-Kennel Smart Facility Kit', price:259.99}
};

function getCart(){ try{return JSON.parse(localStorage.getItem('kfCart'))||{}}catch{return{}} }
function setCart(cart){localStorage.setItem('kfCart',JSON.stringify(cart));renderCart();}
function addToCart(id){const cart=getCart();cart[id]=(cart[id]||0)+1;setCart(cart);openCart();}
function changeQty(id,delta){const cart=getCart();cart[id]=(cart[id]||0)+delta;if(cart[id]<=0)delete cart[id];setCart(cart);}
function cartCount(){return Object.values(getCart()).reduce((a,b)=>a+b,0)}
function cartTotal(){const cart=getCart();return Object.entries(cart).reduce((sum,[id,q])=>sum+(PRODUCTS[id]?.price||0)*q,0)}
function renderCart(){
  const body=document.querySelector('#cart-body');
  const count=document.querySelector('#cart-count');
  const total=document.querySelector('#cart-total');
  if(count)count.textContent=cartCount();
  if(total)total.textContent=`$${cartTotal().toFixed(2)}`;
  if(!body)return;
  const cart=getCart();
  const entries=Object.entries(cart);
  body.innerHTML=entries.length?entries.map(([id,q])=>{
    const p=PRODUCTS[id]; if(!p)return '';
    return `<div class="cart-item"><div><strong>${p.name}</strong><br><small>$${p.price.toFixed(2)} each</small></div><div class="cart-actions"><button onclick="changeQty('${id}',-1)">−</button><strong>${q}</strong><button onclick="changeQty('${id}',1)">+</button></div></div>`
  }).join(''):'<p>Your cart is empty.</p>';
}
function openCart(){document.querySelector('#cart-drawer')?.classList.add('open');document.querySelector('#cart-overlay')?.classList.add('show');}
function closeCart(){document.querySelector('#cart-drawer')?.classList.remove('open');document.querySelector('#cart-overlay')?.classList.remove('show');}
function checkout(){
  const cart=getCart();
  if(!Object.keys(cart).length){alert('Your cart is empty.');return;}
  localStorage.setItem('kfCheckoutCart',JSON.stringify(cart));
  window.location.href='checkout.html';
}
function navToggle(){document.querySelector('.nav-links')?.classList.toggle('open')}

document.addEventListener('DOMContentLoaded',()=>{
  renderCart();
  document.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>addToCart(btn.dataset.add)));
  const form=document.querySelector('#contact-form');
  if(form)form.addEventListener('submit',(e)=>{e.preventDefault();alert('Thanks — this demo form is ready to connect to your support email in the next website build.');form.reset();});
});
