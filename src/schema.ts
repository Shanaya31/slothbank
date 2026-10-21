import { z } from "zod";

export const BillSchema = z.object({
  merchant: z.string().min(1),
  billing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "billing_date must be YYYY-MM-DD"),
  total_due: z.number().nonnegative(),
  line_items: z.array(z.object({ description: z.string().min(1), amount: z.number() })).min(1),
});
export type Bill = z.infer<typeof BillSchema>;

// Hand-written JSON schema: Ollama uses it to constrain the model's output.
export const billJsonSchema = {
  type: "object",
  properties: {
    merchant: { type: "string" },
    billing_date: { type: "string", description: "Statement/invoice date as YYYY-MM-DD" },
    total_due: { type: "number", description: "Amount due for THIS bill, not the previous balance" },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: { description: { type: "string" }, amount: { type: "number" } },
        required: ["description", "amount"],
      },
    },
  },
  required: ["merchant", "billing_date", "total_due", "line_items"],
} as const;
