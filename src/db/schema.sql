-- Tara Finance Agent — PostgreSQL Schema
-- Run with: psql -U postgres -p 5433 -d tara_finance -f src/db/schema.sql

-- Drop tables if they exist 
DROP TABLE IF EXISTS holdings;
DROP TABLE IF EXISTS fund_nav;
DROP TABLE IF EXISTS funds;
DROP TABLE IF EXISTS transactions;

-- Transactions table
CREATE TABLE transactions (
  id TEXT NOT NULL,
  date DATE NOT NULL,
  merchant TEXT NOT NULL,
  merchant_canonical TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  memo TEXT,
  snapshot_id TEXT NOT NULL,
  PRIMARY KEY (id, snapshot_id)
);

CREATE INDEX idx_txn_date ON transactions(date);
CREATE INDEX idx_txn_category ON transactions(category);
CREATE INDEX idx_txn_merchant_canonical ON transactions(merchant_canonical);
CREATE INDEX idx_txn_snapshot ON transactions(snapshot_id);

-- Funds table
CREATE TABLE funds (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  snapshot_id TEXT NOT NULL,
  PRIMARY KEY (id, snapshot_id)
);

-- Fund NAV history 
CREATE TABLE fund_nav (
  fund_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  date DATE NOT NULL,
  value NUMERIC(12,4) NOT NULL,
  PRIMARY KEY (fund_id, snapshot_id, date)
);

CREATE INDEX idx_nav_fund_date ON fund_nav(fund_id, snapshot_id, date);

-- Holdings table
CREATE TABLE holdings (
  id SERIAL PRIMARY KEY,
  fund_id TEXT NOT NULL,
  fund_name TEXT NOT NULL,
  units NUMERIC(12,4) NOT NULL,
  purchase_date DATE NOT NULL,
  purchase_nav NUMERIC(12,4) NOT NULL,
  snapshot_id TEXT NOT NULL
);

CREATE INDEX idx_holdings_fund ON holdings(fund_id, snapshot_id);
CREATE INDEX idx_holdings_snapshot ON holdings(snapshot_id);
