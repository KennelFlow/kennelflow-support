function header(active=''){
  return `<header class="site-header"><div class="container nav">
    <a class="brand" href="index.html"><img src="assets/kennelflow-logo.jpeg" alt="KennelFlow logo"><span>KennelFlow</span></a>
    <button class="mobile-toggle" onclick="navToggle()" aria-label="Menu">☰</button>
    <nav class="nav-links">
      <a href="features.html">Features</a><a href="smart-kennels.html">Smart Kennels</a><a href="shop.html">Shop</a><a href="pricing.html">Pricing</a><a href="support.html">Support</a>
    </nav>
    <div class="nav-actions"><a class="btn btn-secondary" href="download.html">Download</a><a class="btn btn-primary" href="shop.html">Shop NFC</a></div>
  </div></header>`;
}
function footer(){
  return `<footer class="footer"><div class="container"><div class="footer-grid">
    <div><a class="brand" href="index.html"><img src="assets/kennelflow-logo.jpeg" alt="KennelFlow logo"><span>KennelFlow</span></a><p style="color:#cbd8d1;max-width:380px;line-height:1.6">Complete canine and kennel management built for professional facilities, breeders, handlers, and working-dog teams.</p></div>
    <div><strong>Product</strong><a href="features.html">Features</a><a href="smart-kennels.html">Smart Kennels</a><a href="pricing.html">Pricing</a><a href="download.html">Download</a></div>
    <div><strong>Store</strong><a href="shop.html">NFC Tags</a><a href="shop.html">Kennel Holders</a><a href="shop.html">Facility Kits</a></div>
    <div><strong>Company</strong><a href="support.html">Support</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a></div>
  </div><div class="footer-bottom">© 2026 KennelFlow. All rights reserved.</div></div></footer>`;
}
function cartUI(){return `<div id="cart-overlay" class="cart-overlay" onclick="closeCart()"></div><aside id="cart-drawer" class="cart-drawer"><div class="cart-head"><strong>Your Cart</strong><button class="btn btn-secondary" onclick="closeCart()">Close</button></div><div id="cart-body" class="cart-body"></div><div class="cart-footer"><div class="cart-total"><span>Total</span><span id="cart-total">$0.00</span></div><button class="btn btn-primary" style="width:100%" onclick="checkout()">Checkout</button></div></aside><button class="cart-fab" onclick="openCart()">Cart (<span id="cart-count">0</span>)</button>`}
