import * as dotenv from "dotenv";
dotenv.config();

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY environment variable is missing. Please add it to your .env file.");
}

import { taraAgent } from "../src/mastra/agents/tara";

async function main() {
  console.log("Running test query on Groq-powered Agent...");
  try {
    const result = await taraAgent.generate("How much did I spend on food in March 2025?");
    console.log("Agent run successful!");
    console.log("Result:", result.text);
  } catch (err: any) {
    console.error("Agent run failed:", err);
    if (err.stack) {
      console.error(err.stack);
    }
  }
}

main();
