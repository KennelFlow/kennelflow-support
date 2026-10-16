import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes, createHash, createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {canWrite, collections, uuid, validateModel} from './records.mjs';
const BACKEND='https://br-long-night-b5uhw0hi-kennelflowapi.compute.c-7.us-east-2.aws.neon.tech';
const SESSION_MS=28800000;
const fail=(status,message)=>Object.assign(Error(message),{status});
export function createWebServer({backend=BACKEND,fetcher=fetch,secure=process.env.RENDER==='true'||process.env.NODE_ENV==='production'}={}) {
  const sessions=new Map();
  const cookieID=req=>/(?:^|;\s*)kf_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
  const cookie=(id,age)=>`kf_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
  const send=(res,status,data,extra={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(data))};
  async function read(req,limit=1048576) {
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>limit)throw fail(413,'Request too large');chunks.push(chunk)}
    return Buffer.concat(chunks);
  }
  async function json(req,limit) {
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail(415,'JSON required');
    const value=JSON.parse((await read(req,limit)).toString('utf8')||'{}');
    if(!value||typeof value!=='object'||Array.isArray(value))throw fail(400,'JSON object required');
    return value;
  }
  async function upstream(path,token,method='GET',data,binary=false) {
    const r=await fetcher(backend+path,{method,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(data!==undefined?{'Content-Type':binary?'application/octet-stream':'application/json'}:{}),...(binary&&data?{'X-Content-SHA256':createHash('sha256').update(data).digest('hex')}:{})},body:data===undefined?undefined:binary?data:JSON.stringify(data),redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(r.status>=300&&r.status<400)throw fail(502,'Cloud redirect blocked');
    return r;
  }
  const forward=async(res,r)=>send(res,r.status,await r.json().catch(()=>({error:'Invalid cloud response'})));
  async function membership(token,kennel) {
    const r=await upstream('/v2/me',token);
    if(r.status!==200)throw fail(r.status===401?401:503,r.status===401?'Sign in again':'Could not verify kennel access');
    const k=(await r.json()).kennels?.find(k=>k.id?.toLowerCase()===kennel);
    if(!k||!['owner','admin','staff','viewer'].includes(k.role))throw fail(403,'No access to this kennel');
    return k;
  }
  const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript'],'/employees.mjs':['employees.mjs','text/javascript'],'/records.mjs':['records.mjs','text/javascript'],'/schema.mjs':['schema.mjs','text/javascript'],'/styles.css':['styles.css','text/css']};
  return http.createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://localhost'),path=url.pathname;
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    if(Object.hasOwn(files,path)&&['GET','HEAD'].includes(req.method)){
      const [file,type]=files[path];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});res.end(req.method==='HEAD'?undefined:await readFile(new URL(file,import.meta.url)));return;
    }
    if(path==='/health'&&req.method==='GET')return send(res,200,{ok:true,version:'web-employees-2'});
    if(!path.startsWith('/api/'))return send(res,404,{error:'Not found'});
    const unsafe=!['GET','HEAD'].includes(req.method),origin=req.headers.origin;
    if(origin){let parsed;try{parsed=new URL(origin)}catch{throw fail(403,'Origin not allowed')}if(parsed.host!==req.headers.host||!['http:','https:'].includes(parsed.protocol))throw fail(403,'Origin not allowed')}
    if(unsafe&&(!origin||req.headers['sec-fetch-site']==='cross-site'))throw fail(403,'Open this page again before saving');
    if(path==='/api/login'&&req.method==='POST'){
      const {email,password}=await json(req,16384);
      if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>256)throw fail(400,'Email and password required');
      const r=await upstream('/v2/login',null,'POST',{email,password}),value=await r.json();
      if(r.status!==200||!/^[a-f0-9]{64}$/.test(value.token||''))return send(res,r.status===200?502:r.status,{error:value.error||'Could not sign in'});
      for(const [id,s] of sessions)if(Date.now()-s.created>SESSION_MS)sessions.delete(id);
      if(sessions.size>=10000)throw fail(503,'Please try again shortly');
      sessions.delete(cookieID(req));const id=randomBytes(32).toString('hex');sessions.set(id,{token:value.token,created:Date.now()});
      return send(res,200,{ok:true},{'Set-Cookie':cookie(id,28800)});
    }
    if(path==='/api/invitations/accept'&&req.method==='POST'){
      const input=await json(req,16384);
      const {token,email,name,password}=input;
      if(!/^[a-f0-9]{64}$/.test(token||'')||typeof email!=='string'||email.length>254||typeof name!=='string'||!name.trim()||name.length>120||typeof password!=='string'||password.length<16||password.length>256)throw fail(400,'Enter your invitation, email, name, and a password of 16–256 characters');
      return forward(res,await upstream('/v2/invitations/accept',null,'POST',{token,email,name,password}));
    }
    const id=cookieID(req),s=sessions.get(id);
    if(path==='/api/logout'&&req.method==='POST'){
      sessions.delete(id);if(s)try{await upstream('/v2/logout',s.token,'POST',{})}catch{}
      return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
    }
    if(!s||Date.now()-s.created>SESSION_MS){sessions.delete(id);return send(res,401,{error:'Sign in required'})}
    if(path==='/api/me'&&req.method==='GET')return forward(res,await upstream('/v2/me',s.token));
    if(path==='/api/kennels'&&req.method==='GET'){const r=await upstream('/v2/me',s.token);const value=await r.json();return send(res,r.status,r.status===200?{kennels:value.kennels}:value)}
    const employee=/^\/api\/kennels\/([^/]+)\/(members|invitations|clock|history)(?:\/([^/]+))?$/.exec(path);
    if(employee){
      const kennel=employee[1].toLowerCase(),resource=employee[2],target=employee[3]?.toLowerCase();
      if(!uuid(kennel)||(target&&!uuid(target)))throw fail(400,'Invalid employee address');
      const k=await membership(s.token,kennel);
      if(['members','invitations'].includes(resource)&&!['owner','admin'].includes(k.role))throw fail(403,'Only an owner or admin can manage employees');
      const upstreamPath=`/v2/kennels/${kennel}/${resource}`+(target?'/'+target:'');
      if(req.method==='GET'&&!target){
        const before=url.searchParams.get('before');if(before&&!/^[1-9][0-9]{0,17}$/.test(before))throw fail(400,'Invalid history cursor');
        return forward(res,await upstream(upstreamPath+(resource==='history'&&before?'?before='+before:''),s.token));
      }
      if(resource==='invitations'&&req.method==='POST'&&!target){
        const {email,role}=await json(req,16384);
        if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||!['staff','viewer','admin'].includes(role)||k.role==='admin'&&role==='admin')throw fail(400,'Choose a valid email and permitted role');
        return forward(res,await upstream(upstreamPath,s.token,'POST',{email,role}));
      }
      if(resource==='invitations'&&req.method==='DELETE'&&target)return forward(res,await upstream(upstreamPath,s.token,'DELETE'));
      if(resource==='members'&&req.method==='PATCH'&&target){
        const {role,remove}=await json(req,16384);
        if(!['staff','viewer','admin'].includes(role)||typeof remove!=='boolean')throw fail(400,'Choose a valid employee role');
        return forward(res,await upstream(upstreamPath,s.token,'PATCH',{role,remove}));
      }
      if(resource==='clock'&&req.method==='POST'&&!target){
        const {action}=await json(req,16384);if(!['in','out'].includes(action))throw fail(400,'Choose clock in or clock out');
        return forward(res,await upstream(upstreamPath,s.token,'POST',{action}));
      }
      throw fail(404,'Not found');
    }
    const checkout=/^\/api\/kennels\/([^/]+)\/(square-checkout|square-sandbox-checkout)$/.exec(path);
    if(checkout&&req.method==='POST'){
      const scope=checkout[1].toLowerCase();
      if(!uuid(scope))throw fail(400,'Invalid kennel');
      const member=await membership(s.token,scope);
      if(!['owner','admin'].includes(member.role))throw fail(403,'Only an owner or admin may create payment requests');
      const input=await json(req,16384);
      const {amountCents,customerName,description,reference}=input;
      if(!Number.isSafeInteger(amountCents)||amountCents<100||amountCents>5000000||
         typeof customerName!=='string'||!customerName.trim()||customerName.length>120||
         typeof description!=='string'||description.length>250||
         typeof reference!=='string'||reference.length>120)throw fail(400,'Enter valid payment details');
      const secret=process.env.KENNELFLOW_CHECKOUT_SECRET;
      if(!secret||secret.length<32)throw fail(503,'Secure checkout is not configured');
      const body=JSON.stringify({kennelID:scope,amountCents,customerName:customerName.trim(),description,reference,requestID:randomBytes(16).toString('hex')});
      const stamp=String(Date.now());
      const signature=createHmac('sha256',secret).update(stamp+'.'+body).digest('hex');
      const destination=checkout[2]==='square-sandbox-checkout'?'https://kennelflow-square-sandbox.onrender.com':'https://kennelflow-payments.onrender.com';
      const result=await fetcher(destination+'/kennelflow/checkout',{
        method:'POST',headers:{'Content-Type':'application/json','X-KF-Timestamp':stamp,'X-KF-Signature':signature},
        body,redirect:'manual',signal:AbortSignal.timeout(20000)
      });
      if(result.status>=300&&result.status<400)throw fail(502,'Checkout redirect blocked');
      const data=await result.json().catch(()=>({error:'Invalid Square response'}));
      if(!result.ok)return send(res,result.status>=500?502:result.status,{error:data.error||'Could not create checkout'});
      if(!/^https:\/\//.test(data.url||''))throw fail(502,'Invalid checkout URL');
      return send(res,200,{url:data.url,orderID:data.orderID||'',status:'AWAITING_CUSTOMER_PAYMENT'});
    }
    const paymentStatus=/^\/api\/kennels\/([^/]+)\/square-(sandbox-)?(status|recover)$/.exec(path);
    if(paymentStatus&&req.method==='POST'){
      const scope=paymentStatus[1].toLowerCase();
      if(!uuid(scope))throw fail(400,'Invalid kennel');
      const member=await membership(s.token,scope);
      if(!['owner','admin'].includes(member.role))throw fail(403,'Only owner/admin may verify payments');
      const {orderID,amountCents,customerName,reference}=await json(req,16384);
      const inputRecord=typeof customerName==='string'&&customerName.trim()&&customerName.length<=120?{customerName:customerName.trim()}:null;
      if(!Number.isSafeInteger(amountCents)||amountCents<100|| (paymentStatus[3]==='status'?(typeof orderID!=='string'||!orderID||orderID.length>192):(typeof reference!=='string'||!reference.trim()||reference.length>120)))throw fail(400,'Invalid payment lookup');
      const secret=process.env.KENNELFLOW_CHECKOUT_SECRET;
      if(!secret||secret.length<32)throw fail(503,'Payment verification not configured');
      const body=JSON.stringify(paymentStatus[3]==='recover'?{kennelID:scope,reference:reference.trim(),amountCents}:{orderID,amountCents});
      const stamp=String(Date.now()),signature=createHmac('sha256',secret).update(stamp+'.'+body).digest('hex');
      const dest=paymentStatus[2]?'https://kennelflow-square-sandbox.onrender.com':'https://kennelflow-payments.onrender.com';
      const result=await fetcher(dest+(paymentStatus[3]==='recover'?'/kennelflow/recover-payment':'/kennelflow/checkout-status'),{method:'POST',headers:{'Content-Type':'application/json','X-KF-Timestamp':stamp,'X-KF-Signature':signature},body,redirect:'manual',signal:AbortSignal.timeout(20000)});
      if(result.status>=300&&result.status<400)throw fail(502,'Payment redirect blocked');
      const data=await result.json().catch(()=>({error:'Invalid response'}));
      if(!result.ok)return send(res,result.status,{error:data.error||'Payment verification failed'});
      const verifiedOrderID=data.orderID||orderID;
      if(data.paid===true&&typeof data.paymentID==='string'&&data.paymentID&&inputRecord){
        // Never record a sandbox transaction as real revenue. Test records carry an explicit method.
        const recordID=createHash('sha256').update('kf-square-'+(paymentStatus[2]?'sandbox':'production')+'-'+data.paymentID).digest('hex');
        const identifier=[recordID.slice(0,8),recordID.slice(8,12),'4'+recordID.slice(13,16),'a'+recordID.slice(17,20),recordID.slice(20,32)].join('-');
        const method=paymentStatus[2]?'Square Sandbox — TEST ONLY':'Square';
        const record={id:identifier,customerName:inputRecord.customerName,puppyName:'',date:new Date().toISOString(),amount:amountCents/100,method,reference:data.paymentID,notes:'Verified Square order '+verifiedOrderID+(paymentStatus[2]?' — SANDBOX TEST — NO REAL MONEY':'')};
        const error=validateModel(collections.payments,record);
        if(error)throw fail(400,error);
        const saved=await upstream('/v2/kennels/'+scope+'/records/'+identifier,s.token,'PUT',{type:'payments',expectedRevision:0,data:{platform:'ios',collection:'payments',record}});
        if(saved.status===409)return send(res,409,{paid:true,status:'COMPLETED',orderID:verifiedOrderID,paymentID:data.paymentID,environment:paymentStatus[2]?'sandbox':'production',saved:false,error:'Square confirmed payment, but KennelFlow could not verify whether the cloud record already exists. No duplicate record was created.'});
        if(saved.status!==200&&saved.status!==201)return send(res,502,{paid:true,error:'Square confirmed payment, but KennelFlow could not save the record'});
        return send(res,200,{paid:true,status:'COMPLETED',orderID,paymentID:data.paymentID,environment:paymentStatus[2]?'sandbox':'production',saved:true,alreadyRecorded:false});
      }
      return send(res,200,{paid:data.paid===true,status:data.status,orderID:data.orderID,paymentID:data.paymentID||'',environment:paymentStatus[2]?'sandbox':'production'});
    }
    if(path==='/api/records'&&req.method==='GET'){
      const kennel=(url.searchParams.get('kennel')||'').toLowerCase(),cursor=url.searchParams.get('cursor');
      if(!uuid(kennel)||cursor?.length>2048)throw fail(400,'Invalid kennel or page');
      await membership(s.token,kennel);
      return forward(res,await upstream('/v2/kennels/'+kennel+'/records'+(cursor?'?cursor='+encodeURIComponent(cursor):''),s.token));
    }
    const match=/^\/api\/kennels\/([^/]+)\/(records|files)(?:\/([^/]+))?$/.exec(path);
    if(match){
      const kennel=match[1].toLowerCase(),resource=match[2],recordID=match[3]?.toLowerCase();
      if(!uuid(kennel)||!uuid(recordID))throw fail(400,'Invalid record address');
      const k=await membership(s.token,kennel);
      if(resource==='records'&&req.method==='PUT'){
        const input=await json(req);
        if(!canWrite(k.role,input.type))throw fail(403,'Your account cannot edit this type of record');
        if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||String(input.record?.id).toLowerCase()!==recordID)throw fail(400,'Invalid record identity or revision');
        const error=validateModel(collections[input.type],input.record);if(error)throw fail(400,error);
        if(input.deletedAt!=null&&(typeof input.deletedAt!=='string'||!Number.isFinite(Date.parse(input.deletedAt))))throw fail(400,'Invalid deletion date');
        const payload={type:input.type,expectedRevision:input.expectedRevision,data:{platform:'ios',collection:input.type,record:input.record},...(input.deletedAt?{deletedAt:input.deletedAt}:{})};
        return forward(res,await upstream(`/v2/kennels/${kennel}/records/${recordID}`,s.token,'PUT',payload));
      }
      if(resource==='files'&&['GET','PUT'].includes(req.method)){
        if(!['owner','admin'].includes(k.role))throw fail(403,'Your account cannot access documents');
        const content=req.method==='PUT'?await read(req,10485760):undefined;
        const r=await upstream(`/v2/kennels/${kennel}/files/${recordID}`,s.token,req.method,content,true);
        if(req.method==='PUT'||r.status!==200)return forward(res,r);
        const bytes=Buffer.from(await r.arrayBuffer()),hash=r.headers.get('x-content-sha256');
        if(bytes.length>10485760||createHash('sha256').update(bytes).digest('hex')!==hash)throw fail(502,'Document integrity check failed');
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${recordID}"`,'Cache-Control':'no-store','X-Content-SHA256':hash});res.end(bytes);return;
      }
    }
    return send(res,404,{error:'Not found'});
  }catch(e){if(!res.headersSent)send(res,e.status||(e instanceof SyntaxError?400:503),{error:e.status?e.message:e instanceof SyntaxError?'Invalid JSON':'Cloud unavailable. Your unsaved form remains open.'});else res.end()}});
}
if(process.argv[1]===fileURLToPath(import.meta.url))createWebServer().listen(Number(process.env.PORT||4173),'0.0.0.0',()=>console.log('KennelFlow Web management server started'));
