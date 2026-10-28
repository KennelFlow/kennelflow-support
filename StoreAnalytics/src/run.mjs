import {syncWindowsStore} from './microsoft-store.mjs';

async function openDatabase(connectionString) {
  const {default: pg} = await import('pg');
  const pool = new pg.Pool({
    connectionString,
    ssl: {rejectUnauthorized: true},
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000
  });
  const probe = await pool.query('SELECT 1');
  if (probe.rowCount !== 1) {
    await pool.end();
    throw Error('Restricted reporting database connection failed');
  }
  return pool;
}

try {
  const result = await syncWindowsStore({openDatabase});
  console.log(JSON.stringify({
    service: 'Kennel One Microsoft Store analytics',
    storeId: result.storeId,
    metric: 'successful installs',
    window: result.startDate + ' through ' + result.endDate,
    count: result.total,
    pages: result.pages,
    saved: result.saved
  }));
} catch (error) {
  // Do not print response bodies, access tokens, credentials, or database URLs.
  console.error('Microsoft Store sync failed: ' + error.message);
  process.exitCode = 1;
}
