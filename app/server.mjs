// Trigger check: a local web page that runs labelled prompts through Claude against the
// Acme MCP server (with Within installed) and scores whether Claude asked Within.
//   npm start                       stub mode: Within's API is faked locally
//   WITHIN_MODE=proxy SUPPORTBRIDGE_API_KEY=sb_... npm start
//                                   proxy mode: calls go to the real Within API (your sandbox key)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRelay } from "../server/within-relay.mjs";
import { runPrompt } from "./runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 5180);
const RELAY_PORT = Number(process.env.RELAY_PORT ?? 8787);
const MODE = process.env.WITHIN_MODE === "proxy" ? "proxy" : "stub";
const API_KEY = process.env.SUPPORTBRIDGE_API_KEY || "sb_local_stub";
if (MODE === "proxy" && !process.env.SUPPORTBRIDGE_API_KEY) {
  console.error("Proxy mode needs SUPPORTBRIDGE_API_KEY (the sandbox key from app.getwith.in > Integrations).");
  process.exit(1);
}

const prompts = JSON.parse(fs.readFileSync(path.join(ROOT, "prompts.json"), "utf8"));
const records = []; // every request the SDK sent toward Within
await startRelay({ port: RELAY_PORT, mode: MODE, onRecord: (r) => records.push(r) });

let state = { status: "idle", model: "", startedAt: null, finishedAt: null, results: [] };

function sdkStatus() {
  const sdk = path.join(ROOT, "node_modules/@getwithin/sdk");
  const pkg = JSON.parse(fs.readFileSync(path.join(sdk, "package.json"), "utf8"));
  const dist = fs.readFileSync(path.join(sdk, "dist/index.js"), "utf8");
  return {
    version: pkg.version,
    zodFix: Boolean(pkg.peerDependencies?.zod) && !fs.existsSync(path.join(sdk, "node_modules/zod")),
    phoneFix: dist.includes("within-trigger-check: phone redaction"),
    wordingFix: dist.includes("not a comparison of records in this product's own data"),
  };
}

function score(results) {
  const done = results.filter((r) => r.done && r.ok);
  const tp = done.filter((r) => r.expect === "within" && r.called).length;
  const fn = done.filter((r) => r.expect === "within" && !r.called).length;
  const fp = done.filter((r) => r.expect === "no" && r.called).length;
  const tn = done.filter((r) => r.expect === "no" && !r.called).length;
  const ms = done.map((r) => r.ms).sort((a, b) => a - b);
  return {
    tp, fn, fp, tn, n: done.length,
    recall: tp + fn ? tp / (tp + fn) : null,
    precision: tp + fp ? tp / (tp + fp) : null,
    accuracy: done.length ? (tp + tn) / done.length : null,
    medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : null,
  };
}

async function runAll(model, concurrency = 3) {
  const stamp = Date.now().toString(36);
  state = {
    status: "running", model, startedAt: new Date().toISOString(), finishedAt: null,
    results: prompts.map((p) => ({ ...p, runId: `${stamp}-${p.id}`, done: false })),
  };
  let next = 0;
  async function worker() {
    while (next < state.results.length) {
      const row = state.results[next++];
      const r = await runPrompt({ prompt: row.text, runId: row.runId, model, relayUrl: `http://127.0.0.1:${RELAY_PORT}`, apiKey: API_KEY });
      const answerCall = r.toolCalls.find((t) => t.name === "get_vendor_answer");
      Object.assign(row, r, { done: true, called: Boolean(answerCall), topic: answerCall?.input?.topic ?? "" });
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  state.status = "done";
  state.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.join(ROOT, "runs"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "runs", `run-${stamp}.json`), JSON.stringify(snapshot(), null, 2));
}

function snapshot() {
  return {
    mode: MODE,
    isolated: Boolean(process.env.WTC_CLAUDE_CONFIG_DIR),
    sdk: sdkStatus(),
    ...state,
    results: state.results.map((r) => ({ ...r, sent: records.filter((x) => x.runId === r.runId && x.path !== "/v1/install") })),
    summary: score(state.results),
  };
}

http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(ROOT, "app/index.html")));
  }
  if (req.method === "GET" && req.url === "/api/state") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify(snapshot()));
  }
  if (req.method === "POST" && req.url === "/api/run") {
    let b = "";
    req.on("data", (c) => (b += c));
    return req.on("end", () => {
      if (state.status === "running") { res.writeHead(409); return res.end("already running"); }
      const model = ["haiku", "sonnet", "opus"].includes(JSON.parse(b || "{}").model) ? JSON.parse(b).model : "haiku";
      runAll(model).catch((e) => { state.status = "error"; state.error = String(e); });
      res.writeHead(202); res.end("started");
    });
  }
  res.writeHead(404); res.end();
}).listen(PORT, "127.0.0.1", () => {
  const s = sdkStatus();
  console.log(`Trigger check on http://127.0.0.1:${PORT}  (Within ${MODE} mode, SDK ${s.version}, zod fix ${s.zodFix}, phone fix ${s.phoneFix})`);
  if (!s.zodFix) console.log("Note: SDK 0.3.0 crashes on Zod 4 (fixed in 0.4.0). Run: npm run fix");
});
