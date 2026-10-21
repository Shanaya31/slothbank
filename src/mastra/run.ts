import { mastra } from "./index.js";
import type { Digest } from "../digest.js";

let inflight: Promise<Digest> | null = null;

/** Runs the weekly-audit workflow once. Concurrent callers share the same run. */
export function runAudit(): Promise<Digest> {
  inflight ??= (async () => {
    const run = await mastra.getWorkflow("weeklyAudit").createRun();
    const res = await run.start({ inputData: {} });
    if (res.status !== "success") throw new Error(`audit ${res.status}: ${JSON.stringify("error" in res ? res.error : res)}`);
    return res.result as Digest;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function runProcessBill(file: string) {
  const run = await mastra.getWorkflow("processBill").createRun();
  const res = await run.start({ inputData: { path: file } });
  if (res.status !== "success") throw new Error(`process-bill ${res.status}: ${JSON.stringify("error" in res ? res.error : res)}`);
  return res.result;
}
