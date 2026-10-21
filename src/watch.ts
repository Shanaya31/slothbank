// The sloth loop: sleeps until a bill lands in data/inbox, extracts it, then (after things go quiet) runs the audit.
import fs from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import { INBOX } from "./history.js";
import { runAudit, runProcessBill } from "./mastra/run.js";

export function startWatcher() {
  fs.mkdirSync(INBOX, { recursive: true });
  console.log(`Zzz... watching ${INBOX} (drop a .txt bill in to wake me up)`);
  let queue: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;

  chokidar.watch(INBOX, { ignoreInitial: false, awaitWriteFinish: true }).on("add", (file) => {
    if (path.extname(file) !== ".txt") return;
    queue = queue.then(async () => {
      console.log(`New bill: ${path.basename(file)}`);
      try {
        console.log("  ->", JSON.stringify(await runProcessBill(file)));
      } catch (e) {
        console.error("  extraction failed:", e instanceof Error ? e.message : e);
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(async () => {
        console.log("Inbox quiet. Running audit...");
        try {
          console.log((await runAudit()).sloth_summary);
        } catch (e) {
          console.error("audit failed:", e instanceof Error ? e.message : e);
        }
      }, 8000);
    });
  });
}
