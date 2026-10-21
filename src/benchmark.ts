// Measures extraction accuracy against ground truth. Run it twice for your "before/after" story:
//   npm run bench:noretry   (1 attempt, no validation feedback)
//   npm run bench           (up to 3 attempts with validator feedback)
import fs from "node:fs";
import path from "node:path";
import { extractBill } from "./extract.js";
import { MODEL } from "./ollama.js";
import type { Bill } from "./schema.js";

const noRetry = process.argv.includes("--no-retry");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
const maxAttempts = noRetry ? 1 : 3;

const truth = JSON.parse(fs.readFileSync("data/truth.json", "utf8")) as Record<string, Bill>;
const files = Object.keys(truth).sort().slice(0, limit);

const sameAmounts = (a: Bill, b: Bill) => {
  const x = a.line_items.map((i) => i.amount).sort((p, q) => p - q);
  const y = b.line_items.map((i) => i.amount).sort((p, q) => p - q);
  return x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 0.01);
};

const tally = { merchant: 0, date: 0, total: 0, items: 0, allCorrect: 0, failed: 0 };
let totalSecs = 0;
let totalAttempts = 0;
const rows: object[] = [];

for (const f of files) {
  const text = fs.readFileSync(path.join("data/bills", f), "utf8");
  const t0 = performance.now();
  const r = await extractBill(text, maxAttempts);
  const secs = (performance.now() - t0) / 1000;
  totalSecs += secs;
  totalAttempts += r.attempts;
  const gt = truth[f];

  if (!r.ok) {
    tally.failed++;
    console.log(`${f.padEnd(28)} FAILED (${r.error}) ${secs.toFixed(1)}s`);
    rows.push({ file: f, ok: false, error: r.error, secs });
    continue;
  }
  const b = r.bill;
  const ok = {
    merchant: b.merchant.trim().toLowerCase() === gt.merchant.toLowerCase(),
    date: b.billing_date === gt.billing_date,
    total: Math.abs(b.total_due - gt.total_due) < 0.01,
    items: sameAmounts(b, gt),
  };
  (Object.keys(ok) as (keyof typeof ok)[]).forEach((k) => ok[k] && tally[k === "date" ? "date" : k]++);
  const all = Object.values(ok).every(Boolean);
  if (all) tally.allCorrect++;
  console.log(
    `${f.padEnd(28)} ${all ? "OK  " : "MISS"} m:${+ok.merchant} d:${+ok.date} t:${+ok.total} i:${+ok.items}  tries:${r.attempts}  ${secs.toFixed(1)}s`,
  );
  rows.push({ file: f, ok: all, fields: ok, attempts: r.attempts, secs, got: b, expected: gt });
}

const n = files.length;
const pct = (x: number) => `${((100 * x) / n).toFixed(0)}%`;
const summary = {
  model: MODEL,
  mode: noRetry ? "single-shot" : "validate+retry(3)",
  bills: n,
  merchant: pct(tally.merchant),
  billing_date: pct(tally.date),
  total_due: pct(tally.total),
  line_items: pct(tally.items),
  all_fields_correct: pct(tally.allCorrect),
  failed_validation: tally.failed,
  avg_seconds_per_bill: +(totalSecs / n).toFixed(2),
  avg_attempts: +(totalAttempts / n).toFixed(2),
};
console.log("\n=== SUMMARY ===");
console.table(summary);
fs.mkdirSync("results", { recursive: true });
const out = `results/bench-${MODEL.replace(/[^\w.-]/g, "_")}-${noRetry ? "noretry" : "retry"}.json`;
fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
console.log(`Saved ${out}`);
