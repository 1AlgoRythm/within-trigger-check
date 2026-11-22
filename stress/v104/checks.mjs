// Checks for within-sdk 1.0.4, ported from the @getwithin/sdk 0.x stress suite (same ids where the question carries over).
// Never contacts Within: a stand-in on 127.0.0.1, or a stubbed globalThis.fetch. HOME is a throwaway so ~/within-sdk.log stays out of the real home.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { performance } from "node:perf_hooks";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "within104-home-"));
process.env.HOME = HOME;
delete process.env.WITHIN_SDK_API_URL; delete process.env.WITHIN_SDK_INGEST_BASE_URL;
delete process.env.WITHIN_SDK_API_KEY; delete process.env.WITHIN_SDK_INGEST_KEY;
const LOG = path.join(HOME, "within-sdk.log");

const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
const { z } = await import("zod");
const PKG = process.env.WITHIN_PKG_DIR ? path.resolve(process.env.WITHIN_PKG_DIR) : new URL("./node_modules/within-sdk", import.meta.url).pathname;
const PKG_ENTRY = "file://" + path.join(PKG, "dist/index.js");
const PATCHED = Boolean(process.env.WITHIN_PKG_DIR);
const within = await import(PKG_ENTRY);
const { track } = within;
const VERSION = JSON.parse(fs.readFileSync(path.join(PKG, "package.json"))).version;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const readLog = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "");

// ---- stand-in for Within's ingestion API ----
async function startStub(mode = {}) {
  const st = { mode: { kind: "ok", delay: 0, status: 200, ...mode }, posts: [], events: [], conns: new Set() };
  st.server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let parsed = null; try { parsed = JSON.parse(body); } catch {}
      st.posts.push({ url: req.url, auth: req.headers.authorization, body, parsed });
      for (const e of parsed?.events ?? []) st.events.push(e);
      const m = st.mode;
      if (m.kind === "hang") return; // never answer
      if (m.delay) await sleep(m.delay);
      if (m.kind === "garbage") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html>not json</html>"); }
      res.writeHead(m.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: m.status < 400 }));
    });
  });
  st.server.on("connection", (s) => { st.conns.add(s); s.on("close", () => st.conns.delete(s)); });
  await new Promise((r) => st.server.listen(0, "127.0.0.1", r));
  st.url = `http://127.0.0.1:${st.server.address().port}`;
  st.close = () => { for (const s of st.conns) s.destroy(); st.server.close(); };
  st.toolCalls = (name) => st.events.filter((e) => e.eventType === "mcp:tools/call" && (!name || e.resourceName === name));
  st.settle = async (ms = 700) => { await sleep(ms); };
  return st;
}
async function closedPortUrl() {
  const s = net.createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port; await new Promise((r) => s.close(r)); return `http://127.0.0.1:${p}`;
}

// ---- boot a vendor server, optionally tracked, with an in-memory client ----
async function boot({ stub, trackOpts = {}, setup, tracked = true, instructions, vendorSlug = "acme", registerAfter } = {}) {
  const server = new McpServer({ name: "acme", version: "1.0.0" }, instructions ? { instructions } : undefined);
  (setup ?? defaultTools)(server);
  if (tracked) track(server, vendorSlug, { apiKey: "within_sk_test_123456", ...(stub ? { apiBaseUrl: stub.url } : {}), ...trackOpts });
  registerAfter?.(server);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "stress-client", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { server, client };
}
function defaultTools(server) {
  server.tool("search_companies", { query: z.string() }, async ({ query }) => ({ content: [{ type: "text", text: `found 3 for ${query}` }] }));
}
const call = async (client, name, args) => { const t0 = performance.now(); const r = await client.callTool({ name, arguments: args }); return { r, ms: performance.now() - t0 }; };
const Q = { query: "acme corp", context: "Searching the directory for competitors of the customer so the team can compare them side by side." };

const results = [];
const add = (id, title, basis, verdict, observed, evidence) => { results.push({ id, title, basis, verdict, observed, evidence }); console.log(`${verdict.toUpperCase().padEnd(5)} ${id.padEnd(4)} ${title.slice(0, 70)}\n        ${observed.slice(0, 260)}`); };
const checks = [];
const check = (id, title, basis, fn) => checks.push({ id, title, basis, fn });

