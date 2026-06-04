import * as dotenv from "dotenv";
dotenv.config();

interface EvalCase {
  question: string;
  expect_contains?: string[];
  expect_not_contains?: string[];
  description: string;
}

const BASE_URL = "http://localhost:3000";

const EVAL_CASES: EvalCase[] = [
  {
    description: "Food spending in March 2025",
    question: "How much did I spend on food in March 2025?",
    expect_contains: ["4075", "food"],
  },
  {
    description: "Biggest single expense",
    question: "What was my single biggest expense?",
    expect_contains: ["₹"],
  },
  {
    description: "Swiggy spending with aliases",
    question: "How much did I spend on Swiggy?",
    expect_contains: ["swiggy", "₹"],
  },
  {
    description: "Q1 2025 total excluding transfers",
    question: "Ignore transfers. What was my total actual spending in Q1 2025?",
    expect_contains: ["₹"],
    expect_not_contains: ["transfer"],
  },
  {
    description: "Recurring subscriptions detection",
    question: "Which merchants look like recurring subscriptions?",
    expect_contains: ["netflix", "spotify"],
  },
  {
    description: "No data case - rent April 2025",
    question: "Do I have any data for rent in April 2025?",
    expect_contains: ["no", "not"],
  },
  {
    description: "Portfolio total value",
    question: "What is my portfolio worth today?",
    expect_contains: ["₹"],
  },
  {
    description: "Realised return on holding",
    question: "What is my realised return on my Saffron Bluechip Equity Fund holding?",
    expect_contains: ["₹"],
  },
  {
    description: "Fund period return ranking",
    question: "Rank all funds by one-year return between 2024-01-01 and 2025-01-01.",
    expect_contains: ["fund", "%"],
  },
  {
    description: "Food vs travel comparison",
    question: "Compare my food and travel spending in January and February 2025.",
    expect_contains: ["food", "travel", "₹"],
  },
  {
    description: "Category with biggest increase",
    question: "Which category had the biggest increase from February to March 2025?",
    expect_contains: ["february", "march"],
  },
  {
    description: "Net spend after refunds Q1 2025",
    question: "How much did I spend after refunds in Q1 2025?",
    expect_contains: ["₹"],
  },
];

async function runEval() {
  console.log("\n🧪 Tara Finance Agent — Eval Suite");
  console.log("=".repeat(50));

  let passed = 0;
  let failed = 0;
  const failures: { description: string; reason: string; answer: string }[] = [];

  for (const evalCase of EVAL_CASES) {
    process.stdout.write(`\n📋 ${evalCase.description}... `);

    try {
      const response = await fetch(`${BASE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: evalCase.question }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const answer = (data.answer || "").toLowerCase();

      let pass = true;
      let failReason = "";

      if (evalCase.expect_contains) {
        for (const term of evalCase.expect_contains) {
          if (!answer.includes(term.toLowerCase())) {
            pass = false;
            failReason = `Missing expected term: "${term}"`;
            break;
          }
        }
      }

      if (pass && evalCase.expect_not_contains) {
        for (const term of evalCase.expect_not_contains) {
          if (answer.includes(term.toLowerCase())) {
            pass = false;
            failReason = `Contains forbidden term: "${term}"`;
            break;
          }
        }
      }

      if (pass) {
        console.log("✅ PASS");
        passed++;
      } else {
        console.log("❌ FAIL");
        failed++;
        failures.push({
          description: evalCase.description,
          reason: failReason,
          answer: data.answer?.slice(0, 150) || "no answer",
        });
      }

    }  catch (err: any) {
      console.log("❌ ERROR —", err.message);
      console.log("   Full error:", err);
      failed++;
      failures.push({
        description: evalCase.description,
        reason: `Request failed: ${err.message}`,
        answer: "",
      });
    }

    // Small delay between requests to avoid rate limiting
    await new Promise(r => setTimeout(r, 6500));
  }

  console.log("\n" + "=".repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed out of ${EVAL_CASES.length} total`);

  if (failures.length > 0) {
    console.log("\n❌ Failed cases:");
    for (const f of failures) {
      console.log(`\n  • ${f.description}`);
      console.log(`    Reason: ${f.reason}`);
      console.log(`    Answer: ${f.answer}`);
    }
    
  }

  console.log("\n" + "=".repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

runEval();