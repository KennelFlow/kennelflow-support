// Kennel One subscription verification. Nothing in this module accepts client-reported
// "paid" flags. Each purchase must be confirmed with the issuing store.
import {createHash} from 'node:crypto';

const APPLE_PRODUCTS = Object.freeze({
  'com.kennelflow.app.subscription.monthly':'monthly',
  'com.kennelflow.app.subscription.yearly':'annual',
  'com.kennelflow.app.lifetime':'lifetime'
});
const GOOGLE_PRODUCTS = Object.freeze({
  'kennelone_monthly':'monthly',
  'kennelone_yearly':'annual'
});
const dateAfterNow = (value, now=Date.now()) => Number.isFinite(Date.parse(value)) && Date.parse(value)>now;

export function normalizeGooglePurchase(receipt, token, now=Date.now(), catalog=GOOGLE_PRODUCTS) {
  if(!receipt || !Array.isArray(receipt.lineItems) || !/^[A-Za-z0-9._~-]{12,4096}$/.test(token||''))
    throw Object.assign(Error('Invalid Google purchase data'),{status:400});
  const state=receipt.subscriptionState;
  const allowed=state==='SUBSCRIPTION_STATE_ACTIVE'||state==='SUBSCRIPTION_STATE_CANCELED'||state==='SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
  const item=receipt.lineItems.filter(row=>catalog[row.productId] && dateAfterNow(row.expiryTime,now))
   .sort((a,b)=>Date.parse(b.expiryTime)-Date.parse(a.expiryTime))[0];
  if(!item || !allowed)throw Object.assign(Error('No active Google subscription'),{status:403});
  return {
   provider:'google',
   providerPurchaseId:createHash('sha256').update(token).digest('hex'),
   plan:catalog[item.productId],
   state:state==='SUBSCRIPTION_STATE_IN_GRACE_PERIOD'?'grace':'active',
   validThrough:new Date(item.expiryTime).toISOString()
  };
}

export function normalizeAppleTransaction(tx, status, now=Date.now(), graceExpiresDate=null) {
  const plan=APPLE_PRODUCTS[tx?.productId];
  if(!plan || !/^\d{1,40}$/.test(String(tx?.originalTransactionId||'')))
    throw Object.assign(Error('Unknown Apple purchase'),{status:403});
  if(tx.revocationDate != null)throw Object.assign(Error('Revoked Apple purchase'),{status:403});
  if(plan==='lifetime')return {provider:'apple',providerPurchaseId:String(tx.originalTransactionId),plan:'lifetime',
     state:'active',validThrough:null};
  const expiry=Number(tx.expiresDate);
  const graceExpiry=Number(graceExpiresDate);
  const entitledUntil=status===4 ? graceExpiry : expiry;
  if(![1,4].includes(status)||!Number.isFinite(entitledUntil)||entitledUntil<=now)
    throw Object.assign(Error('Apple subscription inactive'),{status:403});
  return {provider:'apple',providerPurchaseId:String(tx.originalTransactionId),plan,
    state:status===4?'grace':'active',validThrough:new Date(entitledUntil).toISOString()};
}

export async function verifyGooglePurchase(token, env=process.env, dependencies={}) {
  if(typeof token!=='string'||token.length>4096||token.length<12)
    throw Object.assign(Error('Invalid Google purchase token'),{status:400});
  const packageName=env.GOOGLE_PLAY_PACKAGE_NAME||'app.kennelone';
  if(packageName!=='app.kennelone')throw Object.assign(Error('Wrong Android package'),{status:503});
  let fetcher=dependencies.fetcher;
  if(!fetcher) {
    if(!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON)
      throw Object.assign(Error('Google Play verification is not configured'),{status:503});
    const {GoogleAuth}=await import('google-auth-library');
    const auth=new GoogleAuth({credentials:JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON),
      scopes:['https://www.googleapis.com/auth/androidpublisher']});
    const client=await auth.getClient();
    fetcher=async u=>{const {data}=await client.request({url:u,method:'GET'});return data};
  }
  const url='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+encodeURIComponent(packageName)+
    '/purchases/subscriptionsv2/tokens/'+encodeURIComponent(token);
  const receipt=await fetcher(url);
  return normalizeGooglePurchase(receipt,token);
}

