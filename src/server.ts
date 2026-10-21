// Local-only UI. Binds to 127.0.0.1, serves one HTML file, makes zero external requests.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { REPORTS } from "./history.js";
import { runAudit } from "./mastra/run.js";

const PORT = Number(process.env.PORT ?? 3000);

export function startServer() {
  http
    .createServer(async (req, res) => {
      const json = (code: number, body: unknown) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      try {
        if (req.method === "GET" && req.url === "/") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          return res.end(fs.readFileSync(path.resolve("ui/index.html")));
        }
        if (req.method === "GET" && req.url === "/api/digest") {
          const f = path.join(REPORTS, "latest.json");
          return fs.existsSync(f) ? json(200, JSON.parse(fs.readFileSync(f, "utf8"))) : json(404, { error: "no digest yet" });
        }
        if (req.method === "POST" && req.url === "/api/run") return json(200, await runAudit());
        json(404, { error: "not found" });
      } catch (e) {
        json(500, { error: e instanceof Error ? e.message : String(e) });
      }
    })
    .listen(PORT, "127.0.0.1", () => console.log(`UI: http://localhost:${PORT}`));
}
