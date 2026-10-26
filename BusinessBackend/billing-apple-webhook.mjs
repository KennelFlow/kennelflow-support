// App Store Server Notifications V2. Trust only Apple's verified JWS and current
// App Store Server API state; never grant access based on a notification body alone.
// Unknown purchases remain unlinked until the owner submits verified StoreKit proof.
const PRODUCTS=Object.freeze({
 'com.kennelflow.app.subscription.monthly':'monthly',
 'com.kennelflow.app.subscription.yearly':'annual',
 'com.kennelflow.app.lifetime':'lifetime'
});
const APP_BUNDLE='com.kennelflow.app';
const error=(message,status=403)=>Object.assign(new Error(message),{status});
const milliseconds=v=>Number.isFinite(Number(v))?Number(v):NaN;
const future=(date,now)=>Number.isFinite(date)&&date>now;
function validateTransaction(tx,expectedOriginal) {
 if(!tx||tx.bundleId!==APP_BUNDLE||!PRODUCTS[tx.productId]||
  !/^[0-9]{6,40}$/.test(String(tx.originalTransactionId||''))||
  (expectedOriginal&&String(tx.originalTransactionId)!==expectedOriginal))
  throw error('Apple transaction does not match Kennel One');
 return String(tx.originalTransactionId);
}
export function currentAppleEntitlement(tx,status,graceEnds=null,now=Date.now()) {
 validateTransaction(tx);
 const plan=PRODUCTS[tx.productId],expiry=milliseconds(tx.expiresDate);
 if(tx.revocationDate!=null||status===5)
  return {plan,state:'revoked',validThrough:new Date(now).toISOString()};
 if(plan==='lifetime')return {plan,state:'active',validThrough:null};
 const grace=milliseconds(graceEnds);
 if(status===4&&future(grace,now))
  return {plan,state:'grace',validThrough:new Date(grace).toISOString()};
 if(status===1&&future(expiry,now))
  return {plan,state:'active',validThrough:new Date(expiry).toISOString()};
 return {plan,state:'expired',validThrough:new Date(Number.isFinite(expiry)?expiry:now).toISOString()};
}
async function configuredVerifier(env,environment) {
 if(!env.APPLE_ROOT_CERTS_BASE64||!env.APPLE_APP_ID)
  throw error('Apple notification verification is not configured',503);
 const {SignedDataVerifier,Environment}=await import('@apple/app-store-server-library');
 const roots=env.APPLE_ROOT_CERTS_BASE64.split(',').map(s=>Buffer.from(s.trim(),'base64')).filter(x=>x.length>100);
 if(!roots.length||!Number.isSafeInteger(Number(env.APPLE_APP_ID)))
  throw error('Apple verification certificate configuration invalid',503);
 const target=environment==='sandbox'?Environment.SANDBOX:Environment.PRODUCTION;
 return new SignedDataVerifier(roots,true,target,APP_BUNDLE,
  target===Environment.PRODUCTION?Number(env.APPLE_APP_ID):undefined);
}
async function configuredClient(env,environment) {
 if(!env.APPLE_IAP_PRIVATE_KEY||!env.APPLE_IAP_KEY_ID||!env.APPLE_IAP_ISSUER_ID)
  throw error('Apple server API credentials are not configured',503);
 const {AppStoreServerAPIClient,Environment}=await import('@apple/app-store-server-library');
 return new AppStoreServerAPIClient(env.APPLE_IAP_PRIVATE_KEY.replace(/\\n/g,'\n'),
  env.APPLE_IAP_KEY_ID,env.APPLE_IAP_ISSUER_ID,APP_BUNDLE,
  environment==='sandbox'?Environment.SANDBOX:Environment.PRODUCTION);
}
export async function verifyAppleNotification(signedPayload,{
 env=process.env,environment='production',verifier,client,now=Date.now()
}={}) {
 if(!['production','sandbox'].includes(environment)||typeof signedPayload!=='string'||
  signedPayload.length<20||signedPayload.length>131072)
  throw error('Invalid Apple notification request',400);
 verifier??=await configuredVerifier(env,environment);
 let notification;
 try {notification=await verifier.verifyAndDecodeNotification(signedPayload)}
 catch {throw error('Apple notification signature verification failed')}
 if(notification.notificationType==='TEST')
  return {ignored:true,test:true};
 const eventId=notification.notificationUUID;
 if(typeof eventId!=='string'||eventId.length<8||eventId.length>128)
  throw error('Apple notification identifier missing',400);
 if(notification.data?.bundleId!==APP_BUNDLE||
  (environment==='production'&&Number(notification.data?.appAppleId)!==Number(env.APPLE_APP_ID||6809212861))||
  notification.data?.environment?.toLowerCase()!==environment)
  throw error('Notification app/environment mismatch');
 const jws=notification.data?.signedTransactionInfo;
 if(typeof jws!=='string'||jws.length<20)
  return {ignored:true,eventId};
 let original;
 let submitted;
 try {submitted=await verifier.verifyAndDecodeTransaction(jws);original=validateTransaction(submitted)}
 catch {throw error('Apple signed transaction verification failed')}
 client??=await configuredClient(env,environment);
 let tx,status,graceEnd=null;
 try {
  if(PRODUCTS[submitted.productId]==='lifetime') {
   const result=await client.getTransactionInfo(String(submitted.transactionId));
   tx=await verifier.verifyAndDecodeTransaction(result.signedTransactionInfo);
   validateTransaction(tx,original);
   status=tx.revocationDate!=null?5:1;
  } else {
   const response=await client.getAllSubscriptionStatuses(original);
   if(response.bundleId!==APP_BUNDLE)throw error('Apple subscription bundle mismatch');
   const candidates=(response.data||[]).flatMap(g=>g.lastTransactions||[])
    .filter(item=>String(item.originalTransactionId)===original&&item.signedTransactionInfo);
   const verified=[];
   for(const item of candidates){
    const t=await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
    validateTransaction(t,original);
    if(t.productId!==submitted.productId && !PRODUCTS[t.productId])continue;
    verified.push({transaction:t,status:item.status,renewal:item.signedRenewalInfo});
   }
   if(!verified.length)throw error('No current Apple subscription status');
   verified.sort((a,b)=>milliseconds(b.transaction.signedDate||b.transaction.purchaseDate)-
     milliseconds(a.transaction.signedDate||a.transaction.purchaseDate));
   ({transaction:tx,status}=verified[0]);
   if(status===4&&verified[0].renewal) {
    const renewal=await verifier.verifyAndDecodeRenewalInfo(verified[0].renewal);
    graceEnd=renewal.gracePeriodExpiresDate??null;
   }
  }
 } catch(e){
  if(e.status===403)throw e;
  throw error('Apple current purchase status unavailable',503);
 }
 let outcome=currentAppleEntitlement(tx,status,graceEnd,now);
 if(tx.revocationDate!=null&&notification.notificationType==='REFUND')
  outcome={...outcome,state:'refunded'};
 const signedTime=milliseconds(notification.signedDate);
 return {eventId,providerPurchaseId:original,...outcome,
  verifiedAt:new Date(now).toISOString(),
  signedAt:new Date(Number.isFinite(signedTime)?signedTime:now).toISOString()};
}
