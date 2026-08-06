-- Sentinel product DB (Neon Postgres) — idempotent bootstrap

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  timestamp_ms   BIGINT NOT NULL,
  event_type     TEXT NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  source         TEXT NOT NULL DEFAULT 'sentinel-backend',
  chain_mode     TEXT,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (event_type);

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

CREATE TABLE IF NOT EXISTS ledger_checked_trades (
  tx_hash         TEXT PRIMARY KEY REFERENCES ledger_trades (tx_hash) ON DELETE CASCADE,
  trade_id        TEXT NOT NULL REFERENCES ledger_trades (id) ON DELETE CASCADE,
  user_address    TEXT NOT NULL,
  block_number    BIGINT,
  recorded_at_ms  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checked_user ON ledger_checked_trades (user_address);

CREATE TABLE IF NOT EXISTS app_settings (
  key            TEXT PRIMARY KEY,
  value          JSONB NOT NULL,
  updated_at_ms  BIGINT NOT NULL
);
