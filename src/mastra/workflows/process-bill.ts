import fs from "node:fs";
import path from "node:path";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { extractBill } from "../../extract.js";
import { BillSchema } from "../../schema.js";
import { appendHistory, PROCESSED } from "../../history.js";

const readStep = createStep({
  id: "read-bill",
  inputSchema: z.object({ path: z.string() }),
  outputSchema: z.object({ path: z.string(), text: z.string() }),
  execute: async ({ inputData }) => ({
    path: inputData.path,
    text: fs.readFileSync(inputData.path, "utf8"),
  }),
});

const extractStep = createStep({
  id: "extract-bill",
  inputSchema: z.object({ path: z.string(), text: z.string() }),
  outputSchema: z.object({ path: z.string(), bill: BillSchema, attempts: z.number() }),
  execute: async ({ inputData }) => {
    const r = await extractBill(inputData.text);
    if (!r.ok) throw new Error(`Extraction failed after ${r.attempts} attempts: ${r.error}`);
    return { path: inputData.path, bill: r.bill, attempts: r.attempts };
  },
});

const saveStep = createStep({
  id: "save-history",
  inputSchema: z.object({ path: z.string(), bill: BillSchema, attempts: z.number() }),
  outputSchema: z.object({ saved: z.boolean(), merchant: z.string(), total_due: z.number(), attempts: z.number() }),
  execute: async ({ inputData }) => {
    const file = path.basename(inputData.path);
    const saved = appendHistory(inputData.bill, file);
    fs.mkdirSync(PROCESSED, { recursive: true });
    fs.renameSync(inputData.path, path.join(PROCESSED, file));
    return {
      saved,
      merchant: inputData.bill.merchant,
      total_due: inputData.bill.total_due,
      attempts: inputData.attempts,
    };
  },
});

export const processBill = createWorkflow({
  id: "process-bill",
  inputSchema: z.object({ path: z.string() }),
  outputSchema: z.object({ saved: z.boolean(), merchant: z.string(), total_due: z.number(), attempts: z.number() }),
})
  .then(readStep)
  .then(extractStep)
  .then(saveStep)
  .commit();
