// The LLM only NARRATES. All arithmetic (deltas, percentages) is computed in code and handed to Gemma as facts.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { chatJson, type Msg } from "./ollama.js";
import { DATA, type StoredBill } from "./history.js";

export const ItemDeltaSchema = z.object({
  description: z.string(), prev: z.number().nullable(), cur: z.number().nullable(), delta: z.number(),
});
export type ItemDelta = z.infer<typeof ItemDeltaSchema>;

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
const r2 = (n: number) => Math.round(n * 100) / 100;

export function diffItems(prev: StoredBill | undefined, cur: StoredBill): ItemDelta[] {
  const sum = (b?: StoredBill) => {
    const m = new Map<string, { label: string; amt: number }>();
    for (const it of b?.line_items ?? []) {
      const k = norm(it.description);
      m.set(k, { label: it.description, amt: r2((m.get(k)?.amt ?? 0) + it.amount) });
    }
    return m;
  };
  const p = sum(prev), c = sum(cur);
  const out: ItemDelta[] = [];
  for (const k of new Set([...p.keys(), ...c.keys()])) {
    const a = p.get(k), b = c.get(k);
    const delta = r2((b?.amt ?? 0) - (a?.amt ?? 0));
    if (Math.abs(delta) >= 0.01) out.push({ description: (b ?? a)!.label, prev: a?.amt ?? null, cur: b?.amt ?? null, delta });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

export type AnomalyFacts = {
  merchant: string; billing_date: string; actual: number; expected: number;
  p05: number; p95: number; deviation_pct: number; diff: ItemDelta[]; currency: string;
};

const factsText = (f: AnomalyFacts) => {
  const m = (n: number) => `${f.currency}${n.toFixed(2)}`;
  const changes = f.diff.length
    ? f.diff.map((d) => `- ${d.description}: ${d.prev === null ? "NEW" : m(d.prev)} -> ${d.cur === null ? "REMOVED" : m(d.cur)} (${d.delta > 0 ? "+" : ""}${m(d.delta)})`).join("\n")
    : "- (no previous bill to compare)";
  return `Merchant: ${f.merchant}
Bill date: ${f.billing_date}
Amount billed: ${m(f.actual)}
Statistically expected: ${m(f.expected)} (90% range ${m(f.p05)} to ${m(f.p95)})
Deviation from expected: ${f.deviation_pct > 0 ? "+" : ""}${f.deviation_pct}%
Line-item changes vs previous bill:
${changes}`;
};

export const CAUSES = ["promo_expired", "rate_increase", "usage_change", "new_fee", "billing_error", "unknown"] as const;
export const ACTIONS = ["dispute", "negotiate", "accept", "monitor"] as const;
export const AnalysisSchema = z.object({
  explanation: z.string().min(1), likely_cause: z.enum(CAUSES), recommended_action: z.enum(ACTIONS), from_model: z.boolean(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

const analysisJson = {
  type: "object",
  properties: {
    explanation: { type: "string" },
    likely_cause: { type: "string", enum: [...CAUSES] },
    recommended_action: { type: "string", enum: [...ACTIONS] },
  },
  required: ["explanation", "likely_cause", "recommended_action"],
} as const;

const EXPLAIN_SYSTEM = `You explain unusual bills to a household. Use ONLY the facts provided. Never invent reasons, dates or numbers.
- explanation: at most 2 plain sentences saying what changed and why it probably did, citing the line items.
- likely_cause: promo_expired if a discount line disappeared or shrank; rate_increase if a fixed price line rose; usage_change if a usage line rose or fell; new_fee if a new charge appeared; billing_error only if the numbers look inconsistent; otherwise unknown.
- recommended_action: dispute (looks wrong or undisclosed), negotiate (legit change but worth asking for a better deal), accept (reasonable), monitor (unclear).`;

export async function analyzeAnomaly(f: AnomalyFacts): Promise<Analysis> {
  const messages: Msg[] = [{ role: "system", content: EXPLAIN_SYSTEM }, { role: "user", content: factsText(f) }];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await chatJson(messages, analysisJson);
      return { ...z.object({ explanation: z.string().min(1), likely_cause: z.enum(CAUSES), recommended_action: z.enum(ACTIONS) }).parse(JSON.parse(raw)), from_model: true };
    } catch { /* retry once, then fall back */ }
  }
  const top = f.diff[0];
  return {
    explanation: top
      ? `This bill is ${Math.abs(f.deviation_pct)}% ${f.deviation_pct > 0 ? "above" : "below"} what the history predicts; the biggest change is "${top.description}" (${top.delta > 0 ? "+" : ""}${f.currency}${top.delta.toFixed(2)}).`
      : `This bill is ${Math.abs(f.deviation_pct)}% ${f.deviation_pct > 0 ? "above" : "below"} what the history predicts.`,
    likely_cause: "unknown", recommended_action: "monitor", from_model: false,
  };
}

// ---- tone / preferences (a tiny file-based memory you can edit by hand) ----
export type Prefs = { name: string; tone: string; signoff: string };
export function loadPrefs(): Prefs {
  const file = path.join(DATA, "preferences.json");
  if (!fs.existsSync(file)) {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ name: "Alex", tone: "polite but firm", signoff: "Best regards" }, null, 2));
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Prefs;
}

export const EmailSchema = z.object({ subject: z.string().min(1), body: z.string().min(1) });
export type Email = z.infer<typeof EmailSchema>;
const emailJson = {
  type: "object",
  properties: { subject: { type: "string" }, body: { type: "string" } },
  required: ["subject", "body"],
} as const;

export async function draftEmail(f: AnomalyFacts, a: Analysis, prefs: Prefs): Promise<Email | null> {
  const system = `You write short customer-service emails for ${prefs.name}. Tone: ${prefs.tone}. Sign off with "${prefs.signoff}," then "${prefs.name}".
Rules: under 140 words. Quote the exact amounts and line items from the facts. Do not invent account numbers, dates or policies; write [ACCOUNT NUMBER] where one is needed.
Goal: ${a.recommended_action === "negotiate" ? "ask whether a better rate or loyalty credit is available" : "ask for a written explanation and a correction or credit if the change is unjustified"}.`;
  const user = `${factsText(f)}\nLikely cause: ${a.likely_cause}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return EmailSchema.parse(JSON.parse(await chatJson([{ role: "system", content: system }, { role: "user", content: user }], emailJson)));
    } catch { /* retry */ }
  }
  return null;
}
