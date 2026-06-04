import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { query } from "../db/client";

export const queryHoldings = createTool({
  id: "query_holdings",
  description: `Query the user's mutual fund holdings and calculate realised returns.
Use this for questions about what the user personally owns, their portfolio value,
and their personal return on each holding.
IMPORTANT: This is different from fund period return — this calculates what the 
USER made based on when they bought and at what price.`,

  inputSchema: z.object({
    snapshot_id: z.string().describe("Which dataset to query: sample_a, sample_b, or sample_c"),
    fund_id: z.string().optional().describe("Filter by specific fund ID"),
    fund_name_query: z.string().optional().describe("Partial fund name to search"),
    mode: z.enum([
      "realised_return",
      "portfolio_value",
      "all_holdings"
    ]).describe("What to compute"),
  }),

  execute: async (input) => {
    const context = input.context ?? input;
    const { snapshot_id, fund_id, fund_name_query, mode } = context;

    // Get latest NAV for a fund
    async function getLatestNav(fId: string): Promise<number | null> {
      const res = await query(
        `SELECT value FROM fund_nav 
         WHERE fund_id = $1 AND snapshot_id = $2
         ORDER BY date DESC LIMIT 1`,
        [fId, snapshot_id]
      );
      return res.rows.length > 0 ? parseFloat(res.rows[0].value) : null;
    }

    // ── All holdings with realised returns ────────────────────────────────
    if (mode === "all_holdings") {
      let holdingsQuery = `
        SELECT h.id, h.fund_id, h.fund_name, h.units, h.purchase_date, h.purchase_nav
        FROM holdings h
        WHERE h.snapshot_id = $1`;
      const params: unknown[] = [snapshot_id];

      if (fund_id) {
        holdingsQuery += ` AND h.fund_id = $2`;
        params.push(fund_id);
      } else if (fund_name_query) {
        holdingsQuery += ` AND h.fund_name ILIKE $2`;
        params.push(`%${fund_name_query}%`);
      }

      const res = await query(holdingsQuery, params);

      if (res.rows.length === 0) {
        return { found: false, message: "No holdings found." };
      }

      const holdings = [];
      for (const row of res.rows) {
        const currentNav = await getLatestNav(row.fund_id);
        if (currentNav === null) continue;

        const purchaseCost = parseFloat(row.purchase_nav) * parseFloat(row.units);
        const currentValue = currentNav * parseFloat(row.units);
        const realisedReturn = currentValue - purchaseCost;
        const realisedReturnPct = (realisedReturn / purchaseCost) * 100;

        holdings.push({
          fund_id: row.fund_id,
          fund_name: row.fund_name,
          units: parseFloat(row.units),
          purchase_date: row.purchase_date,
          purchase_nav: parseFloat(row.purchase_nav),
          current_nav: currentNav,
          purchase_cost: parseFloat(purchaseCost.toFixed(2)),
          current_value: parseFloat(currentValue.toFixed(2)),
          realised_return_inr: parseFloat(realisedReturn.toFixed(2)),
          realised_return_pct: parseFloat(realisedReturnPct.toFixed(2)),
        });
      }

      return {
        found: true,
        holdings,
        count: holdings.length,
      };
    }

    // ── Portfolio total value ─────────────────────────────────────────────
    if (mode === "portfolio_value") {
      const res = await query(
        `SELECT h.fund_id, h.fund_name, h.units, h.purchase_nav
         FROM holdings h
         WHERE h.snapshot_id = $1`,
        [snapshot_id]
      );

      if (res.rows.length === 0) {
        return { found: false, message: "No holdings found." };
      }

      let totalCurrentValue = 0;
      let totalPurchaseCost = 0;

      for (const row of res.rows) {
        const currentNav = await getLatestNav(row.fund_id);
        if (currentNav === null) continue;

        totalCurrentValue += currentNav * parseFloat(row.units);
        totalPurchaseCost += parseFloat(row.purchase_nav) * parseFloat(row.units);
      }

      const totalReturn = totalCurrentValue - totalPurchaseCost;
      const totalReturnPct = (totalReturn / totalPurchaseCost) * 100;

      return {
        found: true,
        total_current_value: parseFloat(totalCurrentValue.toFixed(2)),
        total_purchase_cost: parseFloat(totalPurchaseCost.toFixed(2)),
        total_return_inr: parseFloat(totalReturn.toFixed(2)),
        total_return_pct: parseFloat(totalReturnPct.toFixed(2)),
        holdings_count: res.rows.length,
      };
    }

    // ── Realised return for specific holding ──────────────────────────────
    if (mode === "realised_return") {
      if (!fund_id && !fund_name_query) {
        return { error: "fund_id or fund_name_query required for realised_return mode" };
      }

      const condition = fund_id
        ? `h.fund_id = $2`
        : `h.fund_name ILIKE $2`;
      const param = fund_id ? fund_id : `%${fund_name_query}%`;

      const res = await query(
        `SELECT h.fund_id, h.fund_name, h.units, h.purchase_date, h.purchase_nav
         FROM holdings h
         WHERE h.snapshot_id = $1 AND ${condition}
         LIMIT 1`,
        [snapshot_id, param]
      );

      if (res.rows.length === 0) {
        return { found: false, message: "No holding found matching the criteria." };
      }

      const row = res.rows[0];
      const currentNav = await getLatestNav(row.fund_id);

      if (currentNav === null) {
        return { found: false, message: "No NAV data available for this fund." };
      }

      const purchaseCost = parseFloat(row.purchase_nav) * parseFloat(row.units);
      const currentValue = currentNav * parseFloat(row.units);
      const realisedReturn = currentValue - purchaseCost;
      const realisedReturnPct = (realisedReturn / purchaseCost) * 100;

      return {
        found: true,
        fund_id: row.fund_id,
        fund_name: row.fund_name,
        units: parseFloat(row.units),
        purchase_date: row.purchase_date,
        purchase_nav: parseFloat(row.purchase_nav),
        current_nav: currentNav,
        purchase_cost: parseFloat(purchaseCost.toFixed(2)),
        current_value: parseFloat(currentValue.toFixed(2)),
        realised_return_inr: parseFloat(realisedReturn.toFixed(2)),
        realised_return_pct: parseFloat(realisedReturnPct.toFixed(2)),
      };
    }

    return { error: "Invalid mode specified" };
  },
});