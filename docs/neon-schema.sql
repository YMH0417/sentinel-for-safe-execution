-- Sentinel product DB for Neon (Postgres)
-- Free tier: single project, use @neondatabase/serverless from Vercel API routes

-- Agent / swap lifecycle (replaces events.jsonl)
CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  timestamp_ms  BIGINT NOT NULL,
  event_type    TEXT NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  source        TEXT NOT NULL DEFAULT 'sentinel-backend',
  chain_mode    TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);

-- All settlements (replaces trade-ledger.json trades[])
CREATE TABLE IF NOT EXISTS ledger_trades (
  id              TEXT PRIMARY KEY,
  user_address    TEXT NOT NULL,
  route_id        TEXT NOT NULL,
  execution_mode  TEXT NOT NULL CHECK (execution_mode IN ('router', 'direct', 'sda')),
  safety_mode     TEXT NOT NULL CHECK (safety_mode IN ('safe', 'force')),
  pool_label      TEXT,
  token_in        TEXT NOT NULL,
  token_out       TEXT NOT NULL,
  amount_in       DOUBLE PRECISION NOT NULL,
  amount_out      DOUBLE PRECISION,
  tx_hash         TEXT NOT NULL UNIQUE,
  block_number    BIGINT,
  agent_decision  TEXT,
  recorded_at_ms  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_trades_user ON ledger_trades (user_address, recorded_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_trades_tx ON ledger_trades (tx_hash);

-- Vault-gated checks only (replaces checkedTrades{})
CREATE TABLE IF NOT EXISTS ledger_checked_trades (
  tx_hash         TEXT PRIMARY KEY REFERENCES ledger_trades (tx_hash) ON DELETE CASCADE,
  trade_id        TEXT NOT NULL REFERENCES ledger_trades (id) ON DELETE CASCADE,
  user_address    TEXT NOT NULL,
  block_number    BIGINT,
  recorded_at_ms  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checked_user ON ledger_checked_trades (user_address);

-- Optional materialized stats; can also compute from trades + checked_trades
CREATE VIEW ledger_user_stats AS
SELECT
  t.user_address,
  COUNT(*)::int AS trade_count,
  COUNT(c.tx_hash)::int AS check_count,
  COUNT(*) FILTER (WHERE t.safety_mode = 'safe' AND t.execution_mode = 'router')::int AS safe_trade_count,
  COALESCE(SUM(t.amount_in) FILTER (WHERE t.token_in = 'USDC'), 0) AS usdc_volume_human
FROM ledger_trades t
LEFT JOIN ledger_checked_trades c ON c.tx_hash = t.tx_hash
GROUP BY t.user_address;

-- Pool volume dashboard: aggregate last N trades by label (app layer or SQL)
-- Example query for API:
-- SELECT pool_label, SUM(amount_in) FILTER (WHERE token_in = 'USDC'), COUNT(*)
-- FROM (
--   SELECT * FROM ledger_trades ORDER BY recorded_at_ms DESC LIMIT 100
-- ) recent
-- GROUP BY pool_label;
