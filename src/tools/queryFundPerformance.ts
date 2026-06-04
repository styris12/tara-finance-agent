import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { query } from "../db/client";

export const queryFundPerformance = createTool({
  id: "query_fund_performance",
  description: `Query mutual fund NAV history and calculate period returns.
Use this for questions about how a fund performed between two dates, 
ranking funds by return, or looking up NAV at a specific date.
This is the FUND's return, not the user's personal return on their holding.`,

  inputSchema: z.object({
    snapshot_id: z.string().describe("Which dataset to query: sample_a, sample_b, or sample_c"),
    fund_name_query: z.string().optional().describe("Partial fund name to search e.g. saffron, bluechip"),
    fund_id: z.string().optional().describe("Exact fund ID if known"),
    date_from: z.string().optional().describe("Start date for period return YYYY-MM-DD"),
    date_to: z.string().optional().describe("End date for period return YYYY-MM-DD"),
    mode: z.enum([
      "period_return",
      "nav_at_date",
      "rank_all",
      "list_funds"
    ]).describe("What to compute"),
  }),

  execute: async (input) => {
    const context = input.context ?? input;
    const { snapshot_id, fund_name_query, fund_id, date_from, date_to, mode } = context;

    // ── List all funds ────────────────────────────────────────────────────
    if (mode === "list_funds") {
      const res = await query(
        `SELECT id, name, category FROM funds WHERE snapshot_id = $1 ORDER BY name`,
        [snapshot_id]
      );
      return {
        funds: res.rows,
        count: res.rows.length,
      };
    }

    // ── NAV at a specific date ────────────────────────────────────────────
    if (mode === "nav_at_date") {
      const fundCondition = fund_id
        ? `f.id = $2`
        : `f.name ILIKE $2`;
      const fundParam = fund_id ? fund_id : `%${fund_name_query}%`;
      const targetDate = date_from || date_to;

      if (!targetDate) {
        return { error: "date_from or date_to required for nav_at_date mode" };
      }

      // Get closest NAV on or before the target date
      const res = await query(
        `SELECT f.id, f.name, fn.date, fn.value
         FROM funds f
         JOIN fund_nav fn ON fn.fund_id = f.id AND fn.snapshot_id = f.snapshot_id
         WHERE f.snapshot_id = $1
           AND ${fundCondition}
           AND fn.date <= $3
         ORDER BY fn.date DESC
         LIMIT 1`,
        [snapshot_id, fundParam, targetDate]
      );

      if (res.rows.length === 0) {
        return { found: false, message: `No NAV data found for the specified fund and date.` };
      }

      const row = res.rows[0];
      return {
        found: true,
        fund_id: row.id,
        fund_name: row.name,
        nav_date: row.date,
        nav_value: parseFloat(row.value),
      };
    }

    // ── Period return for one fund ─────────────────────────────────────────
    if (mode === "period_return") {
      if (!date_from || !date_to) {
        return { error: "date_from and date_to are required for period_return mode" };
      }

      const fundCondition = fund_id ? `f.id = $2` : `f.name ILIKE $2`;
      const fundParam = fund_id ? fund_id : `%${fund_name_query}%`;

      // Get NAV at start and end dates (closest available)
      const startRes = await query(
        `SELECT fn.value, fn.date
         FROM funds f
         JOIN fund_nav fn ON fn.fund_id = f.id AND fn.snapshot_id = f.snapshot_id
         WHERE f.snapshot_id = $1 AND ${fundCondition} AND fn.date <= $3
         ORDER BY fn.date DESC LIMIT 1`,
        [snapshot_id, fundParam, date_from]
      );

      const endRes = await query(
        `SELECT fn.value, fn.date, f.id, f.name
         FROM funds f
         JOIN fund_nav fn ON fn.fund_id = f.id AND fn.snapshot_id = f.snapshot_id
         WHERE f.snapshot_id = $1 AND ${fundCondition} AND fn.date <= $3
         ORDER BY fn.date DESC LIMIT 1`,
        [snapshot_id, fundParam, date_to]
      );

      if (startRes.rows.length === 0 || endRes.rows.length === 0) {
        return { found: false, message: "Insufficient NAV data for the requested date range." };
      }

      const navStart = parseFloat(startRes.rows[0].value);
      const navEnd = parseFloat(endRes.rows[0].value);
      const periodReturn = ((navEnd - navStart) / navStart) * 100;

      return {
        found: true,
        fund_id: endRes.rows[0].id,
        fund_name: endRes.rows[0].name,
        nav_start: navStart,
        nav_start_date: startRes.rows[0].date,
        nav_end: navEnd,
        nav_end_date: endRes.rows[0].date,
        period_return_pct: parseFloat(periodReturn.toFixed(2)),
      };
    }

    // ── Rank all funds by period return ───────────────────────────────────
    if (mode === "rank_all") {
      if (!date_from || !date_to) {
        return { error: "date_from and date_to required for rank_all mode" };
      }

      const fundsRes = await query(
        `SELECT id, name FROM funds WHERE snapshot_id = $1`,
        [snapshot_id]
      );

      const results = [];

      for (const fund of fundsRes.rows) {
        const startRes = await query(
          `SELECT value FROM fund_nav 
           WHERE fund_id = $1 AND snapshot_id = $2 AND date <= $3
           ORDER BY date DESC LIMIT 1`,
          [fund.id, snapshot_id, date_from]
        );

        const endRes = await query(
          `SELECT value FROM fund_nav 
           WHERE fund_id = $1 AND snapshot_id = $2 AND date <= $3
           ORDER BY date DESC LIMIT 1`,
          [fund.id, snapshot_id, date_to]
        );

        if (startRes.rows.length > 0 && endRes.rows.length > 0) {
          const navStart = parseFloat(startRes.rows[0].value);
          const navEnd = parseFloat(endRes.rows[0].value);
          const periodReturn = ((navEnd - navStart) / navStart) * 100;
          results.push({
            fund_id: fund.id,
            fund_name: fund.name,
            nav_start: navStart,
            nav_end: navEnd,
            period_return_pct: parseFloat(periodReturn.toFixed(2)),
          });
        }
      }

      results.sort((a, b) => b.period_return_pct - a.period_return_pct);

      const spread = results.length > 1
        ? parseFloat((results[0].period_return_pct - results[results.length - 1].period_return_pct).toFixed(2))
        : 0;

      return {
        funds: results,
        best: results[0] || null,
        worst: results[results.length - 1] || null,
        spread_pct: spread,
        count: results.length,
      };
    }

    return { error: "Invalid mode specified" };
  },
});