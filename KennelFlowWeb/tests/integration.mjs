// Explicit development-only integration run. Never targets the production branch.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {createWebServer} from '../server.mjs';
import {fixtures,fixture} from './fixtures.mjs';
const backend='https://br-bold-wildflower-b5gt68sx-kennelflowapi.compute.c-7.us-east-2.aws.neon.tech';
async function cloud(path,method='GET',data,token){
  const r=await fetch(backend+path,{method,headers:{...(data!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
  const value=await r.json();return {status:r.status,value};
}
async function account(label){
  const email=`web-management-${label}-${Date.now()}-${randomBytes(4).toString('hex')}@example.invalid`,password=randomBytes(24).toString('hex');
  assert.equal((await cloud('/v2/signup','POST',{email,password,name:'Website integration test',kennelName:'Isolated web management test'})).status,201);
  const login=await cloud('/v2/login','POST',{email,password});assert.equal(login.status,200);const token=login.value.token;
  const me=await cloud('/v2/me','GET',undefined,token);assert.equal(me.status,200);
  return {email,password,token,kennel:me.value.kennels[0].id,user:me.value.user.id};
}
const owner=await account('owner');console.log('Created isolated development test account');
const server=createWebServer({backend,secure:false});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
function browser(){let cookie='';return async(path,method='GET',data,binary=false)=>{
  const r=await fetch(base+'/api/'+path,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(data!==undefined?{'Content-Type':binary?'application/octet-stream':'application/json'}:{})},body:data===undefined?undefined:binary?data:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
  const value=binary&&method==='GET'&&r.ok?await r.text():await r.json();return {status:r.status,value};
}}
try{
  const web=browser(),second=browser();for(const client of [web,second])assert.equal((await client('login','POST',{email:owner.email,password:owner.password})).status,200);
  const capabilities=await cloud('/v2/capabilities');assert.equal(capabilities.status,200);const supported=new Set(capabilities.value.collections);const records=Object.fromEntries(Object.entries(fixtures()).filter(([type])=>supported.has(type)));const queue=Object.entries(records);const supportedCount=queue.length;const unavailable=['maintenanceRecords','ofaXrays','clinics','vetServices','employeeProfiles','messages','locations','pedigreeAncestors','pedigreeScans'].filter(type=>!supported.has(type));if(unavailable.length)console.log('DEPLOYMENT GAP: '+unavailable.join(', '));
  await Promise.all(Array.from({length:5},async()=>{while(queue.length){const [type,record]=queue.shift();const r=await web(`kennels/${owner.kennel}/records/${record.id}`,'PUT',{type,record,expectedRevision:0});assert.equal(r.status,200,type+': '+JSON.stringify(r.value));assert.equal(r.value.record.revision,1)}}));
  console.log('PASS live creation and acknowledgement for '+supportedCount+' supported collections');
  const listing=await second('records?kennel='+owner.kennel);assert.equal(listing.status,200);assert.equal(listing.value.records.length,Object.keys(records).length);
  for(const [type,record] of Object.entries(records)){const found=listing.value.records.find(r=>r.id===record.id);assert.equal(found.type,type);assert.deepEqual(found.data.record,record)}
  console.log('PASS separate session reads all persisted website records');
  const dog=records.dogs,path=`kennels/${owner.kennel}/records/${dog.id}`;
  const native={type:'dogs',expectedRevision:1,data:{platform:'ios',collection:'dogs',record:{...dog,notes:'Native app changed this'}}};
  assert.equal((await cloud('/v2/'+path,'PUT',native,owner.token)).status,200);
  assert.equal((await web(path,'PUT',{type:'dogs',expectedRevision:1,record:{...dog,notes:'Stale browser change'}})).status,409);
  const afterConflict=await second('records?kennel='+owner.kennel);assert.equal(afterConflict.value.records.find(r=>r.id===dog.id).data.record.notes,'Native app changed this');
  const merged={...dog,name:'Website saved after refresh',notes:'Native app changed this'};
  assert.equal((await web(path,'PUT',{type:'dogs',expectedRevision:2,record:merged})).status,200);
  const nativeRead=await cloud('/v2/kennels/'+owner.kennel+'/records','GET',undefined,owner.token);assert.deepEqual(nativeRead.value.records.find(r=>r.id===dog.id).data.record,merged);
  console.log('PASS native-to-web and web-to-native API round trip; stale edit rejected');
  assert.equal((await web(path,'PUT',{type:'dogs',expectedRevision:3,record:merged,deletedAt:new Date().toISOString()})).status,200);
  assert.ok((await second('records?kennel='+owner.kennel)).value.records.find(r=>r.id===dog.id).deleted_at);
  assert.equal((await web(path,'PUT',{type:'dogs',expectedRevision:4,record:merged})).status,200);
  assert.equal((await second('records?kennel='+owner.kennel)).value.records.find(r=>r.id===dog.id).deleted_at,null);
  console.log('PASS live soft delete and restore observed by second device session');
  const filePath=`kennels/${owner.kennel}/files/${records.documents.id}`,bytes='KennelFlow document integrity integration test';
  assert.equal((await web(filePath,'PUT',bytes,true)).status,200);assert.equal((await second(filePath,'GET',undefined,true)).value,bytes);
  assert.equal((await web(filePath,'PUT','different file',true)).status,409);
  console.log('PASS live document upload, checksum-verified download and replacement conflict');
  const stranger=await account('stranger'),outsider=browser();assert.equal((await outsider('login','POST',{email:stranger.email,password:stranger.password})).status,200);assert.equal((await outsider('records?kennel='+owner.kennel)).status,403);assert.equal((await outsider(path,'PUT',{type:'dogs',expectedRevision:5,record:merged})).status,403);
  console.log('PASS actual cloud account isolation');
  const invitation=await cloud(`/v2/kennels/${owner.kennel}/invitations`,'POST',{email:stranger.email,role:'staff'},owner.token);assert.equal(invitation.status,201);
  assert.equal((await cloud('/v2/invitations/accept','POST',{token:invitation.value.token,email:stranger.email,password:stranger.password,name:'Test staff'})).status,200);
  assert.equal((await outsider(path,'PUT',{type:'dogs',expectedRevision:5,record:merged})).status,403);
  const task=fixture('KennelTask');assert.equal((await outsider(`kennels/${owner.kennel}/records/${task.id}`,'PUT',{type:'tasks',expectedRevision:0,record:task})).status,200);
  assert.equal((await outsider(filePath,'GET',undefined,true)).status,403);
  const restricted=await outsider('records?kennel='+owner.kennel);assert.equal(restricted.status,200);assert.ok(!restricted.value.records.some(r=>r.type==='payments'||r.type==='clients'||r.type==='contracts'));
  console.log('PASS actual staff write restrictions and private-record filtering');
  for(const type of ['maintenanceRecords','ofaXrays','clinics','vetServices','employeeProfiles','messages','locations','pedigreeAncestors','pedigreeScans']){
    const original=records[type];
    const updated={...original,notes:'Edited through cloud website'};
    const key=type==='messages'?'body':type==='locations'?'staffName':'recognizedText';
    if(!Object.hasOwn(original,'notes'))updated[key]='Edited through cloud website';
    const result=await second(`kennels/${owner.kennel}/records/${original.id}`,'PUT',{type,expectedRevision:1,record:updated});
    assert.equal(result.status,200,type+JSON.stringify(result.value));
    const check=await cloud('/v2/kennels/'+owner.kennel+'/records','GET',undefined,owner.token);
    assert.deepEqual(check.value.records.find(r=>r.id===original.id).data.record,updated,type);
  }
  console.log('PASS website editing and Business API read-back for nine new record types');
  const maintenance=records.maintenanceRecords;
  const attachedName=records.documents.id+'.txt';
  const linked={...maintenance,attachments:[attachedName]};
  assert.equal((await web(`kennels/${owner.kennel}/records/${maintenance.id}`,'PUT',{type:'maintenanceRecords',expectedRevision:2,record:linked})).status,200);
  const linkedCheck=await cloud('/v2/kennels/'+owner.kennel+'/records','GET',undefined,owner.token);
  assert.deepEqual(linkedCheck.value.records.find(r=>r.id===maintenance.id).data.record.attachments,[attachedName]);
  const fileRead=await second(filePath,'GET',undefined,true);
  assert.equal(fileRead.status,200);assert.equal(fileRead.value,bytes);
  console.log('PASS maintenance attachment reference survives edit, and linked document bytes round-trip');
  await web('logout','POST',{});assert.equal((await web('me')).status,401);
  console.log('PASS logout invalidates browser session');
  if(process.env.KF_NATIVE_TEST_OUTPUT)await writeFile(process.env.KF_NATIVE_TEST_OUTPUT,JSON.stringify({backend,token:owner.token,kennel:owner.kennel,dog:dog.id,email:owner.email,password:owner.password}),{mode:0o600});
  console.log('ALL LIVE DEVELOPMENT INTEGRATION CHECKS PASSED');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
