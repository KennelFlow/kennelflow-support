import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {fixture} from './fixtures.mjs';
import {dayKey} from '../workflows.mjs';
test('duty completion, category rename, calendar recurrence and recoverable document replacement work through the UI',async()=>{
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://kennel.example.test/',pretendToBeVisual:true});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;globalThis.confirm=()=>true;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
 const oldFetch=globalThis.fetch,oldInterval=globalThis.setInterval;globalThis.setInterval=()=>1;
 const kennel=crypto.randomUUID(),user=crypto.randomUUID(),rows=new Map(),writes=[],files=new Map();
 const put=(type,record)=>{rows.set(record.id,{id:record.id,type,revision:1,data:{platform:'ios',collection:type,record},updated_at:new Date().toISOString(),deleted_at:null});return record};
 const shift=put('dailyDutyShifts',{id:crypto.randomUUID(),name:'Morning',systemName:'Morning'}),template=put('dailyDutyTemplates',{id:crypto.randomUUID(),title:'Change water',shift:'Morning'});
 const event=put('calendarEvents',{...fixture('KennelCalendarEvent'),title:'Weekly inspection',startDate:new Date().toISOString().replace(/\.\d{3}Z/,'Z'),recurrence:'Weekly'});
 const documentRecord=put('documents',{...fixture('DocumentRecord'),title:'Original attachment',fileName:'original.pdf'});files.set(documentRecord.id,'original file');
 globalThis.fetch=async(path,options={})=>{
  if(path==='/api/me')return Response.json({user:{id:user,name:'Owner'},kennels:[{id:kennel,name:'Test kennel',role:'owner'}]});
  if(path.startsWith('/api/records?'))return Response.json({records:[...rows.values()],nextCursor:null});
  if(path.endsWith('/members'))return Response.json({members:[]});
  if(options.method==='PUT'&&path.includes('/records/')){const value=JSON.parse(options.body),id=path.split('/').at(-1),previous=rows.get(id);if((previous?.revision||0)!==value.expectedRevision)return Response.json({error:'Conflict'},{status:409});const row={id,type:value.type,revision:value.expectedRevision+1,data:{platform:'ios',collection:value.type,record:value.record},updated_at:new Date().toISOString(),deleted_at:value.deletedAt||null};rows.set(id,row);writes.push(row);return Response.json({record:row})}
  if(options.method==='PUT'&&path.includes('/files/')){const id=path.split('/').at(-1);assert.ok(rows.has(id));files.set(id,'new file');return Response.json({ok:true})}
  return Response.json({error:'Unused route'},{status:503});
 };
 const $=id=>document.getElementById(id),wait=async check=>{for(let i=0;i<500;i++){if(check())return;await new Promise(r=>setTimeout(r,5))}assert.fail('UI timeout: '+$('error').textContent+' '+$('editError').textContent)},click=(root,name)=>{const button=[...root.querySelectorAll('button')].find(b=>b.textContent===name);assert.ok(button,name);button.click()};
 const section=name=>click($('nav'),name),collection=type=>{$('collection').value=type;$('collection').dispatchEvent(new dom.window.Event('change'))},submit=()=>{$('recordForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))};
 try{
  await import('../app.js?workflow-ui-test');await wait(()=>$('connection').textContent.startsWith('Synced'));
  section('Daily Duties');collection('dailyDutyRecords');assert.match($('specialized').textContent,/Change water/);click($('specialized'),'Complete');await wait(()=>[...rows.values()].some(r=>r.type==='dailyDutyRecords'));
  await wait(()=>!$('refresh').disabled);const completed=[...rows.values()].find(r=>r.type==='dailyDutyRecords');assert.equal(completed.data.record.completed,true);assert.equal(completed.data.record.dateKey,dayKey());
  collection('dailyDutyShifts');click($('list'),'Edit');const name=$('fields').querySelector('[data-field="name"]');name.value='Early shift';name.dispatchEvent(new dom.window.Event('input'));submit();await wait(()=>!$('editor').open);
  assert.equal(rows.get(template.id).data.record.shift,'Early shift');assert.equal(rows.get(completed.id).data.record.shift,'Early shift');assert.equal(rows.get(shift.id).data.record.name,'Early shift');
  section('Calendar');assert.match($('calendar').textContent,/Tap a date/);const today=dayKey(),day=[...$('calendar').querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith(today));assert.ok(day);day.click();assert.equal([...$('calendar').querySelectorAll('h3')].filter(h=>h.textContent==='Daily Duties').length,1);click($('calendar'),'Complete');await wait(()=>rows.get(event.id).data.record.completedAt);await wait(()=>[...rows.values()].filter(r=>r.type==='calendarEvents').length===2);const next=[...rows.values()].find(r=>r.type==='calendarEvents'&&r.id!==event.id);assert.equal(rows.get(event.id).data.record.nextOccurrenceID,next.id);
  await wait(()=>!$('refresh').disabled);section('Photos & Documents');collection('documents');click($('list'),'Replace file');assert.equal($('editor').open,true);Object.defineProperty($('upload'),'files',{value:[{name:'replacement.pdf',size:10}],configurable:true});submit();await wait(()=>!$('editor').open);
  const replacement=[...rows.values()].find(r=>r.type==='documents'&&r.id!==documentRecord.id);assert.ok(replacement);assert.ok(rows.get(documentRecord.id).deleted_at);assert.equal(files.get(documentRecord.id),'original file');assert.equal(files.get(replacement.id),'new file');assert.notEqual(replacement.data.record.fileName,documentRecord.fileName);
 }finally{globalThis.fetch=oldFetch;globalThis.setInterval=oldInterval;dom.window.close()}
});
