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
    await pool.query(
      "CREATE TABLE IF NOT EXISTS yardpatrol_business (" +
      "business_id TEXT PRIMARY KEY, inbox_hash TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
    await pool.query("ALTER TABLE yardpatrol_business ADD COLUMN IF NOT EXISTS owner_recovery_used BOOLEAN NOT NULL DEFAULT FALSE");
    await pool.query("ALTER TABLE yardpatrol_business ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
    await pool.query(
      "CREATE TABLE IF NOT EXISTS yardpatrol_leads (" +
      "id TEXT PRIMARY KEY, payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'new', " +
      "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
    await pool.query("CREATE INDEX IF NOT EXISTS yardpatrol_leads_status_idx ON yardpatrol_leads(status)");
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

  const leadRate = new Map();

  function allowLeadRequest(req) {
    const now = Date.now();
    const key = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const prior = leadRate.get(key) || [];
    const recent = prior.filter(ts => now - ts < 60 * 60 * 1000);
    if (recent.length >= 8) return false;
    recent.push(now);
    leadRate.set(key,recent);
    return true;
  }

  async function validateInboxCode(code) {
    if (!validCode(code)) return false;
    const result = await pool.query(
      'SELECT inbox_hash FROM yardpatrol_business WHERE business_id=$1 LIMIT 1',
      ['yardpatrol-v2']
    );
    return result.rowCount > 0 && result.rows[0].inbox_hash === hashAccessCode(code);
  }

  app.post('/yardpatrol/inbox/recover-owner', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Owner recovery is unavailable.' });
    try {
      const token = String(req.body?.migrationToken || '');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      if (!token || tokenHash !== 'cecd719801303dfde67448df7c54a069db389e9b09db5fb4e3fdb4eab632fc71') {
        return res.status(401).json({ error:'Owner recovery was not authorized.' });
      }

      await pool.query('ALTER TABLE yardpatrol_business ADD COLUMN IF NOT EXISTS owner_recovery_used BOOLEAN NOT NULL DEFAULT FALSE');
      const current = await pool.query(
        'SELECT owner_recovery_used FROM yardpatrol_business WHERE business_id=$1 LIMIT 1',
        ['yardpatrol-v2']
      );
      if (!current.rowCount) return res.status(404).json({ error:'Yard Patrol owner inbox was not found.' });
      if (current.rows[0].owner_recovery_used) {
        return res.status(409).json({ error:'Owner recovery has already been completed.' });
      }

      const inboxCode = generateAccessCode();
      await pool.query(
        'UPDATE yardpatrol_business SET inbox_hash=$2, owner_recovery_used=TRUE, updated_at=NOW() WHERE business_id=$1 AND owner_recovery_used=FALSE',
        ['yardpatrol-v2',hashAccessCode(inboxCode)]
      );
      return res.json({ ok:true, inboxCode });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to recover owner access.' });
    }
  });

  app.post('/yardpatrol/inbox/sync', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Service request inbox is unavailable.' });
    try {
      const supplied = String(req.body?.inboxCode || '');
      const current = await pool.query(
        'SELECT inbox_hash,owner_recovery_used FROM yardpatrol_business WHERE business_id=$1 LIMIT 1',
        ['yardpatrol-v2']
      );
      if (current.rowCount) {
        const validExisting = validCode(supplied) && current.rows[0].inbox_hash === hashAccessCode(supplied);
        if (!validExisting) {
          const recoveryHash = crypto.createHash('sha256').update(supplied).digest('hex');
          const validRecovery =
            recoveryHash === '9d55d9408d294d8d71a021b2ff471ad8a6edfbd5317c580e2cef08b836faedc4' &&
            !current.rows[0].owner_recovery_used;

          if (!validRecovery) {
            return res.status(401).json({ error:'The Yard Patrol inbox code does not match.' });
          }

          const permanentCode = generateAccessCode();
          await pool.query(
            'UPDATE yardpatrol_business SET inbox_hash=$2,owner_recovery_used=TRUE,updated_at=NOW() WHERE business_id=$1 AND owner_recovery_used=FALSE',
            ['yardpatrol-v2',hashAccessCode(permanentCode)]
          );
          return res.json({ ok:true, created:false, recovered:true, inboxCode:permanentCode });
        }
        return res.json({ ok:true, created:false });
      }
      const inboxCode = validCode(supplied) ? supplied : generateAccessCode();
      await pool.query(
        'INSERT INTO yardpatrol_business(business_id,inbox_hash) VALUES($1,$2)',
        ['yardpatrol-v2',hashAccessCode(inboxCode)]
      );
      return res.json({ ok:true, created:true, inboxCode });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to initialize the service request inbox.' });
    }
  });

  app.post('/yardpatrol/leads', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Service requests are temporarily unavailable.' });
    if (!allowLeadRequest(req)) return res.status(429).json({ error:'Too many requests. Please try again later.' });
    try {
      const fullName = String(req.body?.fullName || '').trim().slice(0,120);
      const serviceAddress = String(req.body?.serviceAddress || '').trim().slice(0,180);
      const city = String(req.body?.city || '').trim().slice(0,80);
      const state = String(req.body?.state || '').trim().slice(0,40);
      const zip = String(req.body?.zip || '').trim().slice(0,20);
      const phone = String(req.body?.phone || '').trim().slice(0,40);
      const email = String(req.body?.email || '').trim().slice(0,254);
      const plan = String(req.body?.plan || '').trim().slice(0,60);
      const dogCount = Math.max(1,Math.min(20,Number.parseInt(req.body?.dogCount,10) || 1));
      const notes = String(req.body?.notes || '').trim().slice(0,1200);
      if (!fullName || !serviceAddress || !city || !state || (!phone && !email)) {
        return res.status(400).json({ error:'Name, service address, city, state, and a phone or email are required.' });
      }
      if (email && !email.includes('@')) return res.status(400).json({ error:'Enter a valid email address.' });
      const id = crypto.randomUUID();
      const payload = {fullName,serviceAddress,city,state,zip,phone,email,plan,dogCount,notes,source:String(req.body?.source || 'Yard Patrol').slice(0,80)};
      await pool.query(
        'INSERT INTO yardpatrol_leads(id,payload,status) VALUES($1,$2::jsonb,$3)',
        [id,JSON.stringify(payload),'new']
      );
      return res.json({ ok:true, requestID:id });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to submit service request.' });
    }
  });

  app.post('/yardpatrol/inbox/leads', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Service request inbox is unavailable.' });
    try {
      const code = String(req.body?.inboxCode || '');
      if (!(await validateInboxCode(code))) {
        return res.status(401).json({ error:'The Yard Patrol inbox code was not recognized.' });
      }
      const result = await pool.query(
        'SELECT id,payload,status,created_at,updated_at FROM yardpatrol_leads ORDER BY created_at DESC LIMIT 250'
      );
      return res.json({ ok:true, leads:result.rows });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to load service requests.' });
    }
  });

  app.post('/yardpatrol/inbox/lead-status', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Service request inbox is unavailable.' });
    try {
      const code = String(req.body?.inboxCode || '');
      const id = String(req.body?.id || '').trim().slice(0,80);
      const status = String(req.body?.status || '').trim().toLowerCase();
      if (!(await validateInboxCode(code))) {
        return res.status(401).json({ error:'The Yard Patrol inbox code was not recognized.' });
      }
      if (!id || !['new','contacted','approved','declined'].includes(status)) {
        return res.status(400).json({ error:'Valid request ID and status are required.' });
      }
      const result = await pool.query(
        'UPDATE yardpatrol_leads SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING id',
        [id,status]
      );
      if (!result.rowCount) return res.status(404).json({ error:'Service request was not found.' });
      return res.json({ ok:true, status });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to update service request.' });
    }
  });

  return { configured:Boolean(pool) };
}
