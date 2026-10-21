# SlothBank — Slow and Steady

SlothBank is a local-first bill-monitoring prototype that tracks spending, estimates future costs, flags unusual bills, explains line-item changes, and drafts emails for human review.

**Demo-data notice:** Included bills and ground truth are synthetic. Forecasts and anomaly flags are estimates, not proof of overcharging. Draft emails are never sent automatically.

## How it works

1. Bills enter the local processing workflow.
2. Mastra orchestrates bill processing and weekly audits.
3. A forecasting engine estimates costs and checks for unusual bills.
4. Explanations, email drafts, and a deterministic digest are generated.
5. The local interface displays the latest report.

The project supports a baseline forecaster and a TabPFN integration. Real model behavior depends on local configuration and dependencies.

## Requirements

- Node.js compatible with the installed dependencies. The current dependency set calls for Node.js 22.22.0 or newer in the Node 22 line.
- npm.
- Ollama and the configured Gemma model for real LLM processing.
- Python and the required Python dependencies for TabPFN forecasting.

TabPFN setup may require additional downloads and license acceptance. Offline operation must be tested rather than assumed.

## Install and verify

- Install dependencies: `npm install`
- Check TypeScript: `npm run typecheck`
- Run the plumbing test: `npm run smoke`

The smoke test uses a fake LLM and the baseline forecaster. It does not verify real Gemma quality or real TabPFN predictions.

## Run

- Start the application: `npm run start`
- Run one audit: `npm run audit`
- Run the extraction benchmark: `npm run bench`

The default forecast engine is TabPFN. To run an audit with the baseline engine in PowerShell, temporarily set `$env:SLOTH_ENGINE = "baseline"` before `npm run audit`, then restore the previous value.

An audit may invoke configured model integrations and can update the latest report.

## Data safety

- `npm run gen` regenerates synthetic bills and ground truth and may overwrite generated data.
- `npm run reset` clears selected runtime history and reports.
- `npm run seed` adds synthetic records to runtime history.

Back up local data before using these commands. Do not commit secrets, local databases, generated runtime history, or reports.

## Verification status

Verified in the current environment:
- TypeScript type-check passed.
- Smoke test passed using the fake LLM and baseline engine.
- Baseline forecast-only test passed.
- Full baseline audit completed and generated a digest, anomaly explanation, and one draft email.

The baseline backtest used eight observations: engine MAE was $13.52, versus $8.01 for the last-value benchmark. This small synthetic test does not establish that the baseline is more accurate.

Not yet verified end to end:
- Real TabPFN installation and predictions.
- Real Gemma output quality across representative invoices.
- Complete operation with networking disabled.
- Browser presentation and behavior across environments.

## Limitations

- Small merchant histories can produce noisy forecasts.
- Anomaly flags are review signals, not proof of billing errors.
- LLM-generated explanations and email drafts need human review.
- Local-first design does not guarantee that every configuration or dependency makes no external requests.