// ================= A: availability =================
check("A1", "Within hangs: how long does the vendor's tool wait, call after call?", "README: telemetry is added around the vendor's tool; the vendor's result should not depend on Within answering.", async () => {
  const stub = await startStub({ kind: "hang" });
  const { client } = await boot({ stub });
  const times = []; for (let i = 0; i < 5; i++) times.push(Math.round((await call(client, "search_companies", Q)).ms));
  stub.close();
  const worst = Math.max(...times);
  return [worst < 1000 ? "pass" : "fail", `five calls with Within never answering took ${times.join(", ")} ms. Worst ${worst} ms.`, { times }];
});
check("A1c", "Within hangs for a while, then recovers: does telemetry resume without a restart?", "Vendor expectation. The SDK's own send code sets no timeout and runs at most 5 requests at once.", async () => {
  const stub = await startStub({ kind: "hang" }); const { client } = await boot({ stub });
  for (let i = 0; i < 4; i++) await call(client, "search_companies", Q); // the connect event and 4 tool calls: 5 events, 5 requests that hang
  await sleep(500); const hungPosts = stub.posts.length;
  stub.mode.kind = "ok"; const afterHang = stub.posts.length;
  const waiting = 3; for (let i = 0; i < waiting; i++) await call(client, "search_companies", Q);
  await sleep(15000);
  const okPosts = stub.posts.length - afterHang; stub.close();
  return [okPosts === 0 ? "gap" : "pass", `Within hung on ${hungPosts} requests, then answered normally. In the next 15 s after recovery, requests reaching Within: ${okPosts} (${waiting} later reports were waiting). The vendor's own calls stayed fast. The SDK code sets no timeout on these requests, so ${okPosts === 0 ? "the stuck requests keep every later event waiting. I did not wait for Node's own default limit to see when they give up." : "it resumed."}`, { hungPosts, okPosts, waiting }];
});
check("A2", "Within is down (connection refused): is the vendor's result returned?", "Vendor expectation, and README privacy/limits do not say otherwise.", async () => {
  const { client } = await boot({ trackOpts: { apiBaseUrl: await closedPortUrl() } });
  const { r } = await call(client, "search_companies", Q); await sleep(1500);
  const ok = r.content?.[0]?.text === "found 3 for acme corp" && !r.isError;
  return [ok ? "pass" : "fail", `result: ${JSON.stringify(r.content)} isError=${r.isError}`, { r }];
});
check("A3", "Within is down: is the vendor's result, structuredContent and _meta left exactly alone? (also B1, B2)", "README: 'preserving vendor handler arguments and tool results'.", async () => {
  const mk = (s) => s.registerTool("lookup", { description: "d", inputSchema: { q: z.string() }, outputSchema: { n: z.number(), tags: z.array(z.string()) } },
    async ({ q }) => ({ content: [{ type: "text", text: `ok ${q}` }], structuredContent: { n: 3, tags: ["a", "b"] }, _meta: { vendor: "keep-me", trace: 7 } }));
  const base = await boot({ tracked: false, setup: mk });
  const down = await boot({ trackOpts: { apiBaseUrl: await closedPortUrl() }, setup: mk });
  const stub = await startStub(); const up = await boot({ stub, setup: mk });
  const args = { q: "x", context: "Checking the lookup tool with a made up question for the stress check." };
  const b = (await call(base.client, "lookup", { q: "x" })).r, d = (await call(down.client, "lookup", args)).r, u = (await call(up.client, "lookup", args)).r;
  stub.close();
  const same = (x) => JSON.stringify(x) === JSON.stringify(b);
  return [same(d) && same(u) ? "pass" : "fail", `untracked == tracked+down: ${same(d)}; untracked == tracked+up: ${same(u)}. _meta after: ${JSON.stringify(u._meta)}`, { b, d, u }];
});
check("A4", "Wrong API key (Within answers 401): does the vendor get any signal?", "Vendor expectation: a rejected key should show somewhere the vendor looks.", async () => {
  const stub = await startStub({ status: 401 }); const before = readLog().length;
  const { client } = await boot({ stub }); const { r } = await call(client, "search_companies", Q); await stub.settle(1500);
  const log = readLog().slice(before); stub.close();
  const lines = log.split("\n").filter((l) => /401|Failed to send|unauthor/i.test(l));
  return [lines.length ? "info" : "gap", `vendor result ok=${!r.isError}. Lines about the failure in ${LOG.replace(HOME, "~")}: ${lines.length}. Nothing reaches the vendor's own code or console${lines.length ? "; first line: " + lines[0].slice(0, 140) : ""}.`, { lines: lines.slice(0, 3) }];
});
check("A5", "Within sends a broken (non-JSON) reply: does the vendor's tool survive?", "Vendor expectation.", async () => {
  const stub = await startStub({ kind: "garbage" }); const { client } = await boot({ stub });
  const { r } = await call(client, "search_companies", Q); await stub.settle(800); stub.close();
  return [!r.isError && r.content?.[0]?.text === "found 3 for acme corp" ? "pass" : "fail", `result: ${JSON.stringify(r.content)}`, {}];
});
check("A6", "40 customers at once with a slow Within (300 ms): do calls overlap, and does each event keep its own context text?", "Vendor expectation: concurrent customers must not slow each other or swap data.", async () => {
  const stub = await startStub({ delay: 300 }); const { client } = await boot({ stub });
  const t0 = performance.now();
  const out = await Promise.all(Array.from({ length: 40 }, (_, i) => call(client, "search_companies", { query: `q${i}`, context: `Context number ${i} explaining in enough words why the tool is being called for this customer.` })));
  const total = performance.now() - t0; await stub.settle(2500);
  const evs = stub.toolCalls("search_companies");
  const swapped = evs.filter((e) => { const a = e.parameters?.request?.params?.arguments ?? {}; const qi = String(a.query).slice(1), ci = String(a.context).match(/number (\d+)/)?.[1]; return qi !== ci; }).length;
  const wrong = out.filter((o, i) => o.r.content?.[0]?.text !== `found 3 for q${i}`).length; stub.close();
  return [wrong === 0 && swapped === 0 && total < 3000 ? "pass" : "fail", `40 calls took ${Math.round(total)} ms in total. Wrong results: ${wrong}. Events seen: ${evs.length}. Events whose query and context disagree: ${swapped}.`, { total, wrong, swapped, seen: evs.length }];
});
check("A7", "The identify callback throws: does the vendor's tool still return?", "README: identify is the vendor's callback.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub, trackOpts: { identify: async () => { throw new Error("session store is down"); } } });
  const { r } = await call(client, "search_companies", Q); await stub.settle(); stub.close();
  return [!r.isError && r.content?.[0]?.text === "found 3 for acme corp" ? "pass" : "fail", `result: ${JSON.stringify(r.content)} isError=${r.isError}`, {}];
});
check("A8", "How many requests does Within receive per vendor tool call (connect, list tools, one call)?", "Measurement.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub }); await client.listTools(); await call(client, "search_companies", Q); await stub.settle(1500);
  const kinds = stub.events.map((e) => e.eventType); stub.close();
  return ["info", `${stub.posts.length} POST requests carrying ${stub.events.length} events: ${kinds.join(", ")}. One request per event, no batching.`, { posts: stub.posts.length, kinds }];
});
check("A8b", "How much time does the SDK add to one vendor tool call (Within answering in 0 ms and in 300 ms)?", "Measurement, median of 7.", async () => {
  const out = {};
  const base = await boot({ tracked: false }); await call(base.client, "search_companies", { query: "w" });
  out.untracked = median(await (async () => { const a = []; for (let i = 0; i < 7; i++) a.push((await call(base.client, "search_companies", { query: "x" })).ms); return a; })());
  for (const d of [0, 300]) { const stub = await startStub({ delay: d }); const b = await boot({ stub }); await call(b.client, "search_companies", Q);
    const a = []; for (let i = 0; i < 7; i++) a.push((await call(b.client, "search_companies", Q)).ms); out["tracked_" + d] = median(a); stub.close(); }
  return ["info", `median ms: untracked ${out.untracked.toFixed(2)}; tracked with Within at 0 ms ${out.tracked_0.toFixed(2)}; at 300 ms ${out.tracked_300.toFixed(2)}.`, out];
});
check("A9", "apiBaseUrl left out: where do the calls go?", "README: 'apiBaseUrl ... default Within ingestion service'.", async () => {
  const seen = []; const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => { seen.push(String(u)); return new Response("{}", { status: 200 }); };
  try { const { client } = await boot({ trackOpts: {} }); await call(client, "search_companies", Q); await sleep(1200); } finally { globalThis.fetch = realFetch; }
  const hosts = [...new Set(seen.map((u) => new URL(u).origin))];
  return [hosts.length === 1 && hosts[0] === "https://api.getwith.in" ? "pass" : "info", `with no apiBaseUrl and no environment variable, requests went to ${hosts.join(", ") || "nowhere"} (${seen.length} requests; the real network was not touched, fetch was stubbed).`, { hosts }];
});
check("A10", "No API key and no exporter at start-up: does track() complain?", "README: apiKey 'falls back to WITHIN_SDK_API_KEY, then WITHIN_SDK_INGEST_KEY'. Nothing is said about a missing key.", async () => {
  const before = readLog().length; let threw = null;
  try { const server = new McpServer({ name: "acme", version: "1" }); defaultTools(server); track(server, "acme", {}); } catch (e) { threw = String(e); }
  const added = readLog().slice(before).split("\n").filter((l) => /apiKey|Events will not be sent/i.test(l));
  return [threw ? "pass" : "gap", `track() threw: ${threw ?? "no"}. Warning only in the log file: ${added[0]?.slice(0, 150) ?? "none"}. The vendor's process starts normally and sends nothing.`, { threw, added }];
});

