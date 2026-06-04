import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import { mastra } from "./mastra/index";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post("/ask", async (req, res) => {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  const { question } = req.body;

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "question field is required" });
  }

  console.log(`[${requestId}] Question: ${question}`);

  try {
    const agent = mastra.getAgent("taraAgent");

    const result = await agent.generate(question);
    const answer = result.text;
    const latency = Date.now() - start;

    console.log(`[${requestId}] Answer: ${answer}`);
    console.log(`[${requestId}] Latency: ${latency}ms`);

    return res.json({ answer });

  } catch (err: any) {
    const latency = Date.now() - start;
    console.error(`[${requestId}] Error:`, err.message);
    console.error(`[${requestId}] Latency: ${latency}ms`);

    return res.status(500).json({
      error: "Failed to process question",
      detail: err.message,
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Tara API server running on port ${PORT}`);
  console.log(`POST http://localhost:${PORT}/ask`);
});