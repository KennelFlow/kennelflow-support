import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAPI, hashPassword, verifyPassword } from '../api.mjs';
import { canManage, canRead, canWrite, validateRecord } from '../policy.mjs';
const owner='00000000-0000-0000-0000-000000000001',staff='00000000-0000-0000-0000-000000000002',kennel='00000000-0000-0000-0000-000000000003',other='00000000-0000-0000-0000-000000000004',id='00000000-0000-0000-0000-000000000005';
function fixture(role='staff') {
 const state={writes:[],invites:[],changes:[],records:[],members:[{id:owner,role:'owner'},{id:staff,role:'staff'}],limit:true};
 const repo={allowLogin:async()=>state.limit,session:async()=>({id:staff,email:'staff@example.com',name:'Employee'}),kennels:async()=>[{id:kennel,name:'One',role}],members:async()=>state.members,records:async()=>state.records,putRecord:async(_a,_k,id,input)=>{state.writes.push(input);return {id,revision:input.expectedRevision+1}},invite:async(...args)=>state.invites.push(args),changeMember:async(...args)=>state.changes.push(args)};
 const api=createAPI(repo);const call=(path,method='GET',input)=>api.fetch(new Request('https://example.com'+path,{method,headers:{authorization:'Bearer '+'a'.repeat(64),'content-type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)}));return {state,repo,call};
}
const record=(type='tasks',revision=0)=>({type,expectedRevision:revision,data:{platform:'ios',collection:type,record:{id,title:'Care'}}});
test('passwords use salted hashes and reject wrong passwords',async()=>{const hash=await hashPassword('a sufficiently long password');assert.notEqual(hash,await hashPassword('a sufficiently long password'));assert.equal(await verifyPassword('a sufficiently long password',hash),true);assert.equal(await verifyPassword('wrong password',hash),false)});
test('employees cannot read financial or customer records',()=>{for(const type of ['expenses','payments','customers','clients','contracts','documents'])assert.equal(canRead('staff',type),false)});
test('viewers cannot write any collection',()=>{for(const type of ['dogs','tasks','healthRecords','expenses'])assert.equal(canWrite('viewer',type),false)});
test('staff cannot manage memberships or invite accounts',async()=>{const f=fixture();assert.equal((await f.call(`/v2/kennels/${kennel}/invitations`,'POST',{email:'x@example.com',role:'staff'})).status,403);assert.equal((await f.call(`/v2/kennels/${kennel}/members`)).status,403);assert.equal(f.state.invites.length,0)});
test('admin cannot promote employees to admin or alter owner',async()=>{const f=fixture('admin');assert.equal((await f.call(`/v2/kennels/${kennel}/members/${staff}`,'PATCH',{role:'admin',remove:false})).status,403);assert.equal((await f.call(`/v2/kennels/${kennel}/members/${owner}`,'PATCH',{role:'staff',remove:true})).status,403);assert.equal(f.state.changes.length,0)});
test('owner can invite admin with a random expiring invitation',async()=>{const f=fixture('owner');const r=await f.call(`/v2/kennels/${kennel}/invitations`,'POST',{email:'a@example.com',role:'admin'});assert.equal(r.status,201);const body=await r.json();assert.match(body.token,/^[a-f0-9]{64}$/);assert.equal(body.expiresInSeconds,172800);assert.notEqual(f.state.invites[0].at(-1),body.token)});
test('cross-kennel reads and writes denied',async()=>{const f=fixture('owner');assert.equal((await f.call(`/v2/kennels/${other}/records`)).status,403);assert.equal((await f.call(`/v2/kennels/${other}/records/${id}`,'PUT',record())).status,403);assert.equal(f.state.writes.length,0)});
test('financial writes denied to staff at the API boundary',async()=>{const f=fixture();assert.equal((await f.call(`/v2/kennels/${kennel}/records/${id}`,'PUT',record('expenses'))).status,403);assert.equal(f.state.writes.length,0)});
test('staff may update care duties with an expected revision',async()=>{const f=fixture();const r=await f.call(`/v2/kennels/${kennel}/records/${id}`,'PUT',record('tasks',3));assert.equal(r.status,200);assert.equal(f.state.writes[0].expectedRevision,3)});
test('employees cannot attribute care to another employee',async()=>{const f=fixture();const input=record('kennelCareSessions');input.data.record.staffID=owner;assert.equal((await f.call(`/v2/kennels/${kennel}/records/${id}`,'PUT',input)).status,403)});
test('employee names are assigned from verified account',async()=>{const f=fixture();const input=record('kennelCareSessions');input.data.record.staffID=staff;input.data.record.staffName='Owner';assert.equal((await f.call(`/v2/kennels/${kennel}/records/${id}`,'PUT',input)).status,200);assert.equal(f.state.writes[0].data.record.staffName,'Employee')});
test('employee sees only own personal care history',async()=>{const f=fixture();f.state.records=[{id,type:'kennelCareSessions',data:{record:{staffID:owner}}}];const r=await f.call(`/v2/kennels/${kennel}/records`);assert.deepEqual((await r.json()).records,[])});
test('missing or revoked sessions cannot access data',async()=>{const f=fixture();f.repo.session=async()=>null;assert.equal((await f.call('/v2/me')).status,401)});
test('record identity mismatch and malformed revisions rejected',async()=>{const f=fixture();const input=record();input.data.record.id=owner;assert.equal((await f.call(`/v2/kennels/${kennel}/records/${id}`,'PUT',input)).status,400);assert.equal(validateRecord({...record(),expectedRevision:-1},id),false)});
test('revision conflict is returned for explicit resolution',async()=>{const f=fixture();f.repo.putRecord=async()=>{throw Object.assign(Error(),{code:'40001'})};assert.equal((await f.call(`/v2/kennels/${kennel}/records/${id}`,'PUT',record())).status,409)});
test('invalid pagination cursor rejected',async()=>{const f=fixture();assert.equal((await f.call(`/v2/kennels/${kennel}/records?cursor=broken`)).status,400)});
test('unknown roles and collections fail closed',()=>{assert.equal(canRead('unknown','dogs'),false);assert.equal(canWrite('owner','staff'),false);assert.equal(canManage('admin','admin','staff'),false);assert.equal(canManage('owner','owner','staff'),false)});

test('staff cannot fetch or upload attachments',async()=>{const f=fixture();assert.equal((await f.call(`/v2/kennels/${kennel}/files/${id}`)).status,403);assert.equal((await f.call(`/v2/kennels/${kennel}/files/${id}`,'PUT',{})).status,403)});
test('file checksum mismatch rejected before persistence',async()=>{const f=fixture('owner');assert.equal((await f.call(`/v2/kennels/${kennel}/files/${id}`,'PUT',{})).status,400)});


test('new professional records are available only to Business owners and admins',async()=>{
 const types=['maintenanceRecords','ofaXrays','clinics','vetServices','employeeProfiles','messages','locations','pedigreeAncestors','pedigreeScans'];
 for(const type of types){
  assert.equal(canRead('owner',type),true,type);assert.equal(canWrite('admin',type),true,type);
  assert.equal(canRead('staff',type),false,type);assert.equal(canWrite('staff',type),false,type);
  const f=fixture('owner'),input=record(type);if(type==='maintenanceRecords')input.data.record.kennelID=kennel;
  assert.equal((await f.call(`/v2/kennels/${kennel}/records/${id}`,'PUT',input)).status,200,type);
  const limited=fixture('staff');assert.equal((await limited.call(`/v2/kennels/${kennel}/records/${id}`,'PUT',input)).status,403,type);
 }
});
