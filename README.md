# Tara Finance Agent

A personal finance research AI agent that answers natural language questions about spending, transactions, and investment portfolios. Built with Mastra SDK, PostgreSQL, and TypeScript.

## What it does

Send a question, get a grounded answer backed by real database queries:

```bash
POST /ask
{ "question": "How much did I spend on food in March 2025?" }
→ { "answer": "In March 2025, you spent ₹4,075.17 on food across 7 transactions." }
```

Tara never guesses or invents figures. Every number comes from a tool querying PostgreSQL.

## Tech Stack

- **Runtime**: Node.js 20 + TypeScript (tsx)
- **Agent Framework**: Mastra SDK
- **LLM**: Groq (meta-llama/llama-4-scout-17b-16e-instruct) — free tier
- **Database**: PostgreSQL 18
- **HTTP Server**: Express
- **Deployment**: Render + Neon Postgres

## Local Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Groq API key (free at console.groq.com)

### Install

```bash
git clone https://github.com/yourusername/tara-finance-agent
cd tara-finance-agent
npm install
```

### Environment

Create a `.env` file:

```env
DATABASE_URL=postgres://postgres:yourpassword@localhost:5433/tara_finance
GROQ_API_KEY=your_groq_key
PORT=3000
```

### Database Setup

```bash
# Create the database
psql -U postgres -p 5433 -c "CREATE DATABASE tara_finance;"

# Run schema
psql -U postgres -p 5433 -d tara_finance -f src/db/schema.sql
```

### Ingest Sample Data

```bash
# Run for each snapshot
$env:DATA_DIR="./data/sample_a"; npx tsx scripts/ingest.ts
$env:DATA_DIR="./data/sample_b"; npx tsx scripts/ingest.ts
$env:DATA_DIR="./data/sample_c"; npx tsx scripts/ingest.ts
```

For the hidden grading snapshot:
```bash
DATA_DIR=./data/sample_x npx tsx scripts/ingest.ts
```

### Run the Server

```bash
npm start
# or
npx tsx src/server.ts
```

Server starts on `http://localhost:3000`

### Test the Endpoint

```bash
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is my portfolio worth today?"}'
```

### Run Evals

```bash
npx tsx scripts/eval.ts
```

Expected output: 12 passed, 0 failed.

## API

### POST /ask

**Request:**
```json
{ "question": "string" }
```

**Response:**
```json
{ "answer": "string" }
```

**Error response:**
```json
{ "error": "string", "detail": "string" }
```

### GET /health

Returns server status and timestamp.

## Deployment

**Live URL**: `https://your-render-url.onrender.com`

Deployed on Render (free tier) with Neon Postgres (free tier).

### Deploy your own

1. Fork this repo
2. Create a Neon or Supabase Postgres database
3. Deploy to Render as a Node.js web service
4. Set environment variables: `DATABASE_URL`, `GROQ_API_KEY`, `PORT`
5. Run ingest script against hosted DB

## Observability

Each request logs:
- `request_id` — unique UUID per request
- `question` — the original query
- `tools_called` — which tools the agent invoked
- `latency_ms` — total response time
- `status` — success or error

Logs appear in the server terminal and on your deployment platform's log stream.

## Known Limitations

- LLM provider (Groq free tier) has rate limits — high traffic may hit limits
- NAV data is monthly, so exact-date NAV lookups use the closest available date
- Merchant canonicalization uses first-token matching — very short or single-character merchant names may not cluster correctly
- Cold starts on Render free tier may add 30–60 seconds on first request
