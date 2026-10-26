import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function refreshSubscriptionBanner(){');
const end=source.indexOf('\nasync function load(',start);
assert(start>=0&&end>start,'Expected subscription banner implementation to be present');
const functionText=source.slice(start,end);

function display(status,role='owner'){
  const banner={hidden:true,children:[],replaceChildren(...items){this.children=items},
    append(...items){this.children.push(...items)}};
  const el=(tag,text,cls)=>({tag,text,cls,children:[],append(...items){this.children.push(...items)}});
  const button=(text,action)=>({tag:'button',text,action});
  const context={
    kennel:'00000000-0000-0000-0000-000000000911',role,
    $:key=>key==='subscriptionBanner'?banner:null,
    api:async()=>({status}),el,button,
    encodeURIComponent,Date,URL
  };
  const render=runInNewContext(functionText+'\nrefreshSubscriptionBanner',context);
  return render().then(()=>banner);
}
function flatten(node){
  const visit=n=>n?.children?[n,...n.children.flatMap(visit)]:[n];
  return node.children.flatMap(visit);
}
test('owners can upgrade during a 14-day trial, before it expires',async()=>{
  const banner=await display({active:true,state:'trial',plan:'trial',validThrough:'2026-11-08T12:00:00Z'});
  const values=flatten(banner).map(n=>n.text).filter(Boolean);
  assert(values.includes('Kennel One free trial active'));
  for(const label of ['$10.99 monthly','$99.99 yearly','$299.99 lifetime','Check payment and unlock access'])
    assert(values.includes(label),label+' unavailable during trial');
  assert(values.some(t=>t.includes('renew automatically until canceled')));
  assert.equal(banner.hidden,false);
});
test('unpaid owner can subscribe, existing paid owner cannot buy twice',async()=>{
  const unpaid=flatten(await display({active:false,state:'unpaid'})).map(n=>n.text);
  assert(unpaid.includes('Subscription needed'));
  assert(unpaid.includes('$10.99 monthly'));
  const paid=flatten(await display({active:true,state:'active',plan:'annual',provider:'windows'})).map(n=>n.text);
  assert(paid.includes('Kennel One subscription active'));
  assert(!paid.includes('$10.99 monthly'));
  assert(!paid.includes('Check payment and unlock access'));
});
test('employee sees status, not owner payment buttons',async()=>{
  const staff=flatten(await display({active:true,state:'trial',plan:'trial'},'staff')).map(n=>n.text);
  assert(staff.includes('Kennel One free trial active'));
  assert(!staff.includes('$10.99 monthly'));
});
test('existing Square subscriber can refresh paid-through access without another purchase',async()=>{
  const displayed=flatten(await display({active:true,state:'active',plan:'monthly',provider:'windows'})).map(n=>n.text);
  assert(displayed.includes('Refresh existing Square subscription'));
  assert(!displayed.includes('$10.99 monthly'));
  assert(!displayed.includes('Check payment and unlock access'));
});
test('non-owner cannot refresh billing and Apple subscriber sees no Square refresh',async()=>{
  const staff=flatten(await display({active:true,state:'active',plan:'monthly',provider:'windows'},'staff')).map(n=>n.text);
  assert(!staff.includes('Refresh existing Square subscription'));
  const apple=flatten(await display({active:true,state:'active',plan:'annual',provider:'apple'})).map(n=>n.text);
  assert(!apple.includes('Refresh existing Square subscription'));
});
