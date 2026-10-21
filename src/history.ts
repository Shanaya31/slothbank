import fs from "node:fs";
import path from "node:path";
import type { Bill } from "./schema.js";

export const DATA = path.resolve(process.env.SLOTH_DATA ?? "data");
export const INBOX = path.join(DATA, "inbox");
export const PROCESSED = path.join(DATA, "processed");
export const REPORTS = path.join(DATA, "reports");
export const HISTORY = path.join(DATA, "history.csv"); // TabPFN reads this
export const BILLS_LOG = path.join(DATA, "bills.jsonl"); // full bills incl. line items, for explanations
const HEADER = "merchant,billing_date,total_due,source_file\n";

export type StoredBill = Bill & { source_file: string };

/** Append one bill to history.csv + bills.jsonl. Skips duplicates. Returns true if added. */
export function appendHistory(bill: Bill, sourceFile: string): boolean {
  fs.mkdirSync(DATA, { recursive: true });
  if (!fs.existsSync(HISTORY)) fs.writeFileSync(HISTORY, HEADER);
  const existing = fs.readFileSync(HISTORY, "utf8");
  if (existing.split("\n").some((l) => l.endsWith(`,${sourceFile}`))) return false;
  const merchant = `"${bill.merchant.replace(/"/g, '""')}"`;
  fs.appendFileSync(HISTORY, `${merchant},${bill.billing_date},${bill.total_due},${sourceFile}\n`);
  fs.appendFileSync(BILLS_LOG, JSON.stringify({ ...bill, source_file: sourceFile }) + "\n");
  return true;
}

export function loadBills(): StoredBill[] {
  if (!fs.existsSync(BILLS_LOG)) return [];
  return fs
    .readFileSync(BILLS_LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as StoredBill);
}

export function resetData() {
  for (const p of [HISTORY, BILLS_LOG, PROCESSED, REPORTS]) fs.rmSync(p, { recursive: true, force: true });
  for (const f of fs.existsSync(DATA) ? fs.readdirSync(DATA) : []) if (f.startsWith("mastra.db")) fs.rmSync(path.join(DATA, f));
}
