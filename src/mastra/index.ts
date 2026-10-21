import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import fs from "node:fs";
import path from "node:path";
import { DATA } from "../history.js";
import { processBill } from "./workflows/process-bill.js";
import { weeklyAudit } from "./workflows/weekly-audit.js";

fs.mkdirSync(DATA, { recursive: true }); // the SQLite file needs its folder to exist

export const mastra = new Mastra({
  workflows: { processBill, weeklyAudit },
  // Local SQLite file: stores workflow runs and the cron schedule. No server involved.
  storage: new LibSQLStore({ id: "slothbank", url: `file:${path.join(DATA, "mastra.db")}` }),
});
