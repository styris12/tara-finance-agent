# Tara Finance AI Agent

Tara is a personal finance research AI agent that answers natural language questions about spending, transactions, and investment portfolios. Built with **Mastra SDK**, **PostgreSQL**, and **TypeScript**.

```mermaid
flowchart LR
    Client([User API Client]) <-->|REST API| Express[Express Server]
    Express <-->|Mastra SDK| Tara[Tara Agent]
    Tara <-->|customModel Proxy| Groq[Groq API Llama 4]
    Tara <-->|Local SQL Tools| Postgres[(PostgreSQL)]
```

Tara does not guess, estimate, or invent numbers. Every figure in a response is guaranteed to be grounded, retrieved directly via SQL from a PostgreSQL database, and processed.

---

## ⚡ Tech Stack

* **Runtime**: Node.js v22+ & TypeScript (`npx tsx`)
* **Agent Orchestration**: Mastra SDK
* **LLM**: Groq (`meta-llama/llama-4-scout-17b-16e-instruct`) — *Free Tier*
* **Database**: PostgreSQL 14+
* **HTTP Server**: Express

---

## 🚀 Quick Start

### 📋 Prerequisites
Ensure you have the following installed locally:
* **Node.js** (v22.13.0 or higher)
* **PostgreSQL** (running locally on port `5433` or accessible via URI)
* **Groq API Key** (available for free at [console.groq.com](https://console.groq.com))

---

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/styris12/tara-finance-agent.git
cd tara-finance-agent
npm install
```

---

### 2. Environment Configuration
Create a `.env` file in the project root:
```env
DATABASE_URL=postgres://postgres:yourpassword@localhost:5433/tara_finance
GROQ_API_KEY=your_groq_api_key
PORT=3000
```

---

### 3. Database Initialization
Create the database and apply the schema:
```bash
# Create target database
psql -U postgres -p 5433 -c "CREATE DATABASE tara_finance;"

# Apply table schemas and indexes
psql -U postgres -p 5433 -d tara_finance -f src/db/schema.sql
```

---

### 4. Data Ingestion
Ingest sample transactional datasets into the database by running:
```powershell
# Windows PowerShell Ingestion
$env:DATA_DIR="./data/sample_a"; npx tsx scripts/ingest.ts
$env:DATA_DIR="./data/sample_b"; npx tsx scripts/ingest.ts
$env:DATA_DIR="./data/sample_c"; npx tsx scripts/ingest.ts
```

> [!TIP]
> Each ingestion run deletes previous entries for the snapshot before populating. Ingestion is fully idempotent and safe to re-run.

---

### 5. Running the Application

**Development Mode (Live Reload):**
```bash
npm run dev
```

**Production Mode:**
```bash
# Build the production bundle
npm run build

# Start the Express server
npm start
```
The server will start listening at `http://localhost:3000`.

---

## 🧪 Testing and Evals

### Run Diagnostic Scripts
Check direct Groq LLM API and Agent connectivity:
```bash
npx tsx scripts/test-groq.ts
npx tsx scripts/test-agent-groq.ts
```

### Run Evaluation Suite
Run the full 12-scenario evaluation suite against the active server:
```bash
# Ensure server is running on port 3000, then execute:
npx tsx scripts/eval.ts
```
*Expected Output: `📊 Results: 12 passed, 0 failed out of 12 total`*

---

## 🔌 API Endpoints

### `POST /ask`
Submit a natural language financial question.

**Request Body:**
```json
{
  "question": "How much did I spend on food in March 2025?"
}
```

**Success Response (200 OK):**
```json
{
  "answer": "In March 2025, you spent ₹4075.17 on food."
}
```

**Error Response (500 Internal Server Error):**
```json
{
  "error": "Failed to process question",
  "detail": "Upstream API limit exceeded"
}
```

### `GET /health`
Inspect server connection status and uptime.

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-06-04T14:00:00.000Z"
}
```
