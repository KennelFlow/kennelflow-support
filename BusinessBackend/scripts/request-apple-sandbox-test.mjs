// Secure local-only Apple sandbox notification test helper.
// Usage: APPLE_IAP_PRIVATE_KEY_FILE=/absolute/private/key.p8 APPLE_IAP_KEY_ID=...
//        APPLE_IAP_ISSUER_ID=... node scripts/request-apple-sandbox-test.mjs
// Rerun with --check to recheck Apple's delivery status without sending a new test.
// Nothing prints the private key, JWT, or Apple test notification token.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {AppStoreServerAPIClient,Environment} from '@apple/app-store-server-library';

process.umask(0o077);
const saved=join(homedir(),'.config/kennelone/credentials/apple/sandbox-test.json');
const checkOnly=process.argv.includes('--check');
const keyPath=process.env.APPLE_IAP_PRIVATE_KEY_FILE;
const key=keyPath?readFileSync(keyPath,'utf8'):process.env.APPLE_IAP_PRIVATE_KEY;
if(!key||!process.env.APPLE_IAP_KEY_ID||!process.env.APPLE_IAP_ISSUER_ID){
 console.error('Missing securely configured Apple signing key, key ID, or issuer ID.');
 process.exit(2);
}
const client=new AppStoreServerAPIClient(
 key.replace(/\\n/g,'\n'),
 process.env.APPLE_IAP_KEY_ID,process.env.APPLE_IAP_ISSUER_ID,
 'com.kennelflow.app',Environment.SANDBOX
);
try {
 let token;
 if(checkOnly){
  token=JSON.parse(readFileSync(saved,'utf8')).testNotificationToken;
  if(!token)throw Error('No saved Apple test token');
 }else{
  const response=await client.requestTestNotification();
  token=response?.testNotificationToken;
  if(!token)throw Error('Apple did not return a test token');
  mkdirSync(dirname(saved),{recursive:true,mode:0o700});
  writeFileSync(saved,JSON.stringify({
   testNotificationToken:token,requestedAt:new Date().toISOString()
  }),{mode:0o600});
  console.log('Apple accepted the official sandbox TEST request; private token saved locally.');
 }
 let verified=false;
 for(let attempt=0;attempt<8;attempt++){
  if(attempt)await new Promise(resolve=>setTimeout(resolve,2000));
  let result;
  try{result=await client.getTestNotificationStatus(token)}
  catch(error){
   if(error.httpStatusCode===404){continue}
   throw error;
  }
  const sends=result?.sendAttempts||[];
  if(!sends.length)continue;
  const statuses=sends.map(a=>a.sendAttemptResult||'UNKNOWN');
  verified=statuses.some(status=>status==='SUCCESS');
  console.log(JSON.stringify({sandbox:true,deliveredSuccessfully:verified,
   sendAttemptResults:statuses}));
  break;
 }
 if(!verified){
  console.log('Apple delivery is not confirmed. Run the same command with --check to retry.');
  process.exitCode=3;
 }
}catch(error){
 console.error(JSON.stringify({message:'Apple sandbox test not verified',
  status:error.httpStatusCode??error.status??null,
  apiError:error.apiError??null, name:error.name||'Error'}));
 process.exitCode=1;
}
