// Run this CLI ONLY with secured, local environment credentials.
// Does not print the private key, JWT, notification token, or signed Apple payload.
// Calls Apple's SANDBOX App Store Server API; never creates a charge or changes access.
import {AppStoreServerAPIClient,Environment} from '@apple/app-store-server-library';

const required=['APPLE_IAP_PRIVATE_KEY','APPLE_IAP_KEY_ID','APPLE_IAP_ISSUER_ID'];
const missing=required.filter(key=>!process.env[key]);
if(missing.length){
 console.error('Apple sandbox test not started; missing secure configuration:',missing.join(', '));
 process.exit(2);
}
const client=new AppStoreServerAPIClient(
 process.env.APPLE_IAP_PRIVATE_KEY.replace(/\\n/g,'\n'),
 process.env.APPLE_IAP_KEY_ID,
 process.env.APPLE_IAP_ISSUER_ID,
 'com.kennelflow.app',Environment.SANDBOX
);
try {
 const requested=await client.requestTestNotification();
 const token=requested?.testNotificationToken;
 if(typeof token!=='string'||!token){
  throw Error('Apple did not return a test notification token');
 }
 console.log('Apple accepted sandbox TEST notification request.');
 let found=false;
 for(let attempt=0;attempt<4;attempt++){
  if(attempt)await new Promise(resolve=>setTimeout(resolve,1500));
  let result;
  try {result=await client.getTestNotificationStatus(token)}
  catch(error){
   if(error.httpStatusCode===404){
    console.log('Apple test delivery status not ready.');
    continue;
   }
   throw error;
  }
  const sends=result?.sendAttempts||[];
  if(!sends.length){
   console.log('Apple delivery status has no attempts yet.');
   continue;
  }
  found=true;
  console.log(JSON.stringify({environment:'sandbox',attempts:sends.map(item=>({
   result:item.sendAttemptResult??'unknown',
   timestamp:item.attemptDate??null
  }))}));
  break;
 }
 if(!found){
  console.log('Apple sent the test request, but delivery has not yet been confirmed.');
  process.exitCode=3;
 }
}catch(error){
 console.error('Apple sandbox test failed',JSON.stringify({
  status:error.httpStatusCode??error.status??null,
  apiError:error.apiError??null,
  name:error.name??'Error'
 }));
 process.exitCode=1;
}