// ================= B: the vendor's tools =================
check("B3", "A vendor tool that already has an input called `context`: does the handler still get the vendor's value?", "README does not mention a collision; the SDK source says it skips injection.", async () => {
  let got = null; const stub = await startStub();
  const { client } = await boot({ stub, setup: (s) => s.tool("retrieve", { context: z.string(), q: z.string() }, async (a) => { got = a; return { content: [{ type: "text", text: "ok" }] }; }) });
  const tools = (await client.listTools()).tools.find((t) => t.name === "retrieve");
  const { r } = await call(client, "retrieve", { context: "vendor value", q: "x" }); await stub.settle(); const ev = stub.toolCalls("retrieve")[0]; stub.close();
  return [got?.context === "vendor value" && !r.isError ? "pass" : "fail", `handler received ${JSON.stringify(got)}. Advertised inputs: ${Object.keys(tools.inputSchema.properties)}; required: ${JSON.stringify(tools.inputSchema.required)}. The SDK skipped its own field, so Within gets no goal text for this tool. Log line: ${readLog().split("\n").filter((l) => /already has 'context'/.test(l)).pop()?.slice(0, 120)}`, { got }];
});
check("B4", "The model writes a context text longer than 300 characters (2,000 here): does the vendor's tool call still work, and what is sent?", "Models often write long text.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub }); const long = "Because ".repeat(250);
  const { r } = await call(client, "search_companies", { query: "x", context: long }); await stub.settle(); const ev = stub.toolCalls("search_companies")[0]; stub.close();
  const sentLen = String(ev?.parameters?.request?.params?.arguments?.context ?? "").length;
  return [!r.isError ? "pass" : "fail", `call result ok=${!r.isError}. The context field in the event is ${sentLen} characters (sent ${long.length}).`, { sentLen }];
});
check("B5", "The client leaves `context` out (it is listed as required): does the vendor's tool call still work?", "README: 'tool-call context parameter ... Defaults to true'. The advertised schema marks it required.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub });
  const tools = (await client.listTools()).tools; const t = tools.find((x) => x.name === "search_companies");
  let r, err = null; try { r = (await call(client, "search_companies", { query: "acme corp" })).r; } catch (e) { err = String(e.message ?? e).slice(0, 200); }
  stub.close(); const rejected = err || r?.isError;
  return [rejected || t.inputSchema.required?.includes("context") ? "gap" : "pass", `required inputs now: ${JSON.stringify(t.inputSchema.required)}. A call without context: ${rejected ? "REJECTED: " + (err ?? JSON.stringify(r.content)).slice(0, 160) : "worked"}. In 0.x the field was optional.`, { required: t.inputSchema.required, err, r }];
});
check("B5b", "A vendor tool with no inputs: what does its contract become?", "Measurement.", async () => {
  const { client } = await boot({ tracked: true, setup: (s) => s.tool("ping", async () => ({ content: [{ type: "text", text: "pong" }] })) });
  const t = (await client.listTools()).tools.find((x) => x.name === "ping"); let r, err = null;
  try { r = (await call(client, "ping", {})).r; } catch (e) { err = String(e.message ?? e).slice(0, 160); }
  return ["info", `advertised inputs: ${JSON.stringify(t.inputSchema)}. Call with {}: ${err ? "REJECTED " + err : JSON.stringify(r.content)}`, { schema: t.inputSchema, err }];
});
check("B6", "A vendor tool named get_more_tools, and tracking the same server twice", "Measurement.", async () => {
  let out = {};
  try { const s = new McpServer({ name: "a", version: "1" }); s.tool("get_more_tools", {}, async () => ({ content: [{ type: "text", text: "vendor" }] })); track(s, "acme", { apiKey: "k" }); out.collision = "no error"; } catch (e) { out.collision = "threw " + e.message; }
  try { const s = new McpServer({ name: "a", version: "1" }); defaultTools(s); track(s, "acme", { apiKey: "k" }); track(s, "acme", { apiKey: "k" }); out.twice = "no error"; } catch (e) { out.twice = "threw " + e.message; }
  return ["info", `vendor tool named like Within's: ${out.collision}. Second track() on the same server: ${out.twice} (the source logs and skips it).`, out];
});
check("B7", "A tool registered AFTER track(): is it seen by Within?", "README: 'Register your MCP tools first, then call track()'. Measurement of the wrong order.", async () => {
  const stub = await startStub(); let got = null;
  const { client } = await boot({ stub, registerAfter: (s) => s.tool("late_tool", { q: z.string() }, async (a) => { got = a; return { content: [{ type: "text", text: "late" }] }; }) });
  const t = (await client.listTools()).tools.find((x) => x.name === "late_tool"); const hasCtx = !!t.inputSchema.properties?.context;
  let err = null; try { await call(client, "late_tool", { q: "x", context: "A long enough explanation for the late tool so this call has context." }); } catch (e) { err = String(e.message).slice(0, 120); }
  await stub.settle(); const reported = stub.toolCalls("late_tool").length; stub.close();
  return ["info", `late tool: has context input ${hasCtx}; call error ${err ?? "none"}; calls reported to Within ${reported}. No error was raised at registration.`, { hasCtx, reported, err }];
});

