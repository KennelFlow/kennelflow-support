import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/store/create-checkout.js';
const origin = 'https://kennelone-public.pages.dev';
const payload={items:[{id:'nfc-1',quantity:1}],buyer:{email:'invalid'}};
function request(options={}) {
  return new Request(origin+'/store/create-checkout', {method:'POST',
    headers:{'Origin':origin,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin',...options.headers},
    body:JSON.stringify(options.payload ?? payload)});
}
test('rejects cross-origin requests',async()=>{
  const r=await onRequest({request:request({headers:{Origin:'https://bad.example'}})});
  assert.equal(r.status,403);
});
test('rejects missing Origin header',async()=>{
  const req=request();req.headers.delete('origin');
  assert.equal((await onRequest({request:req})).status,403);
});
test('rejects empty carts without calling payments service',async()=>{
  const req=request({payload:{items:[]}});
  assert.equal((await onRequest({request:req})).status,400);
});
test('rejects GET requests',async()=>{
  assert.equal((await onRequest({request:new Request(origin+'/store/create-checkout')})).status,405);
});
test('forwards valid structure and JSON errors without payment charges',async()=>{
  const oldFetch=globalThis.fetch;let endpoint,details;
  globalThis.fetch=async (url,init)=>{endpoint=url;details=init;return new Response(JSON.stringify({error:'A valid email address is required.'}),{status:400,headers:{'Content-Type':'application/json'}})};
  try {
    const r=await onRequest({request:request()});
    assert.equal(r.status,400);assert.equal(endpoint,'https://payments.kennelone.app/store/create-checkout');
    assert.equal(JSON.parse(details.body).buyer.email,'invalid');
    assert.equal(r.headers.get('cache-control'),'no-store');
  }finally{globalThis.fetch=oldFetch}
});
