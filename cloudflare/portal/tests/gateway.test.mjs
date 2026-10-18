import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/[[path]].js';
const host = 'https://app.kennelone.app';
test('blocks cross-site account modification', async()=>{
  const r=await onRequest({request:new Request(host+'/api/login',{method:'POST',headers:{origin:'https://attacker.example','sec-fetch-site':'cross-site','Content-Type':'application/json'},body:'{}'})});
  assert.equal(r.status,403);
});
test('requires a browser origin before mutating records',async()=>{
  const r=await onRequest({request:new Request(host+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})});
  assert.equal(r.status,403);
});
test('blocks cross-site read requests with a mismatched origin',async()=>{
  const r=await onRequest({request:new Request(host+'/api/me',{headers:{origin:'https://attacker.example'}})});
  assert.equal(r.status,403);
});
test('forwards login under existing same-origin access controls',async()=>{
  const original=globalThis.fetch;let dest,headers;
  globalThis.fetch=async req=>{dest=req.url;headers=req.headers;return new Response('{"ok":true}',{status:200,headers:{'Content-Type':'application/json','Set-Cookie':'kf_session=abc; HttpOnly; Secure; SameSite=Strict; Path=/'}})};
  try{
    const r=await onRequest({request:new Request(host+'/api/login',{method:'POST',headers:{origin:host,'sec-fetch-site':'same-origin','Content-Type':'application/json'},body:'{}'})});
    assert.equal(r.status,200);assert.equal(dest,'https://kennelflow-web.onrender.com/api/login');
    assert.equal(headers.get('origin'),'https://kennelflow-web.onrender.com');
    assert.match(r.headers.get('set-cookie'),/HttpOnly/);
    assert.equal(r.headers.get('cache-control'),'no-store');
  }finally{globalThis.fetch=original}
});
test('preserves queries and rejects backend redirects',async()=>{
  const original=globalThis.fetch;let dest;
  globalThis.fetch=async req=>{dest=req.url;return new Response(null,{status:302,headers:{location:'https://another.example'}})};
  try{
    const r=await onRequest({request:new Request(host+'/api/kennels?before=123')});
    assert.equal(dest,'https://kennelflow-web.onrender.com/api/kennels?before=123');
    assert.equal(r.status,502);
  }finally{globalThis.fetch=original}
});
