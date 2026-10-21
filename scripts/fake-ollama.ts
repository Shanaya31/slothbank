// Tiny stand-in for Ollama so the pipeline can be smoke-tested without a model. NOT used for real runs.
import http from "node:http";

export function startFakeOllama(port: number) {
  return new Promise<http.Server>((resolve) => {
    const s = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const props = Object.keys(JSON.parse(body || "{}").format?.properties ?? {});
        const content = props.includes("explanation")
          ? { explanation: "[fake LLM] A discount line disappeared, so the total rose.", likely_cause: "promo_expired", recommended_action: "negotiate" }
          : props.includes("subject")
            ? { subject: "[fake] Question about my latest bill", body: "Hello,\n\n[fake LLM email body]\n\nBest regards,\nAlex" }
            : {};
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: { content: JSON.stringify(content) } }));
      });
    });
    s.listen(port, "127.0.0.1", () => resolve(s));
  });
}