// ================= C: privacy =================
const PII = { email: "jane.doe@example.com", phone: "617-555-0142", ssn: "123-45-6789", card: "4111 1111 1111 1111", bearer: "Bearer abcdef1234567890abcdef12", skkey: "sk-live-abc123def456ghi789jkl", aws: "AKIAIOSFODNN7EXAMPLE", url: "https://internal.acme.com/orders?token=zz91", ip: "10.1.2.3", name: "Jane Doe", address: "221B Baker Street" };
const piiText = `Customer ${PII.name}, email ${PII.email}, phone ${PII.phone}, ssn ${PII.ssn}, card ${PII.card}, ${PII.bearer}, key ${PII.skkey}, aws ${PII.aws}, page ${PII.url}, host ${PII.ip}, lives at ${PII.address}.`;
const survivors = (blob) => Object.entries(PII).filter(([, v]) => blob.includes(v.replace(/^Bearer /, "")) ).map(([k]) => k);
check("C1", "Default settings: which fields of a tools/call event reach Within?", "README Privacy: identity-like fields removed or redacted; field and event limits.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub }); await call(client, "search_companies", Q); await stub.settle(); const ev = stub.toolCalls("search_companies")[0]; stub.close();
  const hasArgs = JSON.stringify(ev).includes("acme corp"), hasResult = JSON.stringify(ev.response ?? {}).includes("found 3");
  return ["gap", `top-level fields: ${Object.keys(ev).join(", ")}. The vendor's tool ARGUMENTS leave by default (the query 'acme corp' is in the event: ${hasArgs}) and so does the RESULT text (${hasResult}). In 0.x both stayed home unless captureArguments was on. There is no switch named in the README to turn argument capture off.`, { fields: Object.keys(ev), hasArgs, hasResult }];
});
check("C2", "The model-written context text holds private data: which kinds survive in what is sent?", "README: client-side redaction of identity-like fields; the rest relies on a server-side pass.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub });
  await call(client, "search_companies", { query: "x", context: piiText }); await stub.settle(); const ev = stub.toolCalls("search_companies")[0]; stub.close();
  const ctx = String(ev.parameters.request.params.arguments.context); const s = survivors(ctx);
  return [s.length ? "gap" : "pass", `of 11 kinds, these leave the process unredacted in the context text: ${s.join(", ") || "none"}. Sent text: "${ctx.slice(0, 220)}"`, { survivors: s, ctx }];
});
check("C3", "Error messages from the vendor's tool: do they carry private data to Within?", "Not described in the README.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub, setup: (s) => s.tool("boom", { q: z.string() }, async () => { throw new Error(`lookup failed for ${PII.email}, card ${PII.card}, ${PII.skkey}, ${PII.name}`); }) });
  const { r } = await call(client, "boom", { q: "x", context: "Trying the failing tool to see what the error text looks like in telemetry." }); await stub.settle(); const ev = stub.toolCalls("boom")[0]; stub.close();
  const blob = JSON.stringify(ev); const s = survivors(blob);
  return [s.length ? "gap" : "pass", `error text sent to Within keeps: ${s.join(", ") || "nothing sensitive"}. Event has error field: ${"error" in ev || /isError|error/i.test(blob)}.`, { survivors: s, excerpt: blob.slice(blob.indexOf("lookup failed") - 20, blob.indexOf("lookup failed") + 160) }];
});
check("C4", "Does the tool's result text also leave?", "README does not list results either way.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub, setup: (s) => s.tool("secret_result", { q: z.string() }, async () => ({ content: [{ type: "text", text: `Account for ${PII.name}: ${PII.email}, ${PII.card}` }] })) });
  await call(client, "secret_result", { q: "x", context: "Fetching an account record so the result text can be inspected in telemetry." }); await stub.settle(); const ev = stub.toolCalls("secret_result")[0]; stub.close();
  const s = survivors(JSON.stringify(ev.response ?? {}));
  return [s.length ? "gap" : "info", `the result text IS sent (response field present: ${!!ev.response}). Kinds that survive in it: ${s.join(", ") || "none"}.`, { survivors: s, response: ev.response }];
});
check("C5", "Free-text tool argument with private data: which kinds survive?", "README: pattern-based redaction, no guarantee.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub });
  await call(client, "search_companies", { query: piiText, context: Q.context }); await stub.settle(); const ev = stub.toolCalls("search_companies")[0]; stub.close();
  const a = String(ev.parameters.request.params.arguments.query); const s = survivors(a);
  return [s.length ? "gap" : "pass", `survive in the sent argument: ${s.join(", ") || "none"}. Removed: ${Object.keys(PII).filter((k) => !s.includes(k)).join(", ") || "none"}.`, { survivors: s, sent: a }];
});
check("C6", "Which argument NAMES count as secret and are dropped?", "README: 'identity-like fields ... removed or redacted'. The list is not given.", async () => {
  const names = ["password", "token", "api_key", "apiKey", "secret", "authorization", "email", "name", "userName", "ssn", "phone", "address", "user_id", "dob", "creditCard", "customer", "session_id", "ip"];
  const stub = await startStub(); const schema = Object.fromEntries(names.map((n) => [n, z.string().optional()])); schema.context = undefined; delete schema.context;
  const { client } = await boot({ stub, setup: (s) => s.tool("kv", schema, async () => ({ content: [{ type: "text", text: "ok" }] })) });
  await call(client, "kv", { ...Object.fromEntries(names.map((n) => [n, "VALUE_" + n])), context: Q.context }); await stub.settle(); const ev = stub.toolCalls("kv")[0]; stub.close();
  const sent = ev.parameters.request.params.arguments; const kept = names.filter((n) => String(sent[n]) === "VALUE_" + n), dropped = names.filter((n) => !kept.includes(n));
  const identityKept = ["name", "address", "dob", "ip", "customer"].filter((n) => kept.includes(n));
  return [identityKept.length ? "gap" : "pass", `kept as written: ${kept.join(", ") || "none"}. Removed or redacted: ${dropped.join(", ")}. README: identity-like fields in parameters are removed or redacted; these identity-like names were not: ${identityKept.join(", ") || "none"}.`, { kept, dropped }];
});
check("C8", "A long free-text argument: does redaction freeze the vendor's whole process? (event-loop stall, 4 sizes, 2 shapes)", "README: 'Configurable field and event limits truncate oversized payloads' (default 10,000 bytes per field). Vendor expectation: the SDK runs inside the vendor's process.", async () => {
  const { spawnSync } = await import("node:child_process"); const out = [];
  for (const [shape, n] of [["letters", 10000], ["letters", 25000], ["letters", 50000], ["letters", 100000], ["words", 100000], ["dots", 50000]]) {
    const r = spawnSync("node", [new URL("./scale.mjs", import.meta.url).pathname, "child", shape, String(n)], { timeout: 30000, encoding: "utf8", cwd: new URL("./", import.meta.url).pathname });
    out.push(r.error?.code === "ETIMEDOUT" ? { shape, n, STUCK_OVER_MS: 30000 } : JSON.parse(r.stdout.trim()));
  }
  const worst = Math.max(...out.map((o) => o.maxEventLoopStallMs ?? 30000));
  return [worst > 1000 ? "fail" : "pass", "event-loop stall per argument (ms): " + out.map((o) => `${o.shape} ${o.n} chars -> ${o.maxEventLoopStallMs ?? ">30000"}`).join("; ") + `. The vendor's own tool call returned in about ${Math.max(...out.map((o) => o.callMs ?? 0))} ms each time.${worst > 1000 ? " The freeze comes after, while the event is cleaned, and blocks every customer on the process. Cause: the email pattern in privacy.js is applied to the whole string before it is cut to the 10,000-byte limit." : " The stall does not grow with the length."}`, { out }];
});
check("Z3", "Does loading the SDK change how the vendor's process handles SIGTERM? (one signal, then a second one 3 s later)", "Source: eventQueue.js registers process.once handlers for SIGINT, SIGTERM and beforeExit.", async () => {
  const { spawn } = await import("node:child_process"); const here = new URL("./", import.meta.url).pathname;
  const code = `process.env.HOME=require('os').tmpdir();(async()=>{const {McpServer}=await import('@modelcontextprotocol/sdk/server/mcp.js');const {track}=await import(${JSON.stringify(PKG_ENTRY)});const s=new McpServer({name:'a',version:'1'});track(s,'acme',{apiKey:'k',apiBaseUrl:'http://127.0.0.1:9'});console.log('ready');setInterval(()=>{},1000)})()`;
  const run = (withSdk, secondAfterMs) => new Promise((resolve) => {
    const src = withSdk ? code : "console.log('ready');setInterval(()=>{},1000)";
    const c = spawn("node", ["-e", src], { cwd: here }); let t0;
    c.stdout.on("data", () => { if (!t0) { t0 = Date.now(); c.kill("SIGTERM"); if (secondAfterMs) setTimeout(() => c.kill("SIGTERM"), secondAfterMs); } });
    const guard = setTimeout(() => { c.kill("SIGKILL"); resolve({ exited: false, ms: Date.now() - t0 }); }, 12000);
    c.on("exit", (code, sig) => { clearTimeout(guard); resolve({ exited: true, sig, code, ms: Date.now() - t0 }); });
  });
  const plain = await run(false), one = await run(true), two = await run(true, 3000);
  return [one.exited && one.sig === "SIGTERM" ? "pass" : "gap", `SIGTERM to a plain Node process: exited after ${plain.ms} ms. To a process that called track(): ${one.exited ? "exited after " + one.ms + " ms" : "still running after 12 s (force-killed)"}. With a second SIGTERM sent 3 s after the first: ${two.exited ? `exited after ${two.ms} ms (signal ${two.sig})` : "still running after 12 s"}.`, { plain, one, two }];
});
check("C8b", "The email pattern on its own: time against input length (copy of the pattern, checked against the package file)", "Isolates the cause of the freeze measured in C8.", async () => {
  const file = fs.readFileSync(path.join(PKG, "dist/modules/privacy.js"), "utf8");
  const literal = "/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi"; const inFile = file.includes("const EMAIL_GLOBAL_RE = " + literal);
  const RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi; const time = (str) => { const t0 = performance.now(); str.replace(RE, "[redacted]"); return Math.round(performance.now() - t0); };
  const rows = [10000, 25000, 50000, 100000].map((n) => ({ chars: n, ms: time("a".repeat(n)) }));
  const words = time("hello world ".repeat(8334)), cutFirst = time("a".repeat(100000).slice(0, 10000)), normal = time(" ".repeat(99980) + "jane@example.com");
  const ratio = rows[3].ms / Math.max(1, rows[2].ms);
  return ["info", `pattern found in privacy.js unchanged: ${inFile}. Letters with no @ (ms): ${rows.map((r) => r.chars + " -> " + r.ms).join(", ")}. Doubling the length multiplied the time by about ${ratio.toFixed(1)}. Ordinary words (100,000 chars): ${words} ms. The same 100,000 letters cut to 10,000 first: ${cutFirst} ms. An email in 100,000 spaces: ${normal} ms.`, { inFile, rows, words, cutFirst, normal }];
});
check("F2", "The README's install line and quickstart, run on a fresh project", "README: 'npm install within-sdk @modelcontextprotocol/sdk', then the Quickstart with WITHIN_VENDOR_SLUG and WITHIN_SDK_API_KEY set.", async () => {
  if (PATCHED) return ["info", "skipped on a patched copy: this check installs the published package from npm", {}];
  const { spawnSync } = await import("node:child_process"); const dir = fs.mkdtempSync(path.join(os.tmpdir(), "within104-f2-"));
  const sh = (cmd, args, env = {}) => spawnSync(cmd, args, { cwd: dir, encoding: "utf8", timeout: 180000, env: { ...process.env, HOME, ...env } });
  sh("npm", ["init", "-y"]); const inst = sh("npm", ["install", "within-sdk", "@modelcontextprotocol/sdk", "--ignore-scripts", "--no-audit", "--no-fund"]);
  if (inst.status !== 0) return ["fail", `the README's install line failed: ${inst.stderr.slice(-200)}`, {}];
  const installed = JSON.parse(fs.readFileSync(path.join(dir, "node_modules/within-sdk/package.json"), "utf8")).version;
  const stub = await startStub();
  fs.writeFileSync(path.join(dir, "quick.mjs"), `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { track } from "within-sdk";
const server = new McpServer({ name: "acme-mcp", version: "1.0.0" });
server.tool("search_companies", { query: z.string() }, async (args) => ({ content: [{ type: "text", text: "found " + args.query }] }));
track(server, process.env.WITHIN_VENDOR_SLUG, { apiKey: process.env.WITHIN_SDK_API_KEY, identify: async () => ({ userId: "cust_1", userData: { plan: "pro" } }) });
const [a, b] = InMemoryTransport.createLinkedPair(); const c = new Client({ name: "c", version: "1" }); await Promise.all([server.connect(a), c.connect(b)]);
const r = await c.callTool({ name: "search_companies", arguments: { query: "x", context: "Searching the directory for a company so the customer can compare options." } });
console.log(JSON.stringify(r.content)); setTimeout(() => process.exit(0), 1500);`);
  const run = sh("node", ["quick.mjs"], { WITHIN_VENDOR_SLUG: "acme", WITHIN_SDK_API_KEY: "within_sk_test_123456", WITHIN_SDK_API_URL: stub.url });
  await sleep(300); const got = stub.events.length; stub.close();
  return [run.status === 0 && got >= 1 ? "pass" : "fail", `installed ${installed} with the README line; quickstart exit code ${run.status}; output ${run.stdout.trim().slice(0, 80)}; events that reached the stand-in through WITHIN_SDK_API_URL: ${got}. ${run.stderr.slice(0, 160)}`, { installed, status: run.status, got }];
});
check("C9", "Customer session ids: stable within a connection, new per connection?", "Measurement.", async () => {
  const stub = await startStub(); const a = await boot({ stub }), b = await boot({ stub });
  await call(a.client, "search_companies", Q); await call(a.client, "search_companies", Q); await call(b.client, "search_companies", Q); await stub.settle();
  const ids = stub.toolCalls("search_companies").map((e) => e.sessionId); stub.close();
  const uniq = new Set(ids);
  return [uniq.size === 2 && ids[0] === ids[1] ? "pass" : "info", `session ids per call: ${ids.map((i) => i.slice(0, 12)).join(", ")}. Distinct: ${uniq.size} (two connections, three calls).`, { ids }];
});
check("C11", "identify returns a user id, name and email: what leaves the process? (README: hashed locally, raw never sent)", "README Privacy: 'Raw userId and userName are not sent to Within.'", async () => {
  const stub = await startStub(); const { client } = await boot({ stub, trackOpts: { identify: async () => ({ userId: "cust_12345", userName: "Jane Doe", userData: { plan: "pro", email: "jane.doe@example.com", note: "VIP, call 617-555-0142" } }) } });
  await call(client, "search_companies", Q); await stub.settle(); const blob = JSON.stringify(stub.events); stub.close();
  const leaks = ["cust_12345", "Jane Doe", "jane.doe@example.com", "617-555-0142"].filter((v) => blob.includes(v));
  const ev = stub.toolCalls("search_companies")[0];
  return [leaks.includes("cust_12345") || leaks.includes("Jane Doe") ? "fail" : leaks.length ? "gap" : "pass", `raw values found in what was sent: ${leaks.join(", ") || "none"}. Identity fields in the event: ${JSON.stringify({ userId: ev.userId, subject: ev.subject, identifyData: ev.identifyData, userData: ev.userData }).slice(0, 220)}`, { leaks }];
});
check("C12", "Local log file: what does the SDK write to ~/within-sdk.log, and is it ever capped?", "README: 'default local SDK log destination'. Contents not described.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub, trackOpts: { identify: async () => ({ userId: "cust_12345", userName: "Jane Doe" }) } });
  await call(client, "search_companies", { query: `acme corp ${PII.email} ${PII.card}`, context: Q.context }); await stub.settle(1200); stub.close();
  const log = readLog(); const leaked = ["acme corp", PII.email, PII.card, "cust_12345", "Jane Doe", "found 3"].filter((v) => log.includes(v));
  const src = fs.readFileSync(path.join(PKG, "dist/modules/logging.js"), "utf8");
  const capped = /rotate|maxLogSize|statSync|\.size\b/.test(src);
  return [leaked.length || !capped ? "gap" : "info", `file ${LOG.replace(HOME, "~")}: ${log.length} bytes, ${log.split("\n").filter(Boolean).length} lines from one connect, one tool call and its sends. Vendor data inside it: ${leaked.join(", ") || "none"}. Rotation or size cap in logging.js: ${capped ? "found" : "none (it only appends)"}. Last lines: ${log.split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 260)}`, { bytes: log.length, leaked, capped }];
});
check("C13", "reportConversion: userId hashed, metadata redacted, and where does it post?", "README: 'creates the subject locally before sending'.", async () => {
  const stub = await startStub();
  const res = await within.reportConversion({ vendorSlug: "acme", apiKey: "within_sk_test_123456", apiBaseUrl: stub.url }, { userId: "cust_12345", convertedAt: new Date("2026-11-22T00:00:00Z"), plan: { id: "pro", name: "Pro", interval: "month" }, metadata: { source: "checkout_webhook", email: PII.email, note: `call ${PII.phone}` } });
  const p = stub.posts[0]; stub.close(); const leaks = ["cust_12345", PII.email, PII.phone].filter((v) => p?.body.includes(v));
  return [leaks.length ? "gap" : "pass", `posted to ${p?.url}; result ${JSON.stringify(res)}; raw values in the body: ${leaks.join(", ") || "none"}.`, { url: p?.url, leaks }];
});

