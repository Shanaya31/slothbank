// One-off audit from the terminal: `npm run audit`
import { runAudit } from "./mastra/run.js";

const d = await runAudit();
console.log(d.sloth_summary);
console.log(`\nengine=${d.engine} backtest=${JSON.stringify(d.backtest)}`);
for (const a of d.anomalies) {
  console.log(`\n[${a.merchant} ${a.billing_date}] ${a.analysis.likely_cause} -> ${a.analysis.recommended_action}${a.analysis.from_model ? "" : " (fallback text, model failed)"}`);
  console.log(a.analysis.explanation);
  if (a.email) console.log(`\n--- draft email ---\nSubject: ${a.email.subject}\n${a.email.body}`);
}
process.exit(0); // the Mastra scheduler would otherwise keep the process alive
