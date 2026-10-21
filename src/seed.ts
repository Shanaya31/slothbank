// Fills history from the synthetic ground truth (skips Gemma). Use it to build "past months" for the demo.
//   npm run seed                      -> all 20 bills
//   npm run seed -- --before 2026-09-01   -> history up to August; drop the September bills in the inbox live
import fs from "node:fs";
import { appendHistory } from "./history.js";
import type { Bill } from "./schema.js";

const i = process.argv.indexOf("--before");
const before = i > -1 ? process.argv[i + 1] : "9999-12-31";
const truth = JSON.parse(fs.readFileSync("data/truth.json", "utf8")) as Record<string, Bill>;
let n = 0;
for (const [file, bill] of Object.entries(truth).sort((a, b) => a[1].billing_date.localeCompare(b[1].billing_date))) {
  if (bill.billing_date < before && appendHistory(bill, file)) n++;
}
console.log(`Seeded ${n} bills (billing_date < ${before}). Remember: this is SYNTHETIC history.`);
