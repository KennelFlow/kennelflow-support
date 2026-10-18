import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read = path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('independent kennelone landing exists and does not hijack legacy CNAME',()=>{
 assert.equal(read('CNAME').trim(),'kennelflowpro.app');
 assert.ok(existsSync(new URL('../deploy/kennelone-public/assets/kennelone-logo.png',import.meta.url)));
 assert.ok(existsSync(new URL('../deploy/kennelone-public/assets/kennelone-mountain-mist.jpg',import.meta.url)));
 const site=read('deploy/kennelone-public/index.html');
 assert.match(site,/<title>Kennel One/);
 assert.match(site,/index,follow/);
 assert.match(site,/https:\/\/app\.kennelflowpro\.app/);
 assert.match(site,/https:\/\/apps\.apple\.com\/us\/app\/id6809212861/);
 assert.doesNotMatch(site,/https:\/\/app\.kennelone\.app/);
 assert.doesNotMatch(site,/Google Play|Android/);
});
test('staged domain plan preserves old domains and requires verified TLS',()=>{
 const plan=read('docs/KennelOne-Domain-Activation-2026-10-17.md');
 assert.match(plan,/216\.24\.57\.1/);
 assert.match(plan,/kennelone-public\.onrender\.com/);
 assert.match(plan,/Do \*\*not\*\* add either DNS record until/);
 assert.match(plan,/app\.kennelflowpro\.app/);
});

test('public landing shows six genuine screenshot assets without missing links',()=>{
 const page=read('deploy/kennelone-public/index.html');
 for(const file of ['01_Home.jpg','02_Dogs.jpg','03_Litters.jpg','04_Duties.jpg','05_Calendar.jpg','06_Smart.jpg']){
   assert.ok(existsSync(new URL('../deploy/kennelone-public/assets/screenshots/'+file,import.meta.url)));
   assert.ok(page.includes('assets/screenshots/'+file));
 }
 assert.match(page,/loading="lazy"/);
 assert.match(read('deploy/kennelone-public/styles.css'),/screen-gallery/);
});

test('public website support link stays consistent with live Kennel One support email',()=>{
 const site=read('deploy/kennelone-public/index.html');
 assert.match(site,/mailto:kenneloneapp@gmail\.com/);
 assert.doesNotMatch(site,/mailto:kennelflowapp@gmail\.com/);
});


test('Kennel One public pages render locally and keep checkout and portal operational',()=>{
 const localPaths=['shop.html','support.html','checkout.html','privacy.html','terms.html','smart-kennels.html','features.html','pricing.html','download.html','order-success.html'];
 for(const path of localPaths){
  const page=read('deploy/kennelone-public/'+path);
  assert.match(page,/<title>[^<]+/);
  assert.doesNotMatch(page,/http-equiv="refresh"|window\.location\.replace\(/);
  assert.ok(page.includes('https://kennelone.app/'+path),path+' canonical points to new domain');
 }
 const app=read('deploy/kennelone-public/app.html');
 assert.match(app,/https:\/\/app\.kennelflowpro\.app/);
 assert.ok(app.includes('window.location.replace'), 'existing signed-in portal unchanged');
 const home=read('deploy/kennelone-public/index.html');
 for(const path of ['/shop.html','/support.html','/privacy.html','/terms.html']) assert.ok(home.includes('href="'+path+'"'));
 assert.match(read('deploy/kennelone-public/robots.txt'),/Allow: \//);
});
test('new on-domain Kennel One store preserves exact products and Square checkout wiring',()=>{
 const base='deploy/kennelone-public/';
 const shop=read(base+'shop.html');
 const ids=Array.from(shop.matchAll(/data-add="([^"]+)"/g),m=>m[1]);
 assert.deepEqual(ids,['dog-tag','kennel-crate-tag','nfc-1','nfc-5','nfc-10','nfc-25','holder-kit','holder-5','facility-kit']);
 const prices=Array.from(shop.matchAll(/<div class="price">(\$[^<]+)<\/div>/g),m=>m[1]);
 assert.deepEqual(prices,['$9.99','$14.99','$4.99','$22.99','$39.99','$84.99','$14.99','$69.99','$134.99']);
 const srcs=Array.from(shop.matchAll(/<img[^>]+src="([^"]+)"/g),m=>m[1]);
 assert.equal(srcs.length,9);
 for(const src of srcs) assert.ok(existsSync(new URL('../'+base+src,import.meta.url)),src);
 for(const file of ['assets/common.js','assets/site.js','assets/checkout.js','assets/styles.css']) assert.ok(existsSync(new URL('../'+base+file,import.meta.url)),file);
 const storeJs=read(base+'assets/site.js');
 const checkoutJs=read(base+'assets/checkout.js');
 assert.match(storeJs,/localStorage\.setItem\('kfCheckoutCart'/);
 assert.match(storeJs,/window\.location\.href='checkout\.html'/);
 assert.match(checkoutJs,/https:\/\/kennelflow-payments\.onrender\.com/);
 assert.match(checkoutJs,/store\/create-checkout/);
});
