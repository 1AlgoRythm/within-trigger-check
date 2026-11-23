// Checks both fixes against the installed SDK, in a child process so a crash is a result,
// not an abort. Prints one JSON line: { zod_quickstart, phone_redacted, ... }.
import { spawnSync } from "node:child_process";

const probe = `
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { SERVER_INSTRUCTIONS, SupportBridge } from "@getwithin/sdk";
const seen = [];
const stub = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => { seen.push(b ? JSON.parse(b) : {}); res.end("{}"); }); });
await new Promise(r => stub.listen(8799, "127.0.0.1", r));
const server = new McpServer({ name: "check", version: "0" }, { instructions: "x " + SERVER_INSTRUCTIONS });
const support = SupportBridge.install(server, { apiKey: "sb_check", baseUrl: "http://127.0.0.1:8799" });
const t = support.wrapTool({ name: "search", description: "Search.", inputSchema: { query: z.string() }, handler: async () => ({ content: [{ type: "text", text: "ok" }] }) });
server.registerTool(t.name, { description: t.description, inputSchema: t.inputSchema }, t.handler);
const [a, b] = InMemoryTransport.createLinkedPair();
await server.connect(a);
const client = new Client({ name: "c", version: "0" });
await client.connect(b);
await client.callTool({ name: "search", arguments: { query: "fintech", context: "User Priya (555-201-3344, +1 617 555 0142) wants fintech leads; budget 40 seats in 2026-12" } });
const intent = seen.map(s => s.mcpIntent).find(Boolean) ?? "";
await client.callTool({ name: "get_vendor_answer", arguments: { topic: "pricing", question: "Call Priya Raman on 617-555-0142 or priya@fund.com about 40 seats in 2026-12" } });
const question = seen.map(s => s.question).find(Boolean) ?? "";
console.log(JSON.stringify({ mcpIntent_sent: intent, question_sent: question }));
stub.close(); process.exit(0);
`;

const run = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { encoding: "utf8", cwd: process.cwd() });
const zodOk = run.status === 0;
let intent = "", question = "";
try { const last = JSON.parse(run.stdout.trim().split("\n").pop()); intent = last.mcpIntent_sent; question = last.question_sent; } catch {}
const out = {
  zod_quickstart: zodOk ? "works" : "crashes: " + (run.stderr.match(/Error: [^\n]+/)?.[0] ?? "unknown error"),
  mcpIntent_sent: zodOk ? intent : null,
  phone_redacted: zodOk ? !/555/.test(intent) : null,
  kept_harmless_numbers: zodOk ? /40 seats/.test(intent) && /2026-12/.test(intent) : null,
  question_sent: zodOk ? question : null,
  question_phone_and_email_redacted: zodOk ? !/617-555-0142|priya@fund\.com/.test(question) : null,
  question_name_still_passes: zodOk ? /Priya Raman/.test(question) : null,
  question_kept_harmless_numbers: zodOk ? /40 seats/.test(question) && /2026-12/.test(question) : null,
};
console.log(JSON.stringify(out, null, 2));
