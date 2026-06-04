import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { query } from "../db/client";

export const queryTransactions = createTool({
  id: "query_transactions",
  description: `Query and aggregate the user's financial transactions.
Use this for any question about spending, merchants, categories, or transaction history.
Handles refunds (negative amounts reduce net spend), excludes transfers by default.`,

  inputSchema: z.object({
    snapshot_id: z.string().describe("Which dataset to query: sample_a, sample_b, or sample_c"),
    category: z.string().optional().describe("Filter by category e.g. food, health, travel"),
    merchant_query: z.string().optional().describe("Partial merchant name e.g. swiggy, apollo"),
    date_from: z.string().optional().describe("Start date YYYY-MM-DD"),
    date_to: z.string().optional().describe("End date YYYY-MM-DD"),
    aggregate: z.enum([
      "sum",
      "count",
      "top_merchants",
      "monthly_breakdown",
      "category_breakdown",
      ""
    ]).optional().describe("How to aggregate results"),
    limit: z.union([z.number(), z.string()]).optional().describe("Max rows to return."),
  }),

  execute: async (input) => {
    const context = input.context ?? input;
    const {
      snapshot_id,
      category,
      merchant_query,
      date_from,
      date_to,
      aggregate,
      limit,
    } = context;

    const rawLimit = limit ?? 10;
    const effectiveLimit = typeof rawLimit === "string" ? parseInt(rawLimit, 10) : rawLimit;
    const excludeTransfers = true;

    // Build WHERE conditions
    const conditions: string[] = ["snapshot_id = $1"];
    const params: unknown[] = [snapshot_id];
    let paramIndex = 2;

    if (excludeTransfers) {
      conditions.push(`category != 'transfer'`);
    }

    if (category) {
      conditions.push(`category ILIKE $${paramIndex}`);
      params.push(`%${category}%`);
      paramIndex++;
    }

    if (merchant_query) {
      conditions.push(
        `(merchant ILIKE $${paramIndex} OR merchant_canonical ILIKE $${paramIndex})`
      );
      params.push(`%${merchant_query}%`);
      paramIndex++;
    }

    if (date_from) {
      conditions.push(`date >= $${paramIndex}`);
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      conditions.push(`date <= $${paramIndex}`);
      params.push(date_to);
      paramIndex++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    // ── Aggregate: sum (net spend after refunds) ──────────────────────────
    if (aggregate === "sum") {
      const res = await query(
        `SELECT 
          COALESCE(SUM(amount), 0) AS total,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS gross,
          COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) AS refunds,
          COUNT(*) AS transaction_count
         FROM transactions ${where}`,
        params
      );
      const row = res.rows[0];
      return {
        total_net: parseFloat(row.total),
        gross_spend: parseFloat(row.gross),
        refunds: parseFloat(row.refunds),
        transaction_count: parseInt(row.transaction_count),
      };
    }

    // ── Aggregate: top merchants ──────────────────────────────────────────
    if (aggregate === "top_merchants") {
      const res = await query(
        `SELECT 
          merchant_canonical,
          SUM(amount) AS net_spend,
          COUNT(*) AS txn_count
         FROM transactions ${where}
         GROUP BY merchant_canonical
         ORDER BY SUM(amount) DESC
         LIMIT $${paramIndex}`,
        [...params, effectiveLimit]
      );
      return {
        merchants: res.rows.map((r) => ({
          merchant: r.merchant_canonical,
          net_spend: parseFloat(r.net_spend),
          transaction_count: parseInt(r.txn_count),
        })),
      };
    }

    // ── Aggregate: monthly breakdown ──────────────────────────────────────
    if (aggregate === "monthly_breakdown") {
      const res = await query(
        `SELECT 
          TO_CHAR(date, 'YYYY-MM') AS month,
          SUM(amount) AS net_spend,
          COUNT(*) AS txn_count
         FROM transactions ${where}
         GROUP BY TO_CHAR(date, 'YYYY-MM')
         ORDER BY month`,
        params
      );
      return {
        monthly: res.rows.map((r) => ({
          month: r.month,
          net_spend: parseFloat(r.net_spend),
          transaction_count: parseInt(r.txn_count),
        })),
      };
    }

    // ── Aggregate: category breakdown ─────────────────────────────────────
    if (aggregate === "category_breakdown") {
      const res = await query(
        `SELECT 
          category,
          SUM(amount) AS net_spend,
          COUNT(*) AS txn_count
         FROM transactions ${where}
         GROUP BY category
         ORDER BY SUM(amount) DESC`,
        params
      );
      return {
        categories: res.rows.map((r) => ({
          category: r.category,
          net_spend: parseFloat(r.net_spend),
          transaction_count: parseInt(r.txn_count),
        })),
      };
    }

    // ── Default: list transactions ────────────────────────────────────────
    const res = await query(
      `SELECT id, date, merchant, merchant_canonical, category, amount, currency, memo
       FROM transactions ${where}
       ORDER BY date DESC
       LIMIT $${paramIndex}`,
      [...params, effectiveLimit]
    );

    if (res.rows.length === 0) {
      return { found: false, message: "No transactions found matching the criteria." };
    }

    return {
      found: true,
      transactions: res.rows.map((r) => ({
        id: r.id,
        date: r.date,
        merchant: r.merchant,
        category: r.category,
        amount: parseFloat(r.amount),
        currency: r.currency,
        memo: r.memo,
      })),
      count: res.rows.length,
    };
  },
});