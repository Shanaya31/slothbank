// End-to-end plumbing test with a FAKE LLM and the baseline forecaster. Proves the workflow, python bridge,
// diffing, digest and UI API all connect. It says nothing about Gemma or TabPFN quality.
//   npm run smoke
import fs from "node:fs";
import assert from "node:assert";
process.env.SLOTH_DATA = "data-smoke";
process.env.SLOTH_ENGINE = "baseline";
process.env.OLLAMA_HOST = "http://127.0.0.1:11999";
fs.rmSync("data-smoke", { recursive: true, force: true });

const { startFakeOllama } = await import("./fake-ollama.js");
const fake = await startFakeOllama(11999);
const { appendHistory } = await import("../src/history.js");
const { runAudit } = await import("../src/mastra/run.js");

const truth = JSON.parse(fs.readFileSync("data/truth.json", "utf8"));
for (const [f, b] of Object.entries(truth)) appendHistory(b as never, f);

const d = await runAudit();
console.log(d.sloth_summary);
assert(d.anomalies.length >= 1, "expected at least one anomaly");
assert(d.anomalies.every((a) => a.email), "anomalies should carry a draft email");
assert(d.anomalies.some((a) => a.diff.length > 0), "expected at least one anomaly with a line-item diff");
assert(fs.existsSync("data-smoke/reports/latest.json"), "latest.json should exist");
console.log("SMOKE OK:", d.anomalies.map((a) => `${a.merchant} ${a.deviation_pct}%`).join(", "));
fake.close();
process.exit(0);
