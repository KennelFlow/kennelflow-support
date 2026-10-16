import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('payment refresh excludes Sandbox records from revenue and preserves the checkout form',async()=>{
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://app.example.test/',pretendToBeVisual:true});
 const previous={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,setInterval:globalThis.setInterval};
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
 const timers=[];globalThis.setInterval=fn=>{timers.push(fn);return 1};
 const kennel=crypto.randomUUID(),user=crypto.randomUUID();
 const record=(method,amount)=>{const id=crypto.randomUUID();return {id,type:'payments',revision:1,data:{platform:'ios',collection:'payments',record:{id,customerName:method,amount,method,date:'2026-10-16T00:00:00Z'}}}};
 const records=[record('Square',10),record('Square Sandbox — TEST ONLY',1)];
 let reads=0;
 globalThis.fetch=async path=>{
  if(path==='/api/me')return Response.json({user:{id:user,name:'Test'},kennels:[{id:kennel,name:'Test',role:'owner'}]});
  if(path.startsWith('/api/records?')){reads++;return Response.json({records,nextCursor:null})}
  if(path.endsWith('/members'))return Response.json({members:[]});
  return Response.json({error:'Not part of this test'},{status:503});
 };
 const until=async predicate=>{for(let i=0;i<300;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5))}assert.fail('UI did not finish refreshing')};
 try{
  await import('../app.js?sandbox-revenue-regression');
  await until(()=>document.getElementById('connection').textContent.startsWith('Synced'));
  [...document.querySelectorAll('#nav button')].find(b=>b.textContent==='Expenses & Payments').click();
  const select=document.getElementById('collection');select.value='payments';select.dispatchEvent(new dom.window.Event('change'));
  const summary=()=>document.querySelector('[data-payment-summary]').textContent;
  const expected='1 real payment records · Recorded total: $10.00 · 1 sandbox test records (excluded from revenue)';
  assert.equal(summary(),expected);
  const form=document.querySelector('#specialized form');assert.ok(form);
  timers[0]();await until(()=>reads===2&&!document.getElementById('refresh').disabled);
  assert.equal(summary(),expected);
  assert.equal(document.querySelector('#specialized form'),form);
 }finally{dom.window.close();Object.assign(globalThis,previous)}
});
