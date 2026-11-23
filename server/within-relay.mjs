// Stands where Within's API would be. Two modes:
//   stub  - answers /v1 calls locally with canned answers (no network, nothing sent to Within)
//   proxy - forwards each call to the real Within API (WITHIN_UPSTREAM, default https://app.getwith.in)
// Either way it records every request body, so you can see exactly what left the vendor's server.
// The SDK is pointed at http://127.0.0.1:8787/r/<runId>, so each record is tagged with its prompt.
import http from "node:http";

const ANSWERS = {
  pricing: "Acme Team is $18 per seat a month; Enterprise is quoted.",
  upgrade: "Seats can be added any time from Settings > Billing.",
  demo: "A 20-minute demo can be booked with the Acme team.",
  trial: "Acme offers a 14-day trial of the Team plan.",
  enterprise: "Enterprise includes SSO, an SLA and custom terms.",
  security: "Acme is SOC 2 Type II; the report is shared under NDA.",
  billing: "Invoices are issued monthly; refunds are reviewed by the Acme team.",
  cancellation: "Plans can be cancelled at the end of any billing period.",
};

export function startRelay({ port = 8787, mode = "stub", upstream = "https://app.getwith.in", onRecord }) {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      const m = req.url.match(/^\/r\/([^/]+)(\/v1\/.*)$/);
      const runId = m ? m[1] : "untagged";
      const path = m ? m[2] : req.url;
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      const record = { at: new Date().toISOString(), runId, method: req.method, path, body };

      let status = 200, reply = {};
      if (mode === "proxy") {
        try {
          const r = await fetch(upstream + path, {
            method: req.method,
            headers: { authorization: req.headers.authorization ?? "", "content-type": "application/json" },
            body: raw || undefined,
            signal: AbortSignal.timeout(5000),
          });
          status = r.status;
          reply = await r.json().catch(() => ({}));
        } catch (e) {
          status = 502; reply = { error: "upstream_unreachable" };
        }
      } else if (path.startsWith("/v1/answers")) {
        const topic = String(body?.topic ?? "").toLowerCase();
        const key = Object.keys(ANSWERS).find((k) => topic.includes(k));
        reply = { answer: { text: ANSWERS[key] ?? "The closest information: the Acme team can help with this." }, match: key ? "confident" : "low" };
      }
      record.status = status;
      onRecord?.(record);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply));
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
