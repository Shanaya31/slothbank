import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { HISTORY } from "./history.js";

const run = promisify(execFile);

export const MerchantSchema = z.object({
  merchant: z.string(),
  n: z.number(),
  series: z.array(z.object({ date: z.string(), value: z.number(), source_file: z.string() })),
  forecast: z.object({ month: z.string(), p10: z.number(), median: z.number(), p90: z.number() }).nullable(),
  checks: z.array(
    z.object({
      billing_date: z.string(), source_file: z.string(), actual: z.number(),
      p05: z.number(), median: z.number(), p95: z.number(), deviation_pct: z.number(), flagged: z.boolean(),
    }),
  ),
});
export const ForecastSchema = z.object({
  engine: z.string(),
  as_of: z.string(),
  config: z.object({ min_history: z.number(), min_dev: z.number(), check_band: z.array(z.number()) }),
  next_month_total_median: z.number().nullable(),
  backtest: z.object({ n: z.number(), engine_mae: z.number().nullable(), naive_last_mae: z.number().nullable() }),
  merchants: z.array(MerchantSchema),
});
export type Forecast = z.infer<typeof ForecastSchema>;

function pythonBin(): string {
  if (process.env.SLOTH_PY) return process.env.SLOTH_PY;
  for (const p of ["py/.venv/bin/python", "py/.venv/Scripts/python.exe"]) if (fs.existsSync(p)) return p;
  return "python3";
}

/** SLOTH_ENGINE=tabpfn (default) | baseline. SLOTH_TABPFN_VERSION defaults to v3.5. */
export async function runForecast(): Promise<Forecast> {
  const args = [
    "py/forecast.py", "--history", HISTORY,
    "--engine", process.env.SLOTH_ENGINE ?? "tabpfn",
    "--model-version", process.env.SLOTH_TABPFN_VERSION ?? "v3.5",
  ];
  try {
    const { stdout } = await run(pythonBin(), args, { maxBuffer: 32 * 1024 * 1024 });
    return ForecastSchema.parse(JSON.parse(stdout));
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error(`forecast.py failed: ${(err.stderr ?? err.message).toString().slice(-800)}`);
  }
}
