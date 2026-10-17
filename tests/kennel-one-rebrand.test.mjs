import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read = rel => readFileSync(path.join(root,rel),'utf8');
const ids=['dog-tag','kennel-crate-tag','nfc-1','nfc-5','nfc-10','nfc-25','holder-kit','holder-5','facility-kit'];
function catalog(file) {
  const text=read(file);
  const found=Object.fromEntries([...text.matchAll(/'([\w-]+)':\s*\{\s*name:\s*'([^']+)',\s*(price|cents):\s*([\d.]+)/g)]
    .map(([,id,name,unit,price])=>[id,{name,cents:unit==='cents'?Number(price):Math.round(Number(price)*100)}]));
  return found;
}
test('Website product labels and all nine prices match both Square server catalogs',()=>{
  const front=catalog('assets/site.js'),a=catalog('server.js'),b=catalog('SquarePaymentServer/server.js');
  for(const id of ids) {
    assert.ok(front[id],id);
    assert.deepEqual(a[id],front[id], 'checkout catalog: '+id);
    assert.deepEqual(b[id],front[id], 'production Square catalog: '+id);
  }
  assert.match(front['nfc-1'].name,/Kennel One/);
  assert.match(read('assets/checkout.js'),/https:\/\/kennelflow-payments\.onrender\.com/,'preserved existing payment endpoint');
});
test('Site contains approved mountain logo; no fake image links',()=>{
  const art=readFileSync(path.join(root,'assets/kennelone-mountain-mist.jpg'));
  assert.ok(art.length>200000);
  assert.equal(art[0],0xff);assert.equal(art[1],0xd8);
  assert.match(read('index.html'),/src="assets\/kennelone-mountain-mist.jpg"/);
  assert.match(read('assets/styles.css'),/\.hero-artwork img/);
});
test('Store displays Kennel One labels, discloses genuine legacy-labeled physical inventory',()=>{
  const html=read('shop.html');
  assert.match(html,/<h3>Kennel One-Compatible NFC Tag<\/h3>/);
  assert.match(html,/original KennelFlow name/);
  assert.match(html,/Square-hosted secure payment page/);
  assert.doesNotMatch(html,/<h3>KennelFlow/);
});
test('Support is a real mail action rather than fake-success form',()=>{
  const html=read('support.html');
  assert.match(html,/mailto:kennelflowapp@gmail\.com/);
  assert.doesNotMatch(html,/id="contact-form"/);
});
test('App Store links use the existing listing, no inactive QR or coming-soon button',()=>{
  for(const rel of ['download.html','smart-kennels.html'])
    assert.match(read(rel),/https:\/\/apps\.apple\.com\/app\/id6809212861/);
  assert.ok(existsSync(path.join(root,'assets/kennelone-appstore-qr.png')));
  assert.doesNotMatch(read('smart-kennels.html'),/coming-soon\.png/);
});
test('Rebrand preserves identifiers and old customer data mappings',()=>{
  const portal=read('KennelFlowWeb/app.js');
  assert.match(portal,/kennelflow\.pendingSquare\./);
  assert.match(portal,/kennelflow:\\\/\\\/smart/);
  assert.match(portal,/link\.download='kennelone-'/);
  assert.match(read('assets/site.js'),/localStorage\.getItem\('kfCart'\)/);
  assert.match(read('server.js'),/STORE_SUCCESS_URL \|\| 'https:\/\/kennelflowpro\.app\/order-success\.html'/);
  assert.match(read('SquarePaymentServer/server.js'),/QUAILFLOW_STORE_SUCCESS_URL/);
  assert.match(read('SquarePaymentServer/server.js'),/RABBITFLOW_STORE_SUCCESS_URL/);
});
test('Marketing page links point to real local files or external resources',()=>{
 for(const rel of ['index.html','features.html','pricing.html','shop.html','download.html','smart-kennels.html','support.html','checkout.html','terms.html','privacy.html']) {
  for(const [,href] of read(rel).matchAll(/\bhref="([^"]+)"/g)) {
   if(/^(mailto:|https?:|#|tel:)/.test(href)) continue;
   const dest=href.split('?')[0].split('#')[0];
   if(dest) assert.ok(existsSync(path.join(root,dest)), rel+' broken link to '+href);
  }
 }
});

test('Legal pages accurately identify the previous brand and retain review notices',()=>{
  for(const rel of ['privacy.html','terms.html']) {
    const html=read(rel);
    assert.match(html,/Kennel One, formerly KennelFlow\./);
    assert.doesNotMatch(html,/formerly Kennel One/);
    assert.match(html,/(must be reviewed and approved|require owner approval)/);
  }
});

test('Staged privacy policy explains cloud data collection without publishing unverified claims',()=>{
  const html=read('privacy.html');
  assert.match(html,/employee names, email addresses/);
  assert.match(html,/cloud features/);
  assert.match(html,/CloudKit/);
  assert.match(html,/Render and Neon/);
  assert.match(html,/App Store's privacy summary/);
  assert.match(html,/must be reviewed and approved/);
});
