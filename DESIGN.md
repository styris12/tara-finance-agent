# DESIGN.md — Tara Finance Agent

## Postgres Schema

### Tables

**transactions**
- Primary key: `(id, snapshot_id)` — composite because transaction IDs repeat across snapshots
- `merchant_canonical` — normalized merchant name computed at ingest time, never at query time
- `amount` is signed: positive = spend, negative = refund/reversal
- Indexed on `date`, `category`, `merchant_canonical`, `snapshot_id` — the four columns tools filter and group by most

**funds**
- Primary key: `(id, snapshot_id)` — fund IDs like `fund_bluechip` repeat across snapshots
- Stores fund metadata only; NAV history is in a separate table

**fund_nav**
- One row per `(fund_id, snapshot_id, date)` — normalized from the `nav` array in funds.json
- Primary key is the composite of all three columns
- Indexed on `(fund_id, snapshot_id, date)` for efficient range queries

**holdings**
- Serial primary key — holdings have no natural unique ID in the source data
- Stores what the user owns: `units`, `purchase_date`, `purchase_nav`
- Joins to `fund_nav` at query time to compute current value

### Why snapshot_id on every table

The grading model runs an unseen fourth snapshot against the same database. Using `snapshot_id` as part of every primary key and every WHERE clause means all three sample snapshots coexist in one database without conflicts. Ingest is idempotent: re-running for `sample_a` deletes and repopulates only `sample_a` rows.

---

## Tool Design

### Why four tools, not more

The assignment warns that more tools hurt selection accuracy. Each tool maps to a distinct data domain:

| Tool | Domain | Primary table |
|---|---|---|
| `query_transactions` | Spending, merchants, categories | transactions |
| `query_fund_performance` | Fund NAV and period returns | fund_nav, funds |
| `query_holdings` | User's personal holdings and realised returns | holdings, fund_nav |
| `detect_recurring` | Subscription/recurring pattern detection | transactions |

A single `query_transactions` tool handles all spending questions via an `aggregate` parameter (`sum`, `top_merchants`, `monthly_breakdown`, `category_breakdown`). This beats four narrow tools because the model only needs to make one tool selection decision.

### Tool input validation

All tool inputs use Zod schemas. Fields are `.optional()` so the model can omit irrelevant parameters without triggering validation errors. Defaults (`exclude_transfers = true`, `limit = 10`) are applied in the execute function, not the schema, to avoid Groq's strict schema validation rejecting missing optional fields.

---

## Formulas

### Spend (net spend after refunds)
```
net_spend = SUM(amount) WHERE amount can be positive or negative
gross_spend = SUM(amount) WHERE amount > 0
refunds = SUM(amount) WHERE amount < 0
```
Transfers (`category = 'transfer'`) are excluded by default.

### Merchant matching
```
merchant_canonical = first_token(lowercase(strip_special_chars(merchant_name)))
```
Examples:
- "APOLLO PHARMACY MUMBAI" → "apollo"
- "Swiggy Instamart" → "swiggy"
- "SWIGGY*ORDER" → "swiggy"

No merchant names are hardcoded. The canonicalization runs at ingest time. Tool queries use `ILIKE '%query%'` against `merchant_canonical` for flexible matching.

### Recurring detection
A merchant is recurring if it appears in 3 or more distinct calendar months:
```sql
COUNT(DISTINCT TO_CHAR(date, 'YYYY-MM')) >= min_months
```
Only positive amounts counted — refunds excluded.

### Fund period return
```
period_return_pct = (nav_end - nav_start) / nav_start * 100
```
NAV values are fetched as the closest available date on or before the requested date using `date <= $target ORDER BY date DESC LIMIT 1`.

### Holding realised return
```
purchase_cost = purchase_nav × units
current_value = current_nav × units
realised_return_inr = current_value - purchase_cost
realised_return_pct = realised_return_inr / purchase_cost * 100
```
`current_nav` = latest NAV in `fund_nav` for that fund (`ORDER BY date DESC LIMIT 1`).

---

## Grounding

Every number Tara states comes from a tool result. The agent's system prompt explicitly forbids estimating or calculating in prose. The LLM's role is to decide which tool to call and what parameters to pass — all arithmetic happens in SQL or TypeScript before the result reaches the model.

For "no data" cases, tools return `{ found: false, message: "..." }` rather than zero or null. Tara surfaces this honestly to the user.

---

## Evals

The eval script (`scripts/eval.ts`) sends 12 questions to `POST /ask` and checks that answers contain expected terms or exclude forbidden ones. Coverage:

- Single lookup (food spending March 2025)
- Biggest expense
- Merchant alias matching (Swiggy)
- Transfer exclusion (Q1 spending)
- Recurring subscription detection
- No-data case (rent April 2025)
- Portfolio value
- Realised return on a specific holding
- Fund period return ranking
- Multi-category comparison (food vs travel)
- Month-over-month category change
- Net spend after refunds

Run with: `npx tsx scripts/eval.ts`

---

## Observability

Each `POST /ask` request logs to the server console:
- `request_id` — UUID generated per request
- `question` — original user question
- `latency_ms` — total time from request to response
- `status` — success or error
- `detail` — error message if applicable

Database queries log via the `client.ts` query wrapper: SQL prefix, duration, row count. This makes it easy to inspect what the agent queried and how long it took.

---

## Deployment

- App: Render free tier (Node.js web service)
- Database: Neon free tier (serverless Postgres)
- After deploy, ingest script is run against `DATABASE_URL` pointing to Neon

**Tradeoffs:**
- Render free tier sleeps after 15 minutes of inactivity — first request after sleep has ~30 second cold start
- Neon free tier has connection limits — pool size kept at 10 max connections
- Groq free tier has rate limits — sustained high traffic may hit per-minute limits

---

## Failure modes and what I'd fix with more time

1. **Merchant canonicalization is coarse** — first-token matching works for most cases but fails on merchants with uninformative first tokens (e.g. "THE GOOD PLACE" → "the"). A Levenshtein edit-distance clustering pass at ingest time would be more robust.

2. **Groq rate limits** — a production version would use a paid provider or implement request queuing with exponential backoff.

3. **Relative date handling** — "last month" is currently interpreted as March 2025 (hardcoded in system prompt). A production agent would resolve relative dates against the actual current date or the latest date in the database.

4. **No persistent request logs** — logs go to console only. A `request_logs` table in Postgres would enable querying failed runs, latency trends, and tool usage patterns.

5. **Single snapshot per query** — the agent always queries `sample_a` unless told otherwise. A production system would associate each user with their own dataset and resolve the snapshot_id automatically.
