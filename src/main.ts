// `npm start`: UI + inbox watcher + Mastra's weekly cron, in one local process.
import { mastra } from "./mastra/index.js";
import { startServer } from "./server.js";
import { startWatcher } from "./watch.js";

await mastra.startWorkers(); // starts Mastra's cron scheduler (weekly audit)
startServer();
startWatcher();
console.log(`Weekly audit schedule: ${process.env.SLOTH_CRON ?? "Mondays 08:00 (local time)"}`);
