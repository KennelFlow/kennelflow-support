// Read-only Square plan catalog audit for Kennel One. Never creates a charge.
// Usage (on an authorized server with production Square credentials):
//    node scripts/verify-square-production-plans.mjs
import {fileURLToPath} from 'node:url';
const prices={monthly:1099,annual:9999};
const cadences={monthly:'MONTHLY',annual:'ANNUAL'};
export function checkVariation(plan,variation,location){
 const expected=prices[plan];
 if(!expected)throw Error('Unknown Kennel One subscription plan');
 const p=variation?.subscription_plan_variation_data;
 if(variation?.type!=='SUBSCRIPTION_PLAN_VARIATION'||variation.is_deleted===true||!p)
   throw Error(plan+': catalog object is not an active subscription plan variation');
 const phases=p.phases||[];
 if(phases.length!==1)throw Error(plan+': requires exactly one paid recurring phase');
 const phase=phases[0];
 if(phase.cadence!==cadences[plan] || phase.pricing?.type!=='STATIC')
   throw Error(plan+': cadence or static-price configuration does not match');
 const amount=Number(phase.pricing?.price?.amount??phase.pricing?.price_money?.amount);
 const currency=phase.pricing?.price?.currency??phase.pricing?.price_money?.currency;
 if(amount!==expected||currency!=='USD')
   throw Error(plan+': Square price or currency does not match Kennel One billing');
 if(variation.present_at_all_locations!==true&&Array.isArray(variation.present_at_location_ids)
    &&!variation.present_at_location_ids.includes(location))
   throw Error(plan+': plan variation not offered at the configured location');
 return {plan,cadence:phase.cadence,amountCents:amount,currency,valid:true};
}
export async function auditSquarePlans(env=process.env,fetcher=fetch){
 const token=env.SQUARE_ACCESS_TOKEN,location=env.SQUARE_LOCATION_ID;
 if(env.SQUARE_ENVIRONMENT!=='production'||!token||!location)
   throw Error('Production Square token, location and environment required');
 const results=[];
 for(const [plan,key] of [['monthly','KO_SQUARE_MONTHLY_VARIATION_ID'],
                          ['annual','KO_SQUARE_ANNUAL_VARIATION_ID']]){
  const id=env[key];
  if(!id||!/^[A-Za-z0-9_-]{8,128}$/.test(id))
    throw Error('Missing valid '+plan+' subscription plan variation ID');
  const response=await fetcher('https://connect.squareup.com/v2/catalog/object/'+encodeURIComponent(id),{
   method:'GET',headers:{Authorization:'Bearer '+token,'Square-Version':'2026-09-16'},
   signal:AbortSignal.timeout(12000),redirect:'manual'
  });
  if(!response.ok)throw Error('Square catalog verification failed for '+plan+' ('+response.status+')');
  const data=await response.json();
  if(data.object?.id!==id)throw Error('Square returned mismatched '+plan+' plan ID');
  results.push(checkVariation(plan,data.object,location));
 }
 return results;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  const answer=await auditSquarePlans();
  for(const item of answer)console.log(item.plan+': verified '+item.cadence+' $'+(item.amountCents/100).toFixed(2)+' USD');
  console.log('Square recurring plan catalog verification PASSED (no payment created).');
 }catch(err){
  console.error('Square recurring plan catalog verification BLOCKED: '+err.message);
  process.exitCode=1;
 }
}
