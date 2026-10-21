import { BillSchema, billJsonSchema, type Bill } from "./schema.js";
import { chatJson, type Msg } from "./ollama.js";

const SYSTEM = `You extract data from utility and insurance bills.
Return JSON only. Rules:
- merchant: the company that issued the bill.
- billing_date: the statement / invoice / issue date as YYYY-MM-DD. NOT the due date. Dates like 05/06/2026 are DD/MM/YYYY.
- line_items: every charge or discount on THIS bill. Discounts are negative numbers. Do NOT include previous balances, payments received, or balance brought forward.
- total_due: the amount due for this bill. It must equal the sum of line_items.`;

export type ExtractResult =
  | { ok: true; bill: Bill; attempts: number }
  | { ok: false; error: string; attempts: number };

/** Parse + validate, including an arithmetic check: items must sum to the total. */
function validate(raw: string): Bill {
  const bill = BillSchema.parse(JSON.parse(raw));
  const sum = Math.round(bill.line_items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  if (Math.abs(sum - bill.total_due) > 0.01) {
    throw new Error(`line_items sum to ${sum} but total_due is ${bill.total_due}`);
  }
  return bill;
}

export async function extractBill(text: string, maxAttempts = 3): Promise<ExtractResult> {
  const messages: Msg[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: text },
  ];
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await chatJson(messages, billJsonSchema);
    try {
      return { ok: true, bill: validate(raw), attempts: attempt };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      messages.push(
        { role: "assistant", content: raw },
        { role: "user", content: `Rejected: ${lastError}. Re-read the bill and return corrected JSON.` },
      );
    }
  }
  return { ok: false, error: lastError, attempts: maxAttempts };
}
