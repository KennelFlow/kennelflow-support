// Independent, least-privilege Microsoft Store install importer.
// No account, kennel, billing, or subscription tables are accessed.
const STORE_ID = '9N2X8HKZV2NN';
const RESOURCE = 'https://manage.devcenter.microsoft.com';
const INSTALLS_PATH = '/v1.0/my/analytics/installs';

function assertGuid(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')) {
    throw Error(label + ' must be a Microsoft Entra GUID');
  }
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}
function usDay(value) {
  const parts = value.split('-');
  return parts[1] + '/' + parts[2] + '/' + parts[0];
}

export function reportWindow(now = new Date(), days = 30) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw Error('Invalid reporting window');
  if (Number.isNaN(now.getTime())) throw Error('Invalid reporting date');
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    startDate: isoDay(new Date(today - days * 86400000)),
    endDate: isoDay(new Date(today - 86400000))
  };
}

export async function getMicrosoftToken({ tenantId, clientId, clientSecret, fetcher = fetch }) {
  assertGuid(tenantId, 'Tenant ID');
  assertGuid(clientId, 'Client ID');
  if (typeof clientSecret !== 'string' || !clientSecret.trim()) {
    throw Error('Microsoft client secret is required');
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    resource: RESOURCE
  });
  const response = await fetcher(
    'https://login.microsoftonline.com/' + tenantId + '/oauth2/token',
    {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body, signal: AbortSignal.timeout(20000)}
  );
  if (!response.ok) throw Error('Microsoft Entra authentication failed (HTTP ' + response.status + ')');
  const result = await response.json();
  if (typeof result.access_token !== 'string' || !result.access_token) {
    throw Error('Microsoft Entra did not return an access token');
  }
  return result.access_token;
}

export async function getMicrosoftInstalls({token, startDate, endDate, fetcher = fetch}) {
  if (typeof token !== 'string' || !token) throw Error('Microsoft access token missing');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw Error('Invalid reporting date range');
  }
  if (startDate > endDate) throw Error('Report start date follows end date');
  const initial = new URL(RESOURCE + INSTALLS_PATH);
  initial.search = new URLSearchParams({
    applicationId: STORE_ID, startDate: usDay(startDate),
    endDate: usDay(endDate), top: '10000', skip: '0'
  }).toString();
  const seen = new Set();
  let next = initial.toString();
  let total = 0;
  let pages = 0;
  while (next) {
    if (pages++ >= 20) throw Error('Too many Microsoft Store report pages');
    const url = new URL(next);
    if (url.protocol !== 'https:' || url.origin !== RESOURCE || url.pathname !== INSTALLS_PATH) {
      throw Error('Unexpected Microsoft Store pagination endpoint');
    }
    if (seen.has(url.href)) throw Error('Repeated Microsoft Store report page');
    seen.add(url.href);
    const response = await fetcher(url.href, {
      headers: {authorization: 'Bearer ' + token, accept: 'application/json'},
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw Error('Microsoft Store installs API failed (HTTP ' + response.status + ')');
    const result = await response.json();
    const rows = result.Value || result.value;
    if (!Array.isArray(rows)) throw Error('Microsoft Store installs report has no data array');
    for (const row of rows) {
      if (row.applicationId && String(row.applicationId).toUpperCase() !== STORE_ID) {
        throw Error('Microsoft Store returned a different app');
      }
      const n = Number(row.successfulInstallCount);
      if (!Number.isSafeInteger(n) || n < 0) throw Error('Invalid Microsoft Store install count');
      total += n;
      if (!Number.isSafeInteger(total)) throw Error('Microsoft Store install count overflow');
    }
    next = result['@nextLink'] || result.nextLink || null;
  }
  return {total, pages, storeId: STORE_ID, startDate, endDate};
}

export async function writeWindowsInstalls(db, report) {
  if (!Number.isSafeInteger(report.total) || report.total < 0) throw Error('Invalid report count');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(report.endDate)) throw Error('Invalid report end date');
  const sql = [
    'INSERT INTO public.platform_store_metrics',
    '(platform,metric_name,total_count,as_of_date,source,synced_at)',
    "VALUES ('windows','installs',$1,$2::date,'microsoft_partner_center',now())",
    'ON CONFLICT(platform) DO UPDATE SET',
    'metric_name=EXCLUDED.metric_name,total_count=EXCLUDED.total_count,',
    'as_of_date=EXCLUDED.as_of_date,source=EXCLUDED.source,synced_at=now()',
    'WHERE public.platform_store_metrics.as_of_date <= EXCLUDED.as_of_date',
    'RETURNING platform,metric_name,total_count,as_of_date,source'
  ].join(' ');
  const result = await db.query(sql, [report.total, report.endDate]);
  return result.rowCount === 1;
}

export async function syncWindowsStore({env = process.env, fetcher = fetch, openDatabase} = {}) {
  const tenantId = env.MSSTORE_TENANT_ID;
  const clientId = env.MSSTORE_CLIENT_ID;
  const clientSecret = env.MSSTORE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw Error('Configure MSSTORE_TENANT_ID, MSSTORE_CLIENT_ID, and MSSTORE_CLIENT_SECRET first');
  }
  if (!env.NEON_STORE_REPORTING_DATABASE_URL && env.MSSTORE_DRY_RUN !== '1') {
    throw Error('Configure a restricted NEON_STORE_REPORTING_DATABASE_URL first');
  }
  const {startDate, endDate} = reportWindow();
  const token = await getMicrosoftToken({tenantId, clientId, clientSecret, fetcher});
  const report = await getMicrosoftInstalls({token, startDate, endDate, fetcher});
  if (env.MSSTORE_DRY_RUN === '1') return {...report, saved: false};
  if (typeof openDatabase !== 'function') throw Error('Database connection function missing');
  const db = await openDatabase(env.NEON_STORE_REPORTING_DATABASE_URL);
  try {
    const saved = await writeWindowsInstalls(db, report);
    return {...report, saved};
  } finally {
    await db.end();
  }
}
