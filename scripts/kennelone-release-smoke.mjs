/**
 * Kennel One public release smoke check — read-only, credential-free.
 * Run: node scripts/kennelone-release-smoke.mjs
 * Intended as a release snapshot, not a substitute for authenticated QA.
 */
const timeout = 14000;
const results = [];
async function request(url, options={}) {
  const { timeoutMs=timeout, ...requestOptions } = options;
  const res = await fetch(url, { signal:AbortSignal.timeout(timeoutMs), redirect:'follow', ...requestOptions });
  return { status:res.status, url:res.url, headers:res.headers, text:await res.text() };
}
async function test(name, check, {pending=false}={}) {
  try {
    const result=await check();
    results.push({status:result.ok?'PASS':pending?'PENDING':'FAIL',name,details:result.details||''});
  } catch(e) {
    results.push({status:pending?'PENDING':'FAIL',name,details:String(e.message||e).slice(0,180)});
  }
}
const pass=(ok,details='')=>({ok,details});

await test('Primary domain serves Kennel One via HTTPS',async()=>{
 const r=await request('https://kennelone.app/');
 return pass(r.status===200 && r.text.includes('<title>Kennel One') && r.url.startsWith('https://kennelone.app/'),`HTTP ${r.status}; ${r.url}`);
});
await test('www redirects to canonical domain',async()=>{
 const r=await request('https://www.kennelone.app/');
 return pass(r.status===200 && r.url.startsWith('https://kennelone.app/'),r.url);
});
await test('Primary domain has current support contact',async()=>{
 const r=await request('https://kennelone.app/');
 return pass(r.text.includes('mailto:kenneloneapp@gmail.com'), 'Support contact consistency');
});
await test('Legacy web address remains rebranded',async()=>{
 const r=await request('https://kennelflowpro.app/');
 return pass(r.status===200 && r.text.includes('<title>Kennel One'),`HTTP ${r.status}`);
});
await test('Legacy website shows correct purchase prices',async()=>{
 const r=await request('https://kennelflowpro.app/pricing.html');
 return pass(['$10.99','$99.00','$299.99'].every(x=>r.text.includes(x)) && !r.text.includes('$399.99'),'Monthly / annual / lifetime');
});
await test('Cloud business portal health',async()=>{
 const r=await request('https://app.kennelflowpro.app/health');
 const j=JSON.parse(r.text);
 return pass(r.status===200 && j.ok===true,`HTTP ${r.status}`);
});
await test('Anonymous account and records are denied',async()=>{
 const base='https://app.kennelflowpro.app';
 const [me,records]=await Promise.all([request(base+'/api/me'),request(base+'/api/records')]);
 return pass(me.status===401 && records.status===401,`/api/me=${me.status}, /api/records=${records.status}`);
});
await test('Square production endpoint reports production',async()=>{
 const r=await request('https://kennelflow-payments.onrender.com/health');
 const j=JSON.parse(r.text);
 return pass(r.status===200 && j.ok===true && j.environment==='production' && j.webhookConfigured===true,`HTTP ${r.status}; ${j.environment}`);
});
await test('Square sandbox endpoint reports sandbox',async()=>{
 const r=await request('https://kennelflow-square-sandbox.onrender.com/health',{timeoutMs:55000});
 const j=JSON.parse(r.text);
 return pass(r.status===200 && j.ok===true && j.environment==='sandbox',`HTTP ${r.status}; ${j.environment}`);
});
await test('App Store has released Kennel One version 2.8 or later',async()=>{
 const r=await request('https://itunes.apple.com/lookup?id=6809212861&country=us');
 const j=JSON.parse(r.text);const a=j.results?.[0]||{};
 const version=Number.parseFloat(a.version||'0');
 return pass(version>=2.8 && /Kennel One/i.test(a.trackName||''),`Public App Store: ${a.trackName||'unknown'} ${a.version||'unknown'}`);
},{pending:true});
await test('Marketing site cleared for indexing after policy approval',async()=>{
 const r=await request('https://kennelone.app/');
 return pass(!/noindex/i.test(r.text) && !/disallow:\s*\//i.test((await request('https://kennelone.app/robots.txt')).text),'Launch sign-off required before enabling search indexing');
},{pending:true});

for(const row of results){
 console.log(`${row.status.padEnd(8)} ${row.name}${row.details?' — '+row.details:''}`);
}
const fail=results.filter(r=>r.status==='FAIL').length;
const pending=results.filter(r=>r.status==='PENDING').length;
const passed=results.filter(r=>r.status==='PASS').length;
console.log(`\nRelease smoke: ${passed} PASS, ${pending} PENDING, ${fail} FAIL`);
process.exitCode=fail?1:0;