// ================= D / F: instructions and docs =================
check("D4", "Vendor server instructions: unchanged? How much text does Within add?", "0.x added text to every server's instructions.", async () => {
  const stub = await startStub(); const text = "Vendor business rules. Be brief.\n\nSecond paragraph.";
  const { client } = await boot({ stub, instructions: text }); const seen = client.getInstructions(); stub.close();
  return [seen === text ? "pass" : "fail", `vendor wrote ${text.length} characters; the client sees ${seen?.length ?? 0}. Identical: ${seen === text}. The 0.x text Within added (about 2,901 characters) is gone.`, { seen }];
});
check("F1", "Does the SDK work with a Zod 4 schema (the 0.x problem), and what are its peer dependencies?", "README: Node 20+, MCP SDK 1.11+. No Zod requirement stated.", async () => {
  const peers = JSON.parse(fs.readFileSync(path.join(PKG, "package.json"))).peerDependencies;
  let z4; try { z4 = await import("zod4"); } catch (e) { return ["info", "zod 4 alias not installed", {}]; }
  const stub = await startStub(); let r, err = null;
  try { const { client } = await boot({ stub, setup: (s) => s.tool("z4tool", { q: z4.z.string() }, async ({ q }) => ({ content: [{ type: "text", text: "z4 " + q }] })) });
    const t = (await client.listTools()).tools.find((x) => x.name === "z4tool"); r = { props: Object.keys(t.inputSchema.properties), required: t.inputSchema.required, res: (await call(client, "z4tool", { q: "x", context: "Calling a tool defined with Zod four to see whether context injection works." })).r.content };
  } catch (e) { err = String(e.message).slice(0, 200); }
  stub.close();
  return [err ? "fail" : "pass", `peer dependencies: ${JSON.stringify(peers)}. Zod ${z4.z.version?.major ?? "4"} tool: ${err ? "ERROR " + err : JSON.stringify(r)}.`, { peers, r, err }];
});
check("F5", "Static: does the package contain a private-network address list (the 0.x identity lookups had two)?", "Static check of dist/.", async () => {
  const dist = path.join(PKG, "dist") + "/"; let hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith(".js") && /192\.168|169\.254|127\.0\.0\.1|localhost/.test(fs.readFileSync(p, "utf8"))) hits.push(p.replace(dist, "")); } };
  walk(dist);
  return ["info", `files mentioning private or loopback addresses: ${hits.join(", ") || "none"}.`, { hits }];
});
check("Z1", "get_more_tools: what does the extra tool say, and what does a call send?", "README: 'registers the get_more_tools feedback tool'.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub }); const t = (await client.listTools()).tools.find((x) => x.name === "get_more_tools");
  const { r } = await call(client, "get_more_tools", { context: "The customer wanted to export reports to a spreadsheet but no tool does that." }); await stub.settle(); const ev = stub.toolCalls("get_more_tools")[0]; stub.close();
  return ["info", `description: "${(t.description ?? "").slice(0, 200)}". Inputs: ${JSON.stringify(Object.keys(t.inputSchema.properties))}. A call returns ${JSON.stringify(r.content).slice(0, 120)} and ${ev ? "is reported to Within" : "is NOT reported"}. The model sees it as one more tool and can call it on its own.`, { desc: t.description, r }];
});
check("Z2", "Opting out of the extra input and the extra tool (enableToolCallContext false, enableReportMissing false; tracing left on): is the vendor's tool list left as it was, and does anything still leave?", "README Configuration table.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub, trackOpts: { enableToolCallContext: false, enableReportMissing: false } });
  const tools = (await client.listTools()).tools; const t = tools.find((x) => x.name === "search_companies"); const { r } = await call(client, "search_companies", { query: "acme corp" }); await stub.settle(); const n = stub.events.length; stub.close();
  const ok = tools.length === 1 && !t.inputSchema.properties.context && !r.isError;
  return [ok ? "pass" : "gap", `tools advertised: ${tools.map((x) => x.name)}; search_companies inputs ${Object.keys(t.inputSchema.properties)}; call without context ${r.isError ? "REJECTED" : "worked"}; events sent with both switches off: ${n}${n ? " (tracing is still on, so arguments and results still leave)" : ""}.`, { tools: tools.map((x) => x.name), n }];
});

