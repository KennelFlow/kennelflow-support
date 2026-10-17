import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../privacy.html',import.meta.url),'utf8');
test('published Kennel One privacy notice describes cloud and user data',()=>{
 for(const content of [
  'Kennel One','October 17, 2026','Apple CloudKit','Render','Neon',
  'Square','staff location entries','subscription or purchase status',
  'deletion','kenneloneapp@gmail.com'
 ])assert.ok(html.includes(content),'Expected privacy disclosure: '+content);
});
test('privacy route does not regress to placeholder website draft',()=>{
 assert.doesNotMatch(html,/Draft website privacy content|website Build 1|must be reviewed and approved before/i);
 assert.match(html,/<title>Privacy Policy — Kennel One<\/title>/);
 assert.match(html,/src="assets\/common.js\?v=20261017-kennelone"/);
});
