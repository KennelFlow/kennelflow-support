import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reportWindow, getMicrosoftToken, getMicrosoftInstalls,
  writeWindowsInstalls, syncWindowsStore
} from '../src/microsoft-store.mjs';

const storeId = '9N2X8HKZV2NN';
const guid = '00000000-1111-2222-3333-444444444444';

test('uses thirty complete UTC days and never includes partial today', () => {
  assert.deepEqual(reportWindow(new Date('2026-10-27T23:59:00Z')), {
    startDate: '2026-09-27', endDate: '2026-10-26'
  });
});

test('Entra token request targets Microsoft and the required Store resource', async () => {
  const fetcher = async (url, options) => {
    assert.equal(new URL(url).hostname, 'login.microsoftonline.com');
    assert.equal(new URL(url).pathname, '/' + guid + '/oauth2/token');
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('grant_type'), 'client_credentials');
    assert.equal(options.body.get('resource'), 'https://manage.devcenter.microsoft.com');
    assert.equal(options.body.get('client_secret'), 'test-secret');
    return Response.json({access_token:'fake-access-token'});
  };
  assert.equal(await getMicrosoftToken({tenantId:guid,clientId:guid,clientSecret:'test-secret',fetcher}), 'fake-access-token');
});

test('does not silently accept missing or malformed Entra credentials', async () => {
  await assert.rejects(() => getMicrosoftToken({tenantId:'bad',clientId:guid,clientSecret:'secret'}), /GUID/);
  await assert.rejects(() => getMicrosoftToken({tenantId:guid,clientId:guid,clientSecret:''}), /secret/);
});

test('rejects failed auth without including server error response', async () => {
  const fetcher = async () => new Response('sensitive-error-content', {status:401});
  await assert.rejects(
    () => getMicrosoftToken({tenantId:guid,clientId:guid,clientSecret:'secret',fetcher}),
    error => error.message.includes('HTTP 401') && !error.message.includes('sensitive')
  );
});

test('fetches Store installs for the correct ID, dates, and next page', async () => {
  let calls=0;
  const second = 'https://manage.devcenter.microsoft.com/v1.0/my/analytics/installs?applicationId=' + storeId + '&skip=1';
  const fetcher=async(url, options)=>{
    calls++;
    assert.equal(options.headers.authorization,'Bearer mock-token');
    if(calls===1) {
      const u=new URL(url);
      assert.equal(u.searchParams.get('applicationId'),storeId);
      assert.equal(u.searchParams.get('startDate'),'09/27/2026');
      assert.equal(u.searchParams.get('endDate'),'10/26/2026');
      return Response.json({Value:[{applicationId:storeId,successfulInstallCount:2}], '@nextLink':second});
    }
    assert.equal(url,second);
    return Response.json({Value:[{applicationId:storeId,successfulInstallCount:3}]});
  };
  const result=await getMicrosoftInstalls({token:'mock-token',startDate:'2026-09-27',endDate:'2026-10-26',fetcher});
  assert.equal(result.total,5);
  assert.equal(result.pages,2);
  assert.equal(calls,2);
});

test('empty but valid Store report is zero, not unknown', async () => {
  const result=await getMicrosoftInstalls({token:'mock',startDate:'2026-09-27',endDate:'2026-10-26',fetcher:async()=>Response.json({Value:[]})});
  assert.equal(result.total,0);
});

test('refuses cross-host and duplicate pagination', async () => {
  await assert.rejects(
    () => getMicrosoftInstalls({token:'mock',startDate:'2026-09-27',endDate:'2026-10-26',
      fetcher:async()=>Response.json({Value:[], '@nextLink':'https://evil.example/token'})}),
    /pagination endpoint/
  );
  const url='https://manage.devcenter.microsoft.com/v1.0/my/analytics/installs?applicationId='+storeId;
  await assert.rejects(
    () => getMicrosoftInstalls({token:'mock',startDate:'2026-09-27',endDate:'2026-10-26',
      fetcher:async()=>Response.json({Value:[], '@nextLink':url})}),
    /Repeated/
  );
});

test('rejects unexpected product and invalid or ambiguous install count', async () => {
  for (const row of [
    {applicationId:'9NWRONG',successfulInstallCount:1},
    {applicationId:storeId,successfulInstallCount:-1},
    {applicationId:storeId,successfulInstallCount:'not-a-number'}
  ]) {
    await assert.rejects(
      () => getMicrosoftInstalls({token:'mock',startDate:'2026-09-27',endDate:'2026-10-26',
        fetcher:async()=>Response.json({Value:[row]})}),
      /different app|Invalid Microsoft Store install count/
    );
  }
});

test('writes only Microsoft Windows install aggregate using parameters, never customer records', async () => {
  let called=0;
  const db={query:async(sql,parameters)=>{
    called++;
    assert.match(sql,/INSERT INTO public.platform_store_metrics/);
    assert.match(sql,/VALUES \('windows','installs',\$1,\$2::date,'microsoft_partner_center',now\(\)\)/);
    assert.match(sql,/as_of_date <= EXCLUDED.as_of_date/);
    assert.doesNotMatch(sql,/app_users|kennels|purchase_entitlements/);
    assert.deepEqual(parameters,[7,'2026-10-26']);
    return {rowCount:1};
  }};
  const written=await writeWindowsInstalls(db,{total:7,endDate:'2026-10-26'});
  assert.equal(written,true);
  assert.equal(called,1);
});

test('requires connection secrets before networking and does not write on dry-run', async () => {
  await assert.rejects(()=>syncWindowsStore({env:{},fetcher:()=>{throw Error('fetch must not be used')}}),/Configure/);
  let requests=0;
  const fetcher=async(url)=>{
    requests++;
    if(url.includes('login.microsoftonline.com')) return Response.json({access_token:'mock'});
    return Response.json({Value:[{applicationId:storeId,successfulInstallCount:1}]});
  };
  const result=await syncWindowsStore({
    env:{MSSTORE_TENANT_ID:guid,MSSTORE_CLIENT_ID:guid,MSSTORE_CLIENT_SECRET:'test',MSSTORE_DRY_RUN:'1'},
    fetcher,
    openDatabase:()=>{throw Error('Database must not open')}
  });
  assert.equal(result.total,1);
  assert.equal(result.saved,false);
  assert.equal(requests,2);
});

test('API zero does not overwrite a previously verified Store count', async () => {
  const fetcher=async (url)=> url.includes('login.microsoftonline.com')
    ? Response.json({access_token:'mock'}) : Response.json({Value:[]});
  const res=await syncWindowsStore({
    env:{MSSTORE_TENANT_ID:guid,MSSTORE_CLIENT_ID:guid,MSSTORE_CLIENT_SECRET:'mock',
      NEON_STORE_REPORTING_DATABASE_URL:'postgresql://unreachable.invalid/unused'},
    fetcher, openDatabase:async()=>{throw Error('Zero must not contact Neon')}
  });
  assert.equal(res.total,0);assert.equal(res.saved,false);
  assert.equal(res.warning,'zero_count_requires_verification');
});
