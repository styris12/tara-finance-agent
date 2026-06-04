import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { pool } from "../src/db/client";

dotenv.config();

// ─── Merchant Canonicalization ───────────────────────────────────────────────
// No hardcoding — works programmatically on any merchant name
function canonicalizeMerchant(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")  // remove special chars
    .replace(/\s+/g, " ")           // collapse spaces
    .trim()
    .split(" ")[0];                  // first significant token is canonical root
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Transaction {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  currency: string;
  memo: string;
}

interface NavPoint {
  date: string;
  value: number;
}

interface Fund {
  id: string;
  name: string;
  category: string;
  nav: NavPoint[];
}

interface Holding {
  fund_id: string;
  fund_name: string;
  units: number;
  purchase_date: string;
  purchase_nav: number;
}

// ─── Main Ingest ──────────────────────────────────────────────────────────────
async function ingest() {
  const dataDir = process.env.DATA_DIR;
  if (!dataDir) {
    console.error("ERROR: DATA_DIR environment variable is not set.");
    console.error("Usage: DATA_DIR=./data/sample_a npx tsx scripts/ingest.ts");
    process.exit(1);
  }

  const snapshotId = path.basename(dataDir); // e.g. "sample_a"
  console.log(`\n Ingesting snapshot: ${snapshotId} from ${dataDir}\n`);

  // ─── Read JSON files ───────────────────────────────────────────────────────
  const transactions: Transaction[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "transactions.json"), "utf-8")
  );
  const funds: Fund[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "funds.json"), "utf-8")
  );
  const holdings: Holding[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "holdings.json"), "utf-8")
  );

  console.log(`  transactions: ${transactions.length} rows`);
  console.log(`  funds:        ${funds.length} records`);
  console.log(`  holdings:     ${holdings.length} records`);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ─── Clear existing data for this snapshot (idempotent) ─────────────────
    await client.query("DELETE FROM holdings WHERE snapshot_id = $1", [snapshotId]);
    await client.query("DELETE FROM fund_nav WHERE snapshot_id = $1", [snapshotId]);
    await client.query("DELETE FROM funds WHERE snapshot_id = $1", [snapshotId]);
    await client.query("DELETE FROM transactions WHERE snapshot_id = $1", [snapshotId]);
    console.log(`\n  Cleared existing data for snapshot: ${snapshotId}`);

    // ─── Insert transactions ─────────────────────────────────────────────────
    console.log("\n  Inserting transactions...");
    for (const txn of transactions) {
      const canonical = canonicalizeMerchant(txn.merchant);
      await client.query(
        `INSERT INTO transactions 
          (id, date, merchant, merchant_canonical, category, amount, currency, memo, snapshot_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id, snapshot_id) DO UPDATE SET
           merchant_canonical = EXCLUDED.merchant_canonical,
           snapshot_id = EXCLUDED.snapshot_id`,
        [
          txn.id,
          txn.date,
          txn.merchant,
          canonical,
          txn.category,
          txn.amount,
          txn.currency || "INR",
          txn.memo || null,
          snapshotId,
        ]
      );
    }
    console.log(`  Inserted ${transactions.length} transactions`);

    // ─── Insert funds + NAV history ──────────────────────────────────────────
    console.log("\n  Inserting funds and NAV history...");
    for (const fund of funds) {
      await client.query(
        `INSERT INTO funds (id, name, category, snapshot_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id, snapshot_id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category`,
        [fund.id, fund.name, fund.category || null, snapshotId]
      );

      // Insert each NAV point
      for (const navPoint of fund.nav) {
        await client.query(
          `INSERT INTO fund_nav (fund_id, snapshot_id, date, value)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (fund_id, snapshot_id, date) DO UPDATE SET
             value = EXCLUDED.value`,
          [fund.id, snapshotId, navPoint.date, navPoint.value]
        );
      }
    }
    console.log(`  Inserted ${funds.length} funds with NAV history`);

    // ─── Insert holdings ─────────────────────────────────────────────────────
    console.log("\n  Inserting holdings...");
    for (const holding of holdings) {
      await client.query(
        `INSERT INTO holdings 
          (fund_id, fund_name, units, purchase_date, purchase_nav, snapshot_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          holding.fund_id,
          holding.fund_name,
          holding.units,
          holding.purchase_date,
          holding.purchase_nav,
          snapshotId,
        ]
      );
    }
    console.log(`  Inserted ${holdings.length} holdings`);

    await client.query("COMMIT");
    console.log(`\n Snapshot ${snapshotId} ingested successfully!\n`);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n Ingest failed, rolled back:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

ingest();