// Serves the local UI or synthetic read-only demo, depending on environment.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { REPORTS } from "./history.js";

const PORT = Number(process.env.PORT ?? 3000);
const DEMO_MODE = process.env.SLOTH_DEMO_MODE === "true";
const HOST = process.env.HOST ?? (DEMO_MODE ? "0.0.0.0" : "127.0.0.1");

export function startServer() {
  http
    .createServer(async (req, res) => {
      const json = (code: number, body: unknown) => {
        res.writeHead(code, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(body));
      };

      try {
        if (req.method === "GET" && req.url === "/favicon.svg") {
          const faviconPath = path.resolve("ui/favicon.svg");

          if (!fs.existsSync(faviconPath)) {
            res.writeHead(404);
            return res.end();
          }

          res.writeHead(200, {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          });

          return res.end(fs.readFileSync(faviconPath));
        }
        if (req.method === "GET" && req.url === "/") {
          let html = fs.readFileSync(path.resolve("ui/index.html"), "utf8");

          if (DEMO_MODE) {
            html = html.replace(
              '<button id="run">Wake the sloth</button>',
              '<button id="run" disabled aria-disabled="true">Read-only demo</button>',
            );
          }

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });
          return res.end(html);
        }

        if (req.method === "GET" && req.url === "/api/digest") {
          const f = DEMO_MODE
            ? path.resolve("demo/demo-digest.json")
            : path.join(REPORTS, "latest.json");

          return fs.existsSync(f)
            ? json(200, JSON.parse(fs.readFileSync(f, "utf8")))
            : json(404, { error: "no digest yet" });
        }

        if (req.method === "POST" && req.url === "/api/run") {
          if (DEMO_MODE) {
            return json(403, {
              error: "This is a read-only synthetic demo. Audits are disabled.",
            });
          }

          const { runAudit } = await import("./mastra/run.js");
          return json(200, await runAudit());
        }

        return json(404, { error: "not found" });
      } catch (e) {
        return json(500, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })
    .listen(PORT, HOST, () => {
      console.log(`UI: http://localhost:${PORT}`);
      console.log(`Mode: ${DEMO_MODE ? "read-only demo" : "local"}`);
    });
}
