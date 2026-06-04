import * as dotenv from "dotenv";
dotenv.config();
import { query } from "../src/db/client";

async function test() {
  try {
    const res = await query(
      `SELECT category, SUM(amount) as total 
       FROM transactions 
       WHERE snapshot_id = 'sample_a' 
         AND category ILIKE '%food%'
         AND date >= '2025-03-01' 
         AND date <= '2025-03-31'
       GROUP BY category`,
      []
    );
    console.log("Result:", res.rows);
    process.exit(0);
  } catch (err) {
    console.error("DB Error:", err);
    process.exit(1);
  }
}

test();