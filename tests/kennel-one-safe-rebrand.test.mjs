import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(x)=>readFileSync(path.join(root,x),'utf8');
test('Original customer site address remains unchanged',()=>assert.equal(read('CNAME').trim(),'kennelflowpro.app'));
test('New approved Kennel One image assets exist',()=>{
  assert.ok(existsSync(path.join(root,'assets/kennelone-logo.png')));
  assert.ok(existsSync(path.join(root,'assets/kennelone-mountain-mist.jpg')));
  assert.match(read('index.html'),/assets\/kennelone-mountain-mist.jpg/);
});
test('Homepage, navigation and checkout present Kennel One',()=>{
  assert.match(read('index.html'),/Kennel One — Complete/);
  assert.match(read('assets/common.js'),/Kennel One logo/);
  for(const file of ['pricing.html','shop.html','checkout.html','download.html','features.html','smart-kennels.html'])
     assert.match(read(file),/Kennel One/);
  assert.doesNotMatch(read('index.html'),/KennelFlow/);
  assert.doesNotMatch(read('assets/common.js'),/>KennelFlow</);
});
test('New support email and current website payment endpoint are preserved',()=>{
  assert.match(read('assets/common.js'),/mailto:kenneloneapp@gmail.com/);
  assert.match(read('support.html'),/mailto:kenneloneapp@gmail.com/);
  assert.match(read('assets/site.js'),/mailto:kenneloneapp@gmail.com/);
  assert.match(read('assets/checkout.js'),/https:\/\/kennelflow-payments\.onrender\.com/);
});
test('Current Apple listing linked, not falsely announced as already rebranded',()=>{
  assert.match(read('download.html'),/apps\.apple\.com\/app\/id6809212861/);
  assert.match(read('download.html'),/previous KennelFlow name/);
});
test('Price presentation updated without changing product IDs',()=>{
  const pricing=read('pricing.html');
  for(const p of ['$10.99','$99.00','$299.99']) assert.ok(pricing.includes(p));
  assert.match(read('assets/site.js'),/'dog-tag'/);
  assert.match(read('assets/site.js'),/'facility-kit'/);
  assert.match(read('assets/site.js'),/localStorage\.getItem\('kfCart'\)/);
});
test('Real legacy printed hardware branding is disclosed and checkout preserved',()=>{
  const shop=read('shop.html');
  assert.match(shop,/original KennelFlow name/);
  assert.match(shop,/Secure Square checkout/);
  assert.match(read('checkout.html'),/assets\/checkout\.js/);
  assert.match(read('order-success.html'),/Square checkout/);
});
test('All page assets and internal links are resolvable',()=>{
 for(const name of ['index.html','download.html','pricing.html','shop.html','checkout.html','features.html','support.html','privacy.html','terms.html','smart-kennels.html']) {
  const s=read(name);
  for(const [,url] of s.matchAll(/(?:href|src)="([^"]+)"/g)){
   if(/^(https?:|mailto:|#|data:)/.test(url))continue;
   if(/^(assets\/|[a-z][\w-]*\.html)/.test(url)){
     const clean=url.split('?')[0];
     assert.ok(existsSync(path.join(root,clean)),name+' has broken link '+url);
   }
  }
 }
});
