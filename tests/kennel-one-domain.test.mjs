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
 assert.match(site,/noindex,nofollow/);
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
