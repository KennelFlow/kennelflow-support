import test from 'node:test';
import assert from 'node:assert/strict';
import {checkVariation,auditSquarePlans} from './verify-square-production-plans.mjs';
const ids={monthly:'PLAN_MONTHLY_12345',annual:'PLAN_ANNUAL_12345'};
const env={
 SQUARE_ENVIRONMENT:'production',SQUARE_ACCESS_TOKEN:'test-only-not-live',
 SQUARE_LOCATION_ID:'LOC_TEST',KO_SQUARE_MONTHLY_VARIATION_ID:ids.monthly,
 KO_SQUARE_ANNUAL_VARIATION_ID:ids.annual
};
const make=(plan)=>({
 type:'SUBSCRIPTION_PLAN_VARIATION',id:ids[plan],present_at_all_locations:true,
 subscription_plan_variation_data:{phases:[{cadence:plan==='monthly'?'MONTHLY':'ANNUAL',
 pricing:{type:'STATIC',price:{amount:plan==='monthly'?1099:9999,currency:'USD'}}}]}
});
test('read-only audit validates both live catalog IDs against expected price and cadence',async()=>{
 const calls=[];
 const answer=await auditSquarePlans(env,async(u,o)=>{
  calls.push([u,o.method]);
  const plan=u.includes(ids.monthly)?'monthly':'annual';
  return Response.json({object:make(plan)});
 });
 assert.equal(answer.length,2);
 assert(answer.every(x=>x.valid));
 assert(calls.every(x=>x[1]==='GET'));
});
test('incorrect recurring price or cadence prevents a release',()=>{
 assert.throws(()=>checkVariation('annual',{...make('annual'),
 subscription_plan_variation_data:{phases:[{cadence:'MONTHLY',pricing:{type:'STATIC',price:{amount:1099,currency:'USD'}}}]}},'LOC_TEST'));
 assert.throws(()=>checkVariation('monthly',{...make('monthly'),
 subscription_plan_variation_data:{phases:[{cadence:'MONTHLY',pricing:{type:'STATIC',price:{amount:999,currency:'USD'}}}]}},'LOC_TEST'));
});
test('a disabled or multi-phase plan is not approved by this release gate',()=>{
 assert.throws(()=>checkVariation('monthly',{...make('monthly'),is_deleted:true},'LOC_TEST'));
 assert.throws(()=>checkVariation('monthly',{...make('monthly'),
 subscription_plan_variation_data:{phases:[make('monthly').subscription_plan_variation_data.phases[0],make('monthly').subscription_plan_variation_data.phases[0]]}},'LOC_TEST'));
});
test('no production token or plan ID prevents read-only audit',async()=>{
 await assert.rejects(auditSquarePlans({...env,KO_SQUARE_MONTHLY_VARIATION_ID:''},async()=>{throw Error('Should not call')}),/Missing/);
 await assert.rejects(auditSquarePlans({...env,SQUARE_ACCESS_TOKEN:''}),/Production/);
});
