import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {fixtures} from './fixtures.mjs';
const pause=()=>new Promise(r=>setTimeout(r,5));
async function until(check){for(let i=0;i<200;i++){if(check())return;await pause()}assert.fail('UI did not reach expected state')}
test('all forms, save, cross-device merge and session-expiry draft preservation',async()=>{
  const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://app.example.test/',pretendToBeVisual:true});
  const {window}=dom;globalThis.window=window;globalThis.document=window.document;globalThis.confirm=()=>true;
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true};window.HTMLDialogElement.prototype.close=function(){this.open=false};
  const timers=[],originalInterval=globalThis.setInterval;globalThis.setInterval=fn=>{timers.push(fn);return 1};
  const kennel=crypto.randomUUID(),user=crypto.randomUUID(),data=fixtures();
  const rows=new Map(Object.entries(data).map(([type,record])=>[record.id,{id:record.id,type,data:{platform:'ios',collection:type,record},revision:1,deleted_at:null,updated_at:'2026-10-15T12:00:00Z'}]));
  let expired=false,writes=0;
  const response=(status,value)=>Response.json(value,{status});
  globalThis.fetch=async(path,options={})=>{
    path=String(path);
    if(path==='/api/login'){expired=false;return response(200,{ok:true})}
    if(expired)return response(401,{error:'Sign in required'});
    if(path==='/api/me')return response(200,{user:{id:user,name:'Test owner',email:'test@example.invalid'},kennels:[{id:kennel,name:'Test kennel',role:'owner'}]});
    if(path.endsWith('/members'))return response(200,{members:[{id:user,name:'Test owner',email:'test@example.invalid',role:'owner'}]});
    if(path.startsWith('/api/records?'))return response(200,{records:[...rows.values()].map(r=>structuredClone(r)),nextCursor:null});
    if(options.method==='PUT'&&path.includes('/records/')){const input=JSON.parse(options.body),id=path.split('/').pop(),previous=rows.get(id);if((previous?.revision||0)!==input.expectedRevision)return response(409,{error:'Conflict'});const row={id,type:input.type,data:{platform:'ios',collection:input.type,record:input.record},revision:input.expectedRevision+1,deleted_at:input.deletedAt||null,updated_at:'2026-10-15T13:00:00Z'};rows.set(id,row);writes++;return response(200,{record:row})}
    return response(404,{error:'Not found'});
  };
  const $=id=>document.getElementById(id),clickText=(root,text)=>{const b=[...root.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(b,text);b.click()},input=(control,value)=>{control.value=value;control.dispatchEvent(new window.Event('input',{bubbles:true}))};
  try{
    await import('../app.js');await until(()=>$('connection').textContent.startsWith('Synced'));
    assert.equal($('workspace').hidden,false);assert.equal(document.querySelectorAll('.metric').length,18);
    const employeeMetric=[...document.querySelectorAll('.metric')].find(b=>b.querySelector('h3').textContent==='Employees');assert.equal(employeeMetric.querySelector('strong').textContent,'1');assert.match(employeeMetric.textContent,/Team members/);
    let checked=0;
    for(const nav of [...$('nav').querySelectorAll('button')].filter(b=>!['Overview','Employees'].includes(b.textContent))){
      const name=nav.textContent;clickText($('nav'),name);
      for(const option of [...$('collection').options]){
        $('collection').value=option.value;$('collection').dispatchEvent(new window.Event('change'));$('add').click();assert.ok($('editor').open,option.value);assert.ok($('fields').children.length>0,option.value);assert.ok($('fields').querySelector('input,select,textarea'),option.value);$('cancelEditor').click();checked++;
      }
    }
    assert.equal(checked,37);
    clickText($('nav'),'Dogs');clickText($('list'),'Edit');
    const original=rows.get(data.dogs.id);input($('fields').querySelector('[data-field="notes"]'),'Browser notes');
    rows.set(original.id,{...structuredClone(original),revision:2,data:{...original.data,record:{...original.data.record,name:'Native renamed dog'}}});
    $('refresh').click();await until(()=>!$('conflict').hidden);assert.equal($('fields').querySelector('[data-field="notes"]').value,'Browser notes');assert.ok($('save').disabled);
    clickText($('conflict'),'Apply reviewed changes');assert.equal($('fields').querySelector('[data-field="name"]').value,'Native renamed dog');assert.equal($('fields').querySelector('[data-field="notes"]').value,'Browser notes');
    $('recordForm').dispatchEvent(new window.Event('submit',{cancelable:true,bubbles:true}));await until(()=>!$('editor').open);assert.equal(writes,1);assert.equal(rows.get(original.id).data.record.notes,'Browser notes');assert.equal(rows.get(original.id).data.record.name,'Native renamed dog');
    await until(()=>$('refresh').disabled===false);clickText($('list'),'Edit');input($('fields').querySelector('[data-field="notes"]'),'Keep this draft');expired=true;$('refresh').click();await until(()=>$('reauth').open);assert.equal($('fields').querySelector('[data-field="notes"]').value,'Keep this draft');
    $('reauthPassword').value='test-password';$('reauthForm').dispatchEvent(new window.Event('submit',{cancelable:true,bubbles:true}));await until(()=>!$('reauth').open&&!$('refresh').disabled);assert.ok($('editor').open);assert.equal($('fields').querySelector('[data-field="notes"]').value,'Keep this draft');
    $('cancelEditor').click();
  }finally{globalThis.setInterval=originalInterval;dom.window.close()}
});