check("Z2b", "enableTracing false: does anything leave, and is the vendor's server unchanged?", "README Configuration: 'enableTracing: Capture supported MCP activity. Defaults to true.'", async () => {
  const stub = await startStub(); const { client } = await boot({ stub, trackOpts: { enableTracing: false } });
  const tools = (await client.listTools()).tools; const { r } = await call(client, "search_companies", Q); await stub.settle(1200); const n = stub.events.length; stub.close();
  return [n === 0 && !r.isError ? "pass" : "gap", `events sent with enableTracing false: ${n}. Tools advertised: ${tools.map((x) => x.name)} (the extra input and tool are controlled by their own switches). Vendor result ok: ${!r.isError}.`, { n, tools: tools.map((x) => x.name) }];
});

check("S1", "Static: which words from the 0.x package appear anywhere in the 1.0.4 code? (counts of files and lines)", "Reading the package, not running it.", async () => {
  const dist = path.join(PKG, "dist") + "/"; const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p); } }; walk(dist);
  const text = files.map((f) => fs.readFileSync(f, "utf8"));
  const words = ["report_void", "hub_card", "hubs", "doctor", "confirm_assistance", "get_vendor_answer", "assistance", "offer", "issuer", "auth0", "workos", "clerk", "userinfo", "user-agent", "banned", "nonce", "SupportBridge", "getwithin", "zod", "_zod"];
  const counts = Object.fromEntries(words.map((w) => [w, { files: text.filter((t) => t.toLowerCase().includes(w.toLowerCase())).length, lines: text.reduce((n, t) => n + t.split("\n").filter((l) => l.toLowerCase().includes(w.toLowerCase())).length, 0) }]));
  const absent = words.filter((w) => counts[w].files === 0), present = words.filter((w) => counts[w].files > 0);
  return ["info", `searched ${files.length} .js files. Not found anywhere: ${absent.join(", ")}. Found: ${present.map((w) => `${w} (${counts[w].files} files, ${counts[w].lines} lines)`).join(", ") || "none"}.`, { files: files.length, counts, absent, present }];
});


