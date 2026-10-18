-- Staging queue for signed, independently verified Square payment events.
-- No card data or customer details are persisted in this table.
CREATE TABLE IF NOT EXISTS payment_events (
  payment_id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('VERIFIED_PENDING','SETTLED')),
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_events_status ON payment_events(status,received_at);

-- Per-IP (hashed) customer inquiry throttling in Cloudflare D1.
CREATE TABLE IF NOT EXISTS yardpatrol_lead_limits (client_hash TEXT NOT NULL, hour_bucket INTEGER NOT NULL, requests INTEGER NOT NULL, PRIMARY KEY(client_hash,hour_bucket));

-- SMS duplicates suppressed durably; ambiguous CLAIMED status requires reconciliation.
CREATE TABLE IF NOT EXISTS notification_deliveries (
 payment_id TEXT NOT NULL,
 channel TEXT NOT NULL CHECK (channel IN ('sms')),
 status TEXT NOT NULL CHECK (status IN ('CLAIMED','SENT')),
 provider_message_id TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER,
 PRIMARY KEY(payment_id,channel)
);
