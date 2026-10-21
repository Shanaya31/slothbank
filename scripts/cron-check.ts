import fs from "node:fs";
process.env.SLOTH_DATA = "data-smoke";
process.env.SLOTH_ENGINE = "baseline";
process.env.OLLAMA_HOST = "http://127.0.0.1:11999";
process.env.SLOTH_CRON = "*/5 * * * * *";
const { startFakeOllama } = await import("./fake-ollama.js");
await startFakeOllama(11999);
fs.rmSync("data-smoke/reports", { recursive: true, force: true });
const { mastra } = await import("../src/mastra/index.js");
await mastra.startWorkers(); // standalone processes must start the scheduler explicitly
const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  if (fs.existsSync("data-smoke/reports/latest.json")) { console.log(`CRON FIRED after ${((Date.now() - t0) / 1000).toFixed(1)}s`); process.exit(0); }
  await new Promise((r) => setTimeout(r, 500));
}
console.log("CRON DID NOT FIRE in 40s"); process.exit(1);