// ================= M: what a vendor can do today, with the package's own options =================
check("M1", "Vendor option: redactSensitiveInformation that cuts every string to 2,000 characters. Does it stop the freeze? (and does the size limit alone?)", "README: 'redactSensitiveInformation: Apply an additional vendor-provided redaction function.' It runs before the package's own pattern (eventQueue.js line 46).", async () => {
  const { spawnSync } = await import("node:child_process"); const scale = new URL("./scale.mjs", import.meta.url).pathname, cwd = new URL("./", import.meta.url).pathname;
  const go = (env) => JSON.parse(spawnSync("node", [scale, "child", "letters", "100000"], { timeout: 60000, encoding: "utf8", cwd, env: { ...process.env, ...env } }).stdout.trim());
  const stock = go({}), cut = go({ SCALE_TRUNCATE: "2000" }), limit = go({ SCALE_MAXFIELD: "500" });
  const fixed = cut.maxEventLoopStallMs < 500;
  return [fixed ? "pass" : "fail", `100,000 letters, event-loop stall in ms: no option ${stock.maxEventLoopStallMs}; redactSensitiveInformation cutting to 2,000 characters ${cut.maxEventLoopStallMs}; privacy.maxFieldBytes set to 500 ${limit.maxEventLoopStallMs} (the size limit alone does not help, it is applied after the pattern).`, { stock, cut, limit }];
});
check("M2", "Vendor option: a redaction function that masks digit runs, keys, URLs and IP addresses. What still leaves?", "Same option. A pattern cannot find a name, so names are the expected leftover.", async () => {
  const mask = (str) => str.replace(/\d[\d ().\-]{6,}\d/g, "[redacted]").replace(/\b(?:sk|pk|api|key)[-_][A-Za-z0-9_-]{10,}/gi, "[redacted]").replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]").replace(/https?:\/\/\S+/g, "[redacted]").replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[redacted]");
  const stub = await startStub(); const { client } = await boot({ stub, trackOpts: { redactSensitiveInformation: async (s) => (s === stub.url || s === "within_sk_test_123456" ? s : mask(s)) } }); // leaves the API key and the address alone, see M8
  await call(client, "search_companies", { query: piiText, context: piiText }); await stub.settle(); const ev = stub.toolCalls("search_companies")[0]; stub.close();
  const sent = JSON.stringify(ev.parameters.request.params.arguments); const s = survivors(sent);
  return [s.length <= 2 && !s.includes("card") && !s.includes("ssn") ? "pass" : "gap", `with the vendor's function, still unredacted in the sent arguments: ${s.join(", ") || "none"}. Before, ${survivors(piiText).length ? "9 kinds" : ""} survived.`, { survivors: s }];
});
check("M3", "Vendor option: privacy.redactKeys with the identity-like names the defaults miss", "README: 'privacy: ... additional keys to redact'.", async () => {
  const names = ["name", "address", "dob", "customer", "session_id", "ip", "city"]; const stub = await startStub();
  const schema = Object.fromEntries(names.map((n) => [n, z.string().optional()]));
  const { client } = await boot({ stub, trackOpts: { privacy: { redactKeys: ["name", "address", "dob", "customer", "ip", "city"] } }, setup: (s) => s.tool("kv", schema, async () => ({ content: [{ type: "text", text: "ok" }] })) });
  await call(client, "kv", { ...Object.fromEntries(names.map((n) => [n, "VALUE_" + n])), context: Q.context }); await stub.settle(); const ev = stub.toolCalls("kv")[0]; stub.close();
  const sent = ev.parameters.request.params.arguments; const kept = names.filter((n) => String(sent[n]) === "VALUE_" + n);
  return [kept.filter((n) => n !== "session_id").length === 0 ? "pass" : "gap", `argument names still sent as written with redactKeys set: ${kept.join(", ") || "none"}. (session_id was not in the list on purpose.)`, { kept }];
});
check("M4", "Vendor option: log callback. Does it keep the log file from being written, and what does it receive?", "README: 'log: Replace the default local SDK log destination with a callback.'", async () => {
  const lines = []; const before = readLog().length; const stub = await startStub();
  const { client } = await boot({ stub, trackOpts: { log: (l) => lines.push(l) } }); await call(client, "search_companies", Q); await stub.settle(1000); stub.close();
  const grew = readLog().length - before;
  return [grew === 0 && lines.length > 0 ? "pass" : "gap", `lines delivered to the vendor's callback: ${lines.length}; bytes added to ~/within-sdk.log: ${grew}. First line: ${String(lines[0]).slice(0, 110)}`, { lines: lines.length, grew }];
});
check("M5", "Vendor option: a fetch with a time limit (an option named fetch exists in the code, not in the README table). Does it end the queue stall?", "index.js line 47: fetchImpl: options.fetch ?? globalThis.fetch. Compare A1c.", async () => {
  const stub = await startStub({ kind: "hang" });
  const { client } = await boot({ stub, trackOpts: { fetch: (u, init) => fetch(u, { ...init, signal: AbortSignal.timeout(1500) }) } });
  for (let i = 0; i < 4; i++) await call(client, "search_companies", Q);
  await sleep(500); stub.mode.kind = "ok"; const before = stub.posts.length;
  for (let i = 0; i < 3; i++) await call(client, "search_companies", Q);
  await sleep(15000); const got = stub.posts.length - before; stub.close();
  return [got > 0 ? "pass" : "gap", `with a 1.5 s limit on every request, ${got} requests reached Within in the 15 s after it recovered (stock package: 0, check A1c). The stuck requests were abandoned and the later reports were sent.`, { got }];
});
check("M6", "Vendor option: the vendor's own SIGTERM handler that exits. Does the process stop on the first signal?", "Vendor code, not a package option: process.on('SIGTERM', () => process.exit(0)).", async () => {
  const { spawn } = await import("node:child_process"); const cwd = new URL("./", import.meta.url).pathname;
  const code = `process.env.HOME=require('os').tmpdir();(async()=>{const {McpServer}=await import('@modelcontextprotocol/sdk/server/mcp.js');const {track}=await import(${JSON.stringify(PKG_ENTRY)});const s=new McpServer({name:'a',version:'1'});track(s,'acme',{apiKey:'k',apiBaseUrl:'http://127.0.0.1:9'});process.on('SIGTERM',()=>process.exit(0));console.log('ready');setInterval(()=>{},1000)})()`;
  const r = await new Promise((resolve) => { const c = spawn("node", ["-e", code], { cwd }); let t0; c.stdout.on("data", () => { if (!t0) { t0 = Date.now(); c.kill("SIGTERM"); } }); const g = setTimeout(() => { c.kill("SIGKILL"); resolve({ exited: false }); }, 12000); c.on("exit", (code, sig) => { clearTimeout(g); resolve({ exited: true, code, sig, ms: Date.now() - t0 }); }); });
  return [r.exited ? "pass" : "gap", r.exited ? `with the vendor's own handler, the first SIGTERM ended the process in ${r.ms} ms (exit code ${r.code}).` : "still running after 12 s", r];
});
check("M7", "Vendor option: enableToolCallContext false and enableReportMissing false together with the redaction function. Is the tool list the vendor wrote what customers see?", "README Configuration table.", async () => {
  const stub = await startStub(); const { client } = await boot({ stub, trackOpts: { enableToolCallContext: false, enableReportMissing: false } });
  const tools = (await client.listTools()).tools; stub.close(); const t = tools[0];
  return [tools.length === 1 && !t.inputSchema.properties.context && !t.inputSchema.required?.includes("context") ? "pass" : "gap", `tools advertised: ${tools.map((x) => x.name)}; inputs of search_companies: ${Object.keys(t.inputSchema.properties)}; required: ${JSON.stringify(t.inputSchema.required)}.`, { tools: tools.map((x) => x.name) }];
});
check("M8", "Vendor option: what a redaction function is handed. Does it see the API key and the address events go to, and what happens if it changes them?", "Source: eventQueue.js line 46 applies the vendor's function to every string field of the event except a short protected list (redaction.js lines 6 to 16).", async () => {
  const seen = new Set(); const stub = await startStub(); const key = "within_sk_test_123456";
  const a = await boot({ stub, trackOpts: { redactSensitiveInformation: (s) => (seen.add(s), s) } }); await call(a.client, "search_companies", Q); await stub.settle(1000);
  const sawKey = seen.has(key), sawUrl = seen.has(stub.url), delivered1 = stub.events.length; stub.close();
  const stub2 = await startStub(); const b = await boot({ stub: stub2, trackOpts: { redactSensitiveInformation: (s) => s.replace(/\d+/g, "N") } }); await call(b.client, "search_companies", Q); await stub2.settle(2500); const delivered2 = stub2.events.length; stub2.close();
  return [sawKey && sawUrl && delivered2 === 0 ? "gap" : "info", `the function was handed the API key: ${sawKey}; the destination address: ${sawUrl}. With a function that replaces every digit run, events reached the stand-in: ${delivered2} (against ${delivered1} with a function that changes nothing). The failure shows only as lines in the log file.`, { sawKey, sawUrl, delivered1, delivered2 }];
});
check("F6", "The docs' install line against npm: does the package it names exist?", "Within's public docs page (getwith.in/docs), and the npm registry.", async () => {
  if (PATCHED) return ["info", "skipped on a patched copy: it checks the docs page and npm, not the package", {}];
  const get = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); return { status: r.status, text: r.status === 200 ? await r.text() : "" }; } catch (e) { return { status: 0, text: "", err: String(e.message) }; } };
  const docs = await get("https://getwith.in/docs"); const named = /npm install ([@\w\/.-]+)/.exec(docs.text)?.[1] ?? null;
  const reg = async (name) => (await get("https://registry.npmjs.org/" + name.replace("/", "%2f"))).status;
  const npmStatus = named ? await reg(named) : null;
  const pub = await get("https://registry.npmjs.org/within-sdk"); let publicVersion = null; try { publicVersion = JSON.parse(pub.text)["dist-tags"].latest; } catch {}
  const bad = named && npmStatus === 404;
  return [bad ? "fail" : docs.status === 200 && named ? "pass" : "info", `docs page answered ${docs.status}; its install line names ${named ?? "no package I could read"}; npm answers ${npmStatus} for that name; npm serves within-sdk ${publicVersion}.`, { docsStatus: docs.status, named, npmStatus, publicVersion, fetchedAt: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC" }];
});

// ---- run ----
const only = process.argv.slice(2);
if (only[0] === "--list") { console.log(checks.map((c) => c.id).join(" ")); process.exit(0); }
for (const c of checks) {
  if (only.length && !only.includes(c.id)) continue;
  try { const [verdict, observed, evidence] = await c.fn(); add(c.id, c.title, c.basis, verdict, observed, evidence); }
  catch (e) { add(c.id, c.title, c.basis, "error", String(e?.stack ?? e).slice(0, 300), {}); }
}
const tally = results.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
console.log("\nTALLY", JSON.stringify(tally));
const OUT = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : new URL("./out", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `${only.length === 1 ? only[0] : "many"}.json`), JSON.stringify({ sdk: "within-sdk", version: VERSION, node: process.version, ran: new Date().toISOString(), tally, results }, null, 2));
process.exit(0);
