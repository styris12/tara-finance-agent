import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  console.log("Key starts with:", key?.slice(0, 10));
  
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?key=' + key
  );
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}
main();