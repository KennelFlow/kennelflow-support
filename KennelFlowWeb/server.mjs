import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const PORT=Number(process.env.PORT||4173);
const BACKEND='https://br-long-night-b5uhw0hi-kennelflowapi.compute.c-7.us-east-2.aws.neon.tech';
const sessions=new Map();
const secure=process.env.NODE_ENV==='production';
const cookies=(req)=>Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
const session=(req)=>sessions.get(cookies(req).kf_session);
const send=(res,status,body,extra={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(body))};
const body=async(req)=>{let data='';for await(const chunk of req){data+=chunk;if(data.length>16384)throw Error('Too large')}return JSON.parse(data)};
const upstream=async(path,token,method='GET',payload)=>{const response=await fetch(BACKEND+path,{method,headers:{'Accept':'application/json',...(token?{'Authorization':'Bearer '+token}:{}),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,redirect:'manual',signal:AbortSignal.timeout(12000)});if(response.status>=300&&response.status<400)throw Error('Redirect blocked');return {status:response.status,data:await response.json().catch(()=>({}))}};
const allowed=(req)=>{const origin=req.headers.origin;return !origin||new URL(origin).host===req.headers.host};
http.createServer(async(req,res)=>{try{
const url=new URL(req.url,'http://localhost');const path=url.pathname;
if(path==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(await readFile(new URL('./index.html',import.meta.url)));return}
if(path==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(await readFile(new URL('./app.js',import.meta.url)));return}
if(path==='/health'){return send(res,200,{ok:true})}
if(!path.startsWith('/api/'))return send(res,404,{error:'Not found'});
if(!allowed(req))return send(res,403,{error:'Origin not allowed'});
if(path==='/api/login'&&req.method==='POST'){const {email,password}=await body(req);if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>512)return send(res,400,{error:'Invalid credentials'});const r=await upstream('/v2/login',null,'POST',{email,password});if(r.status!==200||!r.data.token)return send(res,401,{error:'Invalid credentials'});const id=randomBytes(32).toString('hex');sessions.set(id,{token:r.data.token,created:Date.now()});return send(res,200,{ok:true},{'Set-Cookie':'kf_session='+id+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'+(secure?'; Secure':'')})}
if(path==='/api/logout'&&req.method==='POST'){sessions.delete(cookies(req).kf_session);return send(res,200,{ok:true},{'Set-Cookie':'kf_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+(secure?'; Secure':'')})}
const s=session(req);if(!s||Date.now()-s.created>28800000)return send(res,401,{error:'Sign in required'});
if(path==='/api/me'&&req.method==='GET'){const r=await upstream('/v2/me',s.token);return send(res,r.status===200?200:401,r.data)}
if(path==='/api/kennels'&&req.method==='GET'){const r=await upstream('/v2/kennels',s.token);return send(res,r.status===200?200:403,r.data)}
if(path==='/api/records'&&req.method==='GET'){const kennel=url.searchParams.get('kennel')||'';if(!/^[a-f0-9-]{36}$/i.test(kennel))return send(res,400,{error:'Invalid kennel'});const membership=await upstream('/v2/kennels',s.token);if(membership.status!==200||!membership.data.kennels?.some(k=>k.id?.toLowerCase()===kennel.toLowerCase()))return send(res,403,{error:'Not authorized for kennel'});const cursor=url.searchParams.get('cursor');const r=await upstream('/v2/kennels/'+kennel+'/records'+(cursor?'?cursor='+encodeURIComponent(cursor):''),s.token);return send(res,r.status===200?200:502,r.data)}
return send(res,404,{error:'Not found'});
}catch(e){return send(res,503,{error:'Service unavailable'})}}).listen(PORT,()=>console.log('KennelFlow Web read-only server listening on '+PORT));

[executed on device: Antonios-MacBook-Air.local (84400095-510b-4cac-aa2c-4d1a0a59d3ba)]