function appleConfig(env) {
  if(!env.APPLE_IAP_PRIVATE_KEY||!env.APPLE_IAP_KEY_ID||!env.APPLE_IAP_ISSUER_ID||
   !env.APPLE_APP_ID||!env.APPLE_ROOT_CERTS_BASE64)
   throw Object.assign(Error('Apple server verification is not configured'),{status:503});
  const appId=Number(env.APPLE_APP_ID);
  if(!Number.isSafeInteger(appId)||appId<=0)throw Object.assign(Error('Invalid Apple app ID'),{status:503});
  const roots=env.APPLE_ROOT_CERTS_BASE64.split(',').map(s=>Buffer.from(s.trim(),'base64')).filter(b=>b.length>100);
  if(!roots.length)throw Object.assign(Error('Apple root certificates missing'),{status:503});
  return {appId,roots};
}
export async function verifyApplePurchase(jws,env=process.env,dependencies={}) {
  if(typeof jws!=='string'||jws.length>30000||jws.length<20)
    throw Object.assign(Error('Invalid Apple signed transaction'),{status:400});
  let verifier=dependencies.verifier,client=dependencies.client;
  if(!verifier||!client){
    const cfg=appleConfig(env);
    const {SignedDataVerifier,AppStoreServerAPIClient,Environment}=await import('@apple/app-store-server-library');
    const target=env.APPLE_ENVIRONMENT==='sandbox'?Environment.SANDBOX:Environment.PRODUCTION;
    verifier=new SignedDataVerifier(cfg.roots,true,target,'com.kennelflow.app',
      target===Environment.PRODUCTION?cfg.appId:undefined);
    client=new AppStoreServerAPIClient(env.APPLE_IAP_PRIVATE_KEY.replace(/\\n/g,'\n'),
      env.APPLE_IAP_KEY_ID,env.APPLE_IAP_ISSUER_ID,'com.kennelflow.app',target);
  }
  const submitted=await verifier.verifyAndDecodeTransaction(jws);
  if(submitted.bundleId!=='com.kennelflow.app')throw Object.assign(Error('Apple bundle mismatch'),{status:403});
  if(!APPLE_PRODUCTS[submitted.productId])throw Object.assign(Error('Unrecognized Apple product'),{status:403});
  if(submitted.revocationDate!=null)throw Object.assign(Error('Apple purchase revoked'),{status:403});
  if(APPLE_PRODUCTS[submitted.productId]==='lifetime'){
    const info=await client.getTransactionInfo(String(submitted.transactionId));
    const latest=await verifier.verifyAndDecodeTransaction(info.signedTransactionInfo);
    if(latest.transactionId!==submitted.transactionId)throw Object.assign(Error('Apple transaction mismatch'),{status:403});
    return normalizeAppleTransaction(latest,null);
  }
  const response=await client.getAllSubscriptionStatuses(String(submitted.originalTransactionId));
  if(response.bundleId!=='com.kennelflow.app')throw Object.assign(Error('Apple subscription bundle mismatch'),{status:403});
  const entries=(response.data||[]).flatMap(g=>g.lastTransactions||[]);
  const owned=entries.filter(e=>String(e.originalTransactionId)===String(submitted.originalTransactionId));
  for(const current of owned) {
    if(!current.signedTransactionInfo)continue;
    const latest=await verifier.verifyAndDecodeTransaction(current.signedTransactionInfo);
    if(latest.bundleId!=='com.kennelflow.app'||
       String(latest.originalTransactionId)!==String(submitted.originalTransactionId))continue;
    try {
      const renewal=current.status===4 && current.signedRenewalInfo
        ? await verifier.verifyAndDecodeRenewalInfo(current.signedRenewalInfo) : null;
      return normalizeAppleTransaction(latest,current.status,Date.now(),renewal?.gracePeriodExpiresDate);
    }catch{/* try another active group item */}
  }
  throw Object.assign(Error('No active Apple subscription'),{status:403});
}
