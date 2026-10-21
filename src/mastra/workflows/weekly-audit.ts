import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { AuditSchema, DigestSchema, CURRENCY, saveDigest, slothSummary, type Anomaly } from "../../digest.js";
import { analyzeAnomaly, diffItems, draftEmail, loadPrefs } from "../../explain.js";
import { runForecast, ForecastSchema } from "../../forecast.js";
import { loadBills } from "../../history.js";

const RECENT_DAYS = 35; // "this cycle": flags on bills dated within this many days of the newest bill

const forecastStep = createStep({
  id: "forecast-and-check",
  description: "TabPFN: walk-forward anomaly check + next-month forecast",
  inputSchema: z.object({}),
  outputSchema: ForecastSchema,
  execute: async () => runForecast(),
});

const explainStep = createStep({
  id: "explain-and-draft",
  description: "Gemma explains each flagged bill and drafts a dispute/negotiation email",
  inputSchema: ForecastSchema,
  outputSchema: AuditSchema,
  execute: async ({ inputData: forecast }) => {
    const bills = loadBills();
    const prefs = loadPrefs();
    const cutoff = new Date(forecast.as_of).getTime() - RECENT_DAYS * 86400000;
    const anomalies: Anomaly[] = [];

    for (const m of forecast.merchants) {
      for (const c of m.checks) {
        if (!c.flagged || new Date(c.billing_date).getTime() < cutoff) continue;
        const cur = bills.find((b) => b.source_file === c.source_file);
        if (!cur) continue;
        const prev = bills
          .filter((b) => b.merchant === cur.merchant && b.billing_date < cur.billing_date)
          .sort((a, b) => b.billing_date.localeCompare(a.billing_date))[0];
        const diff = diffItems(prev, cur);
        const facts = {
          merchant: m.merchant, billing_date: c.billing_date, actual: c.actual, expected: c.median,
          p05: c.p05, p95: c.p95, deviation_pct: c.deviation_pct, diff, currency: CURRENCY,
        };
        const analysis = await analyzeAnomaly(facts);
        const email = analysis.recommended_action === "accept" ? null : await draftEmail(facts, analysis, prefs);
        anomalies.push({
          merchant: m.merchant, billing_date: c.billing_date, source_file: c.source_file,
          actual: c.actual, expected: c.median, p05: c.p05, p95: c.p95, deviation_pct: c.deviation_pct,
          diff, analysis, email,
        });
      }
    }
    return { forecast, anomalies };
  },
});

const digestStep = createStep({
  id: "write-digest",
  description: "Builds the sloth-voiced digest (deterministic text) and saves it for the UI",
  inputSchema: AuditSchema,
  outputSchema: DigestSchema,
  execute: async ({ inputData: { forecast, anomalies } }) => {
    const digest = {
      generated_at: new Date().toISOString(), as_of: forecast.as_of, engine: forecast.engine, currency: CURRENCY,
      next_month_total: forecast.next_month_total_median,
      sloth_summary: slothSummary(forecast.next_month_total_median, anomalies, loadBills().length),
      backtest: forecast.backtest, merchants: forecast.merchants, anomalies,
    };
    saveDigest(digest);
    return digest;
  },
});

export const weeklyAudit = createWorkflow({
  id: "weekly-audit",
  inputSchema: z.object({}),
  outputSchema: DigestSchema,
  // Native Mastra cron: Monday 08:00 local time by default. Override with SLOTH_CRON.
  schedule: { cron: process.env.SLOTH_CRON ?? "0 8 * * 1", inputData: {} },
})
  .then(forecastStep)
  .then(explainStep)
  .then(digestStep)
  .commit();
