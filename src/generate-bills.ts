// Generates 20 synthetic bills + ground truth, with seeded "events" for Day 3's anomaly detection:
//  - FiberNest: promo discount (-$20) disappears on the 5th (latest) bill -> +$20
//  - Shellter:  premium jumps ~18% on the 5th (latest) bill
//  - Sunbeam:   usage climbs through the summer
import fs from "node:fs";
import path from "node:path";
import type { Bill } from "./schema.js";

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);
const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n: number) => String(n).padStart(2, "0");

type Item = { description: string; amount: number };
type Spec = { name: string; day: number; items: (i: number) => Item[] };

const specs: Spec[] = [
  {
    name: "Sunbeam Power",
    day: 3,
    items: (i) => {
      const kwh = Math.round(380 + [0, 40, 120, 210, 180][i] + rand() * 25);
      const usage = r2(kwh * 0.14);
      return [
        { description: `Energy usage (${kwh} kWh)`, amount: usage },
        { description: "Fixed service charge", amount: 12.5 },
        { description: "Taxes & fees", amount: r2(usage * 0.06) },
      ];
    },
  },
  {
    name: "FiberNest Internet",
    day: 11,
    items: (i) => [
      { description: "Gigabit plan", amount: 79.99 },
      { description: "Equipment rental", amount: 10 },
      ...(i < 4 ? [{ description: "Promotional discount", amount: -20 }] : []),
    ],
  },
  {
    name: "Shellter Home Insurance",
    day: 18,
    items: (i) => [
      { description: "Home policy premium", amount: i < 4 ? 142 : 167.56 },
      { description: "Policy administration fee", amount: 4 },
    ],
  },
  {
    name: "Aqua Metro Water",
    day: 24,
    items: () => [
      { description: "Water usage", amount: r2(31.4 + rand() * 4) },
      { description: "Sewer charge", amount: 22.1 },
      { description: "Stormwater fee", amount: 6.75 },
    ],
  },
];

const months = [5, 6, 7, 8, 9]; // May..Sep 2026
const YEAR = 2026;

const longDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dmy = (d: Date) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

function render(t: number, name: string, d: Date, due: Date, items: Item[], total: number, prev: number, acct: string): string {
  const lines = (f: (it: Item) => string) => items.map(f).join("\n");
  if (t === 0)
    return `${name.toUpperCase()}
Account No. ${acct}
Statement date: ${longDate(d)}
Previous balance: ${money(prev)}
Payment received - thank you: ${money(-prev)}
-----------------------------
CURRENT CHARGES
${lines((it) => `${it.description.padEnd(38, ".")} ${money(it.amount)}`)}
-----------------------------
TOTAL AMOUNT DUE: ${money(total)}
Please pay by ${longDate(due)}.
`;
  if (t === 1)
    return `${name} - Invoice
Invoice date: ${dmy(d)}   Acct: ${acct}
Description | Amount
${lines((it) => `${it.description} | ${money(it.amount)}`)}
Balance brought forward: ${money(0)}
TOTAL DUE ${money(total)}
Due date: ${dmy(due)}
`;
  return `Subject: Your ${name} bill is ready

Hi Alex,

Your latest bill (issued ${iso(d)}) is ready. Here's the breakdown:

${lines((it) => `  * ${it.description}: ${money(it.amount)}`)}

You owe ${money(total)} by ${iso(due)}. Last month's bill was ${money(prev)} (already paid).
Account: ${acct}
`;
}

const outDir = path.resolve("data/bills");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const truth: Record<string, Bill> = {};
let n = 0;

months.forEach((m, i) => {
  specs.forEach((s, si) => {
    n++;
    const d = new Date(Date.UTC(YEAR, m - 1, s.day));
    const due = new Date(d.getTime() + 21 * 86400000);
    const items = s.items(i);
    const total = r2(items.reduce((a, b) => a + b.amount, 0));
    const prev = r2(40 + rand() * 160);
    const acct = `${10 + si}-${Math.floor(1000 + rand() * 8999)}`;
    const file = `bill_${pad(n)}_${s.name.split(" ")[0].toLowerCase()}.txt`;
    fs.writeFileSync(path.join(outDir, file), render((si + i) % 3, s.name, d, due, items, total, prev, acct));
    truth[file] = { merchant: s.name, billing_date: iso(d), total_due: total, line_items: items.map((x) => ({ ...x })) };
  });
});

fs.writeFileSync("data/truth.json", JSON.stringify(truth, null, 2));
console.log(`Wrote ${n} bills to data/bills and ground truth to data/truth.json`);
