import * as dotenv from "dotenv";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  throw new Error("GROQ_API_KEY environment variable is missing. Please add it to your .env file.");
}

async function testGroq() {
  console.log("Testing Groq API...");
  try {
    const groq = createGroq({ apiKey });
    const { text } = await generateText({
      model: groq("meta-llama/llama-4-scout-17b-16e-instruct"),
      prompt: "Hello! Are you working?",
    });
    console.log("Groq test success! Response:", text);
  } catch (err: any) {
    console.error("Groq test failed:", err.message);
  }
}

testGroq();
