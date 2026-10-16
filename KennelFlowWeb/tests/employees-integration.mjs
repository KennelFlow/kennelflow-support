// Explicit isolated-development target. Never uses production users or kennel data.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {createWebServer} from '../server.mjs';
const backend='https://br-bold-wildflower-b5gt68sx-kennelflowapi.compute.c-7.us-east-2.aws.neon.tech';
async function cloud(path,method='GET',data,token){const r=await fetch(backend+'/v2/'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});return {status:r.status,value:await r.json()}}
async function account(label){const email=`employee-test-${label.toLowerCase()}-${Date.now()}-${randomBytes(4).toString('hex')}@example.invalid`,password=randomBytes(24).toString('hex');assert.equal((await cloud('signup','POST',{email,password,name:label,kennelName:'Isolated employee test'})).status,201);const login=await cloud('login','POST',{email,password});assert.equal(login.status,200);const me=await cloud('me','GET',undefined,login.value.token);return {email,password,token:login.value.token,id:me.value.user.id,kennel:me.value.kennels[0].id}}
const owner=await account('Owner'),staff=await account('Worker'),other=await account('Outsider');
const server=createWebServer({backend,secure:false});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
function browser(){let cookie='';return async(path,method='GET',data)=>{const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,value:await r.json()}}}
try{
 const web=browser(),employee=browser(),second=browser();for(const client of [web,second])assert.equal((await client('login','POST',{email:owner.email,password:owner.password})).status,200);
 const root=`kennels/${owner.kennel}/`;
 const invite=await web(root+'invitations','POST',{email:staff.email,role:'staff'});assert.equal(invite.status,201);
 let pending=await web(root+'invitations');assert.equal(pending.status,200);assert.equal(pending.value.invitations.length,1);assert.equal(pending.value.invitations[0].token_hash,undefined);
 assert.equal((await employee('invitations/accept','POST',{token:invite.value.token,email:staff.email,password:staff.password,name:'Worker'})).status,200);
 assert.equal((await employee('invitations/accept','POST',{token:invite.value.token,email:staff.email,password:staff.password,name:'Worker'})).status,403);
 assert.equal((await employee('login','POST',{email:staff.email,password:staff.password})).status,200);
 assert.equal((await web(root+'members')).value.members.length,2);
 console.log('PASS web invitation acceptance, replay rejection and native membership agreement');
 const starts=await Promise.all([employee(root+'clock','POST',{action:'in',staffID:owner.id}),employee(root+'clock','POST',{action:'in'})]);assert.ok(starts.every(r=>r.status===200));assert.equal(starts[0].value.record.id,starts[1].value.record.id);const time=starts[0].value.record;assert.equal(time.data.record.staffID,staff.id);assert.equal(time.data.record.staffName,'Worker');
 const native=await cloud(root+'records','GET',undefined,staff.token);assert.equal(native.status,200);assert.ok(native.value.records.some(r=>r.id===time.id));
 const stopped=await employee(root+'clock','POST',{action:'out'});assert.equal(stopped.status,200);assert.ok(stopped.value.record.data.record.clockOut);assert.equal((await employee(root+'clock')).value.record,null);
 assert.ok((await second('records?kennel='+owner.kennel)).value.records.some(r=>r.id===time.id&&r.data.record.clockOut));
 console.log('PASS concurrent clock-in produces one shift, trusted attribution, clock-out and cross-session native record sync');
 const taskID=crypto.randomUUID();const payload={type:'tasks',expectedRevision:0,data:{platform:'ios',collection:'tasks',record:{id:taskID,title:'Clean kennel',completed:false,dueDate:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),category:'Cleaning',assignedTo:'Worker'}}};
 assert.equal((await cloud(root+'records/'+taskID,'PUT',payload,staff.token)).status,200);
 assert.equal((await cloud(root+'records/'+taskID,'PUT',{...payload,expectedRevision:1,data:{...payload.data,record:{...payload.data.record,completed:true}}},staff.token)).status,200);
 const history=await web(root+'history');assert.equal(history.status,200);assert.ok(history.value.events.some(e=>e.actor_id===staff.id&&e.action==='Completed'&&e.record_id===taskID));
 const own=await employee(root+'history');assert.ok(own.value.events.every(e=>e.actor_id===staff.id));
 assert.equal((await employee(root+'members')).status,403);assert.equal((await employee(root+'invitations','POST',{email:other.email,role:'admin'})).status,403);
 assert.equal((await employee(root+'records/'+time.id,'PUT',{type:'staffTimeEntries',expectedRevision:2,record:{...stopped.value.record.data.record,staffID:owner.id}})).status,403);
 assert.equal((await web(`kennels/${other.kennel}/history`)).status,403);
 console.log('PASS native work appears in automatic history; employee cannot forge hours, manage accounts or read another kennel');
 const cancel=await web(root+'invitations','POST',{email:other.email,role:'staff'});assert.equal(cancel.status,201,cancel.value.error);pending=await web(root+'invitations');assert.equal(pending.status,200,pending.value.error);const entry=pending.value.invitations.find(i=>i.email===other.email);assert.equal((await web(root+'invitations/'+entry.id,'DELETE')).status,200);assert.equal((await cloud('invitations/accept','POST',{token:cancel.value.token,email:other.email,password:other.password,name:'Outsider'})).status,403);
 assert.equal((await web(root+'members/'+staff.id,'PATCH',{role:'viewer',remove:false})).status,200);assert.equal((await employee(root+'clock','POST',{action:'in'})).status,401);
 assert.equal((await employee('login','POST',{email:staff.email,password:staff.password})).status,200);assert.equal((await employee(root+'clock','POST',{action:'in'})).status,403);
 assert.equal((await web(root+'members/'+staff.id,'PATCH',{role:'viewer',remove:true})).status,200);assert.equal((await cloud(root+'records','GET',undefined,staff.token)).status,401);
 console.log('PASS cancelled invitations, role changes, session invalidation and access removal');
 console.log('ALL LIVE EMPLOYEE DEVELOPMENT CHECKS PASSED');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
