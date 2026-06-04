import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { query } from "../db/client";

export const detectRecurring = createTool({
  id: "detect_recurring",
  description: `Detect merchants that appear to be recurring subscriptions or regular payments.
Use this when the user asks about subscriptions, recurring charges, or regular payments.
A merchant is considered recurring if it appears in 3 or more distinct months.`,

  inputSchema: z.object({
    snapshot_id: z.string().describe("Which dataset to query: sample_a, sample_b, or sample_c"),
    min_months: z.union([z.number(), z.string()]).default(3).describe("Minimum distinct months to qualify as recurring."),
  }),

  execute: async (input) => {
    const context = input.context ?? input;
    const { snapshot_id, min_months } = context;
    const effectiveMinMonths = typeof min_months === "string" ? parseInt(min_months, 10) : min_months;

    const res = await query(
      `SELECT 
        merchant_canonical,
        COUNT(DISTINCT TO_CHAR(date, 'YYYY-MM')) AS months_present,
        COUNT(*) AS total_transactions,
        ROUND(AVG(amount)::numeric, 2) AS avg_amount,
        ROUND(SUM(amount)::numeric, 2) AS total_spent,
        MIN(date) AS first_seen,
        MAX(date) AS last_seen
       FROM transactions
       WHERE snapshot_id = $1
         AND category != 'transfer'
         AND amount > 0
       GROUP BY merchant_canonical
       HAVING COUNT(DISTINCT TO_CHAR(date, 'YYYY-MM')) >= $2
       ORDER BY months_present DESC, total_spent DESC`,
      [snapshot_id, effectiveMinMonths]
    );

    if (res.rows.length === 0) {
      return {
        found: false,
        message: "No recurring merchants found with the specified criteria.",
      };
    }

    return {
      found: true,
      recurring_merchants: res.rows.map((r) => ({
        merchant: r.merchant_canonical,
        months_present: parseInt(r.months_present),
        total_transactions: parseInt(r.total_transactions),
        avg_amount: parseFloat(r.avg_amount),
        total_spent: parseFloat(r.total_spent),
        first_seen: r.first_seen,
        last_seen: r.last_seen,
      })),
      count: res.rows.length,
    };
  },
});