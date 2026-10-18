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
