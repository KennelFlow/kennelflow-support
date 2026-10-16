import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createEmployees,hours} from '../employees.mjs';
test('hours split shifts over date boundaries and clip open entries to the selected period',()=>{
 const from=Date.parse('2026-10-15T00:00:00Z'),to=Date.parse('2026-10-16T00:00:00Z');
 assert.equal(hours({clockIn:'2026-10-14T23:00:00Z',clockOut:'2026-10-15T02:00:00Z'},from,to),2);
 assert.equal(hours({clockIn:'2026-10-15T23:00:00Z'},from,to,Date.parse('2026-10-16T02:00:00Z')),1);
 assert.equal(hours({clockIn:'broken'},from,to),0);
});
test('owner sees employee management, clock actions, history and preserves an unfinished invitation',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'https://kennel.example.test'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.confirm=()=>true;
 const host=document.getElementById('host'),kennel=crypto.randomUUID(),id=crypto.randomUUID(),employee=crypto.randomUUID(),calls=[];
 let role='owner',refreshes=0;const state=()=>({kennel,identity:{id,name:'Owner'},role,rows:new Map()});
 const api=async(path,options={})=>{calls.push({path,options});if(path.endsWith('/members'))return {members:[{id,name:'Owner',email:'owner@example.invalid',role:'owner'},{id:employee,name:'Worker',email:'worker@example.invalid',role:'staff'}]};if(path.endsWith('/invitations'))return {invitations:[]};if(path.endsWith('/clock'))return {record:null};return {events:[{actor_name:'Worker',action:'Completed',record_type:'tasks',title:'Clean kennel',created_at:new Date().toISOString(),revision:2}],nextCursor:null}};
 const ui=createEmployees({host,api,state,onMembers:()=>{},onError:e=>assert.fail(e.message),refresh:async()=>refreshes++,edit:()=>{},add:()=>{}});
 try{
  await ui.render();assert.match(host.textContent,/Add employee/);assert.match(host.textContent,/Worker/);assert.match(host.textContent,/Clean kennel/);
  const clock=[...host.querySelectorAll('button')].find(b=>b.textContent==='Clock in');clock.click();await new Promise(r=>setTimeout(r,5));assert.equal(refreshes,1);assert.equal(JSON.parse(calls.find(c=>c.options.method==='POST').options.body).action,'in');
  const input=host.querySelector('input[type=email]');input.value='unfinished@example.invalid';await ui.render(true);assert.equal(host.querySelector('input[type=email]').value,'unfinished@example.invalid');
  ui.reset();role='staff';await ui.render();assert.doesNotMatch(host.textContent,/Add employee|Team members|Remove access/);assert.match(host.textContent,/Clock in/);
  ui.reset();role='viewer';await ui.render();assert.doesNotMatch(host.textContent,/Clock in|Add employee/);
 }finally{dom.window.close()}
});
