import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;
const ACCESS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeAccessCode(value='') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashAccessCode(value='') {
  return crypto.createHash('sha256').update(normalizeAccessCode(value)).digest('hex');
}

function generateAccessCode() {
  const bytes = crypto.randomBytes(16);
  let raw = '';
  for (let i = 0; i < 16; i += 1) raw += ACCESS_ALPHABET[bytes[i] % ACCESS_ALPHABET.length];
  return 'YP-' + raw.slice(0,4) + '-' + raw.slice(4,8) + '-' + raw.slice(8,12) + '-' + raw.slice(12,16);
}

function validCode(value) {
  const normalized = normalizeAccessCode(value);
  return normalized.length >= 18 && normalized.length <= 32;
}

export function installYardPatrolPortalRoutes(app) {
  const databaseURL = String(process.env.DATABASE_URL || '').trim();
  const pool = databaseURL ? new Pool({
    connectionString: databaseURL,
    ssl: databaseURL.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000
  }) : null;

  async function ensureSchema() {
    if (!pool) return;
    await pool.query(
      "CREATE TABLE IF NOT EXISTS yardpatrol_portals (" +
      "id TEXT PRIMARY KEY, customer_id TEXT UNIQUE NOT NULL, access_hash TEXT UNIQUE NOT NULL, " +
      "snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, customer_requests JSONB NOT NULL DEFAULT '[]'::jsonb, " +
      "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
    await pool.query("CREATE INDEX IF NOT EXISTS yardpatrol_portals_access_hash_idx ON yardpatrol_portals(access_hash)");
  }

  ensureSchema()
    .then(() => { if (pool) console.log('Yard Patrol portal schema is ready.'); })
    .catch(error => console.error('Yard Patrol portal schema setup failed:', error?.message || error));

  app.get('/yardpatrol/portal/health', async (_, res) => {
    if (!pool) return res.status(503).json({ ok:false, error:'Portal database is not configured.' });
    try {
      await pool.query('SELECT 1');
      return res.json({ ok:true, database:true, capabilityAccess:true });
    } catch {
      return res.status(503).json({ ok:false, error:'Portal database is not ready.' });
    }
  });

  app.post('/yardpatrol/portal/sync', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Portal database is not configured.' });
    try {
      const customerID = String(req.body?.customerID || '').trim().slice(0,80);
      const suppliedCode = String(req.body?.accessCode || '');
      const snapshot = req.body?.snapshot;
      if (!customerID || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        return res.status(400).json({ error:'A valid customerID and snapshot are required.' });
      }

      const current = await pool.query(
        'SELECT id,access_hash FROM yardpatrol_portals WHERE customer_id=$1 LIMIT 1',
        [customerID]
      );

      if (current.rowCount) {
        if (!validCode(suppliedCode) || current.rows[0].access_hash !== hashAccessCode(suppliedCode)) {
          return res.status(401).json({ error:'The customer portal access code does not match.' });
        }
        await pool.query(
          'UPDATE yardpatrol_portals SET snapshot=$2::jsonb, updated_at=NOW() WHERE customer_id=$1',
          [customerID,JSON.stringify(snapshot)]
        );
        return res.json({ ok:true, created:false, customerID });
      }

      const accessCode = validCode(suppliedCode) ? suppliedCode : generateAccessCode();
      await pool.query(
        'INSERT INTO yardpatrol_portals(id,customer_id,access_hash,snapshot) VALUES($1,$2,$3,$4::jsonb)',
        [crypto.randomUUID(),customerID,hashAccessCode(accessCode),JSON.stringify(snapshot)]
      );
      return res.json({ ok:true, created:true, customerID, accessCode });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to sync customer portal.' });
    }
  });

  app.post('/yardpatrol/portal/rotate', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Portal database is not configured.' });
    try {
      const customerID = String(req.body?.customerID || '').trim().slice(0,80);
      const currentCode = String(req.body?.accessCode || '');
      if (!customerID || !validCode(currentCode)) {
        return res.status(400).json({ error:'Customer ID and current access code are required.' });
      }
      const current = await pool.query(
        'SELECT access_hash FROM yardpatrol_portals WHERE customer_id=$1 LIMIT 1',[customerID]
      );
      if (!current.rowCount) return res.status(404).json({ error:'Customer portal was not found.' });
      if (current.rows[0].access_hash !== hashAccessCode(currentCode)) {
        return res.status(401).json({ error:'The customer portal access code does not match.' });
      }
      const accessCode = generateAccessCode();
      await pool.query(
        'UPDATE yardpatrol_portals SET access_hash=$2, updated_at=NOW() WHERE customer_id=$1',
        [customerID,hashAccessCode(accessCode)]
      );
      return res.json({ ok:true, customerID, accessCode });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to rotate customer access code.' });
    }
  });

  app.post('/yardpatrol/portal/delete', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Portal database is not configured.' });
    try {
      const customerID = String(req.body?.customerID || '').trim().slice(0,80);
      const code = String(req.body?.accessCode || '');
      if (!customerID || !validCode(code)) return res.status(400).json({ error:'Customer ID and access code are required.' });
      const result = await pool.query(
        'DELETE FROM yardpatrol_portals WHERE customer_id=$1 AND access_hash=$2',
        [customerID,hashAccessCode(code)]
      );
      if (!result.rowCount) return res.status(401).json({ error:'The customer portal access code does not match.' });
      return res.json({ ok:true, deleted:true });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to delete customer portal.' });
    }
  });

  app.post('/yardpatrol/portal/login', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Customer portal is temporarily unavailable.' });
    try {
      const code = String(req.body?.accessCode || '');
      if (!validCode(code)) return res.status(400).json({ error:'Enter a valid Yard Patrol access code.' });
      const result = await pool.query(
        'SELECT customer_id,snapshot,customer_requests,updated_at FROM yardpatrol_portals WHERE access_hash=$1 LIMIT 1',
        [hashAccessCode(code)]
      );
      if (!result.rowCount) return res.status(401).json({ error:'That Yard Patrol access code was not recognized.' });
      const row = result.rows[0];
      return res.json({
        ok:true,
        customerID:row.customer_id,
        snapshot:row.snapshot || {},
        requests:Array.isArray(row.customer_requests) ? row.customer_requests : [],
        updatedAt:row.updated_at
      });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to load customer portal.' });
    }
  });

  app.post('/yardpatrol/portal/request', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Customer portal is temporarily unavailable.' });
    try {
      const code = String(req.body?.accessCode || '');
      const type = String(req.body?.type || '').trim().slice(0,60);
      const payload = req.body?.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload) ? req.body.payload : {};
      if (!validCode(code) || !type) return res.status(400).json({ error:'Access code and request type are required.' });

      const current = await pool.query(
        'SELECT id,customer_requests FROM yardpatrol_portals WHERE access_hash=$1 LIMIT 1',
        [hashAccessCode(code)]
      );
      if (!current.rowCount) return res.status(401).json({ error:'That Yard Patrol access code was not recognized.' });
      const requests = Array.isArray(current.rows[0].customer_requests) ? current.rows[0].customer_requests : [];
      const item = {id:crypto.randomUUID(),type,payload,status:'pending',createdAt:new Date().toISOString()};
      requests.push(item);
      await pool.query(
        'UPDATE yardpatrol_portals SET customer_requests=$2::jsonb, updated_at=NOW() WHERE id=$1',
        [current.rows[0].id,JSON.stringify(requests.slice(-100))]
      );
      return res.json({ ok:true, request:item });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to submit customer request.' });
    }
  });

  app.post('/yardpatrol/portal/request-status', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Portal database is not configured.' });
    try {
      const code = String(req.body?.accessCode || '');
      const requestID = String(req.body?.requestID || '').trim().slice(0,80);
      const status = String(req.body?.status || '').trim().toLowerCase();
      if (!validCode(code) || !requestID || !['pending','handled','declined'].includes(status)) {
        return res.status(400).json({ error:'Valid access code, request ID, and status are required.' });
      }
      const current = await pool.query(
        'SELECT id,customer_requests FROM yardpatrol_portals WHERE access_hash=$1 LIMIT 1',
        [hashAccessCode(code)]
      );
      if (!current.rowCount) return res.status(401).json({ error:'That Yard Patrol access code was not recognized.' });
      const requests = Array.isArray(current.rows[0].customer_requests) ? current.rows[0].customer_requests : [];
      let found = false;
      for (const item of requests) {
        if (String(item?.id || '') === requestID) {
          item.status = status;
          item.updatedAt = new Date().toISOString();
          found = true;
        }
      }
      if (!found) return res.status(404).json({ error:'Customer request was not found.' });
      await pool.query(
        'UPDATE yardpatrol_portals SET customer_requests=$2::jsonb, updated_at=NOW() WHERE id=$1',
        [current.rows[0].id,JSON.stringify(requests)]
      );
      return res.json({ ok:true, status });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to update customer request.' });
    }
  });

  return { configured:Boolean(pool) };
}
