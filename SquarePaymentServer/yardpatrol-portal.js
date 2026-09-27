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
  const bytes = crypto.randomBytes(12);
  let raw = '';
  for (let i = 0; i < 12; i += 1) raw += ACCESS_ALPHABET[bytes[i] % ACCESS_ALPHABET.length];
  return 'YP-' + raw.slice(0,4) + '-' + raw.slice(4,8) + '-' + raw.slice(8,12);
}

function secureEqual(a='', b='') {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && aa.length > 0 && crypto.timingSafeEqual(aa, bb);
}

export function installYardPatrolPortalRoutes(app) {
  const databaseURL = String(process.env.DATABASE_URL || '').trim();
  const adminKey = String(process.env.YARDPATROL_ADMIN_KEY || '').trim();
  const pool = databaseURL ? new Pool({
    connectionString: databaseURL,
    ssl: databaseURL.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000
  }) : null;

  function requireAdmin(req,res,next) {
    const auth = String(req.headers.authorization || '');
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!adminKey || !secureEqual(token, adminKey)) {
      return res.status(401).json({ error:'Owner/Admin authorization is required.' });
    }
    next();
  }

  async function ensureSchema() {
    if (!pool) return;
    await pool.query(
      "CREATE TABLE IF NOT EXISTS yardpatrol_portals (" +
      "id TEXT PRIMARY KEY, customer_id TEXT UNIQUE NOT NULL, access_hash TEXT UNIQUE NOT NULL, " +
      "snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, customer_requests JSONB NOT NULL DEFAULT '[]'::jsonb, " +
      "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"
    );
    await pool.query(
      "CREATE TABLE IF NOT EXISTS yardpatrol_leads (" +
      "id TEXT PRIMARY KEY, payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'new', " +
      "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"
    );
    await pool.query("CREATE INDEX IF NOT EXISTS yardpatrol_portals_access_hash_idx ON yardpatrol_portals(access_hash)");
    await pool.query("CREATE INDEX IF NOT EXISTS yardpatrol_leads_status_idx ON yardpatrol_leads(status)");
  }

  ensureSchema()
    .then(() => { if (pool) console.log('Yard Patrol portal schema is ready.'); })
    .catch(error => console.error('Yard Patrol portal schema setup failed:', error?.message || error));

  app.get('/yardpatrol/portal/health', async (_, res) => {
    if (!pool) return res.status(503).json({ ok:false, error:'Portal database is not configured.' });
    try {
      await pool.query('SELECT 1');
      return res.json({ ok:true, database:true, adminConfigured:Boolean(adminKey) });
    } catch {
      return res.status(503).json({ ok:false, error:'Portal database is not ready.' });
    }
  });

  app.post('/yardpatrol/portal/admin-sync', requireAdmin, async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Portal database is not configured.' });
    try {
      const customerID = String(req.body?.customerID || '').trim().slice(0,80);
      const snapshot = req.body?.snapshot;
      if (!customerID || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        return res.status(400).json({ error:'A valid customerID and snapshot are required.' });
      }

      const current = await pool.query('SELECT id FROM yardpatrol_portals WHERE customer_id=$1 LIMIT 1',[customerID]);
      if (current.rowCount) {
        await pool.query(
          'UPDATE yardpatrol_portals SET snapshot=$2::jsonb, updated_at=NOW() WHERE customer_id=$1',
          [customerID, JSON.stringify(snapshot)]
        );
        return res.json({ ok:true, created:false, customerID });
      }

      let accessCode = '';
      for (let attempt=0; attempt<5; attempt+=1) {
        const candidate = generateAccessCode();
        const exists = await pool.query('SELECT 1 FROM yardpatrol_portals WHERE access_hash=$1',[hashAccessCode(candidate)]);
        if (!exists.rowCount) { accessCode = candidate; break; }
      }
      if (!accessCode) return res.status(500).json({ error:'Unable to generate a unique customer access code.' });

      await pool.query(
        'INSERT INTO yardpatrol_portals(id,customer_id,access_hash,snapshot) VALUES($1,$2,$3,$4::jsonb)',
        [crypto.randomUUID(), customerID, hashAccessCode(accessCode), JSON.stringify(snapshot)]
      );
      return res.json({ ok:true, created:true, customerID, accessCode });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to sync customer portal.' });
    }
  });

  app.post('/yardpatrol/portal/admin-rotate', requireAdmin, async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Portal database is not configured.' });
    try {
      const customerID = String(req.body?.customerID || '').trim().slice(0,80);
      if (!customerID) return res.status(400).json({ error:'customerID is required.' });
      const accessCode = generateAccessCode();
      const result = await pool.query(
        'UPDATE yardpatrol_portals SET access_hash=$2, updated_at=NOW() WHERE customer_id=$1 RETURNING id',
        [customerID, hashAccessCode(accessCode)]
      );
      if (!result.rowCount) return res.status(404).json({ error:'Customer portal was not found.' });
      return res.json({ ok:true, customerID, accessCode });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to rotate customer access code.' });
    }
  });

  app.post('/yardpatrol/portal/admin-delete', requireAdmin, async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Portal database is not configured.' });
    try {
      const customerID = String(req.body?.customerID || '').trim().slice(0,80);
      if (!customerID) return res.status(400).json({ error:'customerID is required.' });
      const result = await pool.query('DELETE FROM yardpatrol_portals WHERE customer_id=$1',[customerID]);
      return res.json({ ok:true, deleted:result.rowCount>0 });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to delete customer portal.' });
    }
  });

  app.post('/yardpatrol/portal/login', async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Customer portal is temporarily unavailable.' });
    try {
      const code = normalizeAccessCode(req.body?.accessCode || '');
      if (code.length < 10 || code.length > 30) {
        return res.status(400).json({ error:'Enter a valid Yard Patrol access code.' });
      }
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
      const code = normalizeAccessCode(req.body?.accessCode || '');
      const type = String(req.body?.type || '').trim().slice(0,60);
      const payload = req.body?.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload) ? req.body.payload : {};
      if (code.length < 10 || !type) return res.status(400).json({ error:'Access code and request type are required.' });

      const current = await pool.query(
        'SELECT id,customer_requests FROM yardpatrol_portals WHERE access_hash=$1 LIMIT 1',
        [hashAccessCode(code)]
      );
      if (!current.rowCount) return res.status(401).json({ error:'That Yard Patrol access code was not recognized.' });

      const requests = Array.isArray(current.rows[0].customer_requests) ? current.rows[0].customer_requests : [];
      const item = {
        id:crypto.randomUUID(),
        type,
        payload,
        status:'pending',
        createdAt:new Date().toISOString()
      };
      requests.push(item);
      await pool.query(
        'UPDATE yardpatrol_portals SET customer_requests=$2::jsonb, updated_at=NOW() WHERE id=$1',
        [current.rows[0].id, JSON.stringify(requests.slice(-100))]
      );
      return res.json({ ok:true, request:item });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to submit customer request.' });
    }
  });

  app.get('/yardpatrol/portal/admin-requests', requireAdmin, async (_,res) => {
    if (!pool) return res.status(503).json({ error:'Portal database is not configured.' });
    try {
      const result = await pool.query(
        'SELECT customer_id,customer_requests,updated_at FROM yardpatrol_portals ' +
        'WHERE jsonb_array_length(customer_requests) > 0 ORDER BY updated_at DESC'
      );
      return res.json({
        ok:true,
        portals:result.rows.map(row => ({
          customerID:row.customer_id,
          requests:Array.isArray(row.customer_requests) ? row.customer_requests : [],
          updatedAt:row.updated_at
        }))
      });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to load customer requests.' });
    }
  });

  app.post('/yardpatrol/portal/admin-request-status', requireAdmin, async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Portal database is not configured.' });
    try {
      const customerID = String(req.body?.customerID || '').trim().slice(0,80);
      const requestID = String(req.body?.requestID || '').trim().slice(0,80);
      const status = String(req.body?.status || '').trim().toLowerCase();
      if (!customerID || !requestID || !['pending','handled','declined'].includes(status)) {
        return res.status(400).json({ error:'Valid customerID, requestID, and status are required.' });
      }
      const current = await pool.query('SELECT customer_requests FROM yardpatrol_portals WHERE customer_id=$1 LIMIT 1',[customerID]);
      if (!current.rowCount) return res.status(404).json({ error:'Customer portal was not found.' });
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
        'UPDATE yardpatrol_portals SET customer_requests=$2::jsonb, updated_at=NOW() WHERE customer_id=$1',
        [customerID, JSON.stringify(requests)]
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
    const existing = leadRate.get(key) || [];
    const recent = existing.filter(ts => now - ts < 60 * 60 * 1000);
    if (recent.length >= 8) return false;
    recent.push(now);
    leadRate.set(key,recent);
    return true;
  }

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
      const dogCount = Math.max(1, Math.min(20, Number.parseInt(req.body?.dogCount,10) || 1));
      const notes = String(req.body?.notes || '').trim().slice(0,1200);
      if (!fullName || !serviceAddress || !city || !state || (!phone && !email)) {
        return res.status(400).json({ error:'Name, service address, city, state, and a phone or email are required.' });
      }
      if (email && !email.includes('@')) return res.status(400).json({ error:'Enter a valid email address.' });

      const id = crypto.randomUUID();
      const payload = {fullName,serviceAddress,city,state,zip,phone,email,plan,dogCount,notes,source:'Yard Patrol App'};
      await pool.query(
        'INSERT INTO yardpatrol_leads(id,payload,status) VALUES($1,$2::jsonb,$3)',
        [id,JSON.stringify(payload),'new']
      );
      return res.json({ ok:true, requestID:id });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to submit service request.' });
    }
  });

  app.get('/yardpatrol/leads', requireAdmin, async (_,res) => {
    if (!pool) return res.status(503).json({ error:'Portal database is not configured.' });
    try {
      const result = await pool.query(
        'SELECT id,payload,status,created_at,updated_at FROM yardpatrol_leads ORDER BY created_at DESC LIMIT 250'
      );
      return res.json({ ok:true, leads:result.rows });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to load service requests.' });
    }
  });

  app.post('/yardpatrol/leads/status', requireAdmin, async (req,res) => {
    if (!pool) return res.status(503).json({ error:'Portal database is not configured.' });
    try {
      const id = String(req.body?.id || '').trim().slice(0,80);
      const status = String(req.body?.status || '').trim().toLowerCase();
      if (!id || !['new','contacted','approved','declined'].includes(status)) {
        return res.status(400).json({ error:'Valid lead ID and status are required.' });
      }
      const result = await pool.query(
        'UPDATE yardpatrol_leads SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING id',
        [id,status]
      );
      if (!result.rowCount) return res.status(404).json({ error:'Service request was not found.' });
      return res.json({ ok:true, status });
    } catch (error) {
      return res.status(500).json({ error:error?.message || 'Unable to update service request.' });
    }
  });

  return { configured:Boolean(pool && adminKey) };
}
