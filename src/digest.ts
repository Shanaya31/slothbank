import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AnalysisSchema, EmailSchema, ItemDeltaSchema } from "./explain.js";
import { ForecastSchema, MerchantSchema } from "./forecast.js";
import { REPORTS } from "./history.js";

export const AnomalySchema = z.object({
  merchant: z.string(), billing_date: z.string(), source_file: z.string(),
  actual: z.number(), expected: z.number(), p05: z.number(), p95: z.number(), deviation_pct: z.number(),
  diff: z.array(ItemDeltaSchema), analysis: AnalysisSchema, email: EmailSchema.nullable(),
});
export type Anomaly = z.infer<typeof AnomalySchema>;

export const AuditSchema = z.object({ forecast: ForecastSchema, anomalies: z.array(AnomalySchema) });
export const DigestSchema = z.object({
  generated_at: z.string(), as_of: z.string(), engine: z.string(), currency: z.string(),
  next_month_total: z.number().nullable(), sloth_summary: z.string(),
  backtest: ForecastSchema.shape.backtest,
  merchants: z.array(MerchantSchema), anomalies: z.array(AnomalySchema),
});
export type Digest = z.infer<typeof DigestSchema>;

export const CURRENCY = process.env.SLOTH_CURRENCY ?? "$";

// Deterministic on purpose: numbers in the digest never pass through an LLM.
export function slothSummary(total: number | null, anomalies: Anomaly[], billCount: number): string {
  const m = (n: number) => `${CURRENCY}${n.toFixed(2)}`;
  const parts = [`Slowly\u2026 I looked through ${billCount} bills.`];
  if (total !== null) parts.push(`Set aside about ${m(total)} for next month.`);
  if (!anomalies.length) parts.push("Nothing looks off. Nothing to dispute.");
  for (const a of anomalies)
    parts.push(`${a.merchant} billed ${m(a.actual)}, ${Math.abs(a.deviation_pct)}% ${a.deviation_pct > 0 ? "above" : "below"} the expected ${m(a.expected)}.`);
  const emails = anomalies.filter((a) => a.email).length;
  if (emails) parts.push(`${emails} draft email${emails > 1 ? "s are" : " is"} ready.`);
  parts.push("Go back to sleep. \u{1F9A5}");
  return parts.join(" ");
}

export function saveDigest(d: Digest) {
  fs.mkdirSync(REPORTS, { recursive: true });
  const body = JSON.stringify(d, null, 2);
  fs.writeFileSync(path.join(REPORTS, `digest-${d.generated_at.slice(0, 10)}.json`), body);
  fs.writeFileSync(path.join(REPORTS, "latest.json"), body);
}
