import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { boot, searchTool, textOf, z, startStub, SupportBridge } from "../lib/harness.mjs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
const G = "Privacy: what leaves the vendor's server";

// Fake but realistic values. `promised` marks the kinds Within's docs say are redacted.
export const CLASSES = [
  { id: "email", text: "priya.raman@acme-fund.com", promised: true },
  { id: "openai_style_key (sk-)", text: "sk-proj-abcDEF123456xyz789", promised: true },
  { id: "within_key (sb_)", text: "sb_live_abcdef1234567890", promised: true },
  { id: "bearer_token", text: "Bearer eyJhbGciOiJIUzI1NiJ9.e30.abc123def456", promised: true },
  { id: "card_number_valid", text: "4242 4242 4242 4242", promised: true },
  { id: "phone_us", text: "(617) 555-0142", promised: false },
  { id: "phone_international", text: "+44 20 7946 0958", promised: false },
  { id: "person_name", text: "Priya Raman", promised: false },
  { id: "stripe_style_key (sk_live_)", text: ["sk", "live", "51HxYzAbCdEfGhIjKlMnOpQr"].join("_") /* built at run time so the repo holds no secret-shaped literal */, promised: false },
  { id: "aws_access_key", text: "AKIAIOSFODNN7EXAMPLE", promised: false },
  { id: "github_token", text: "ghp_1234567890abcdefghijklmnopqrstuvwxyz", promised: false },
  { id: "jwt_without_Bearer", text: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U", promised: false },
  { id: "us_ssn", text: "123-45-6789", promised: false },
  { id: "iban", text: "GB82 WEST 1234 5698 7654 32", promised: false },
  { id: "street_address", text: "221B Baker Street, London", promised: false },
];

async function bodyFor(installOpts, args, handler) {
  const s = await boot({ installOpts, setup: ({ server, support }) => searchTool(support, server, { handler }) });
  await s.call("search", args).catch(() => {});
  await new Promise((r) => setTimeout(r, 250)); // failed calls report in the background, so give them a moment
  const bodies = s.stub.byPath("/v1/activity").map((r) => r.body);
  await s.close();
  return bodies[0] ?? null;
}

export const tests = [
  {
    id: "C1", group: G, title: "Default settings: which fields reach Within on a wrapped call?",
    basis: 'Docs: "On each wrapped call: the tool name, that the call happened, how it finished, and the customer and session when the host provided them." Tool arguments stay home unless captureArguments is true.',
    async run() {
      const body = await bodyFor({}, { query: "Priya Raman 617-555-0142", context: "wants fintech leads for a Boston fund" });
      const keys = Object.keys(body ?? {});
      const argsLeaked = ["tokens", "summary", "argumentPreview", "resultText"].filter((k) => k in (body ?? {}));
      return {
        verdict: argsLeaked.length === 0 ? "pass" : "fail",
        expected: "no tool arguments or results in the report",
        observed: `fields sent: ${keys.join(", ")}. Argument or result fields among them: ${argsLeaked.length ? argsLeaked.join(", ") : "none"}`,
        evidence: { keys, mcpIntent: body?.mcpIntent, title: body?.title, description: body?.description },
      };
    },
  },
  {
    id: "C2", group: G, title: "Default settings: the model-written goal text (mcpIntent). Which kinds of private data survive?",
    basis: 'Home page: "PII redacted before storage." Docs list what is redacted: emails, sk- keys, sb_ keys, bearer tokens, Luhn-valid card numbers. The goal text is sent on every call, whatever captureArguments is.',
    async run() {
      const rows = [];
      for (const c of CLASSES) {
        const body = await bodyFor({}, { query: "q", context: `Customer note: ${c.text}` });
        const sent = String(body?.mcpIntent ?? "");
        rows.push({ kind: c.id, promisedInDocs: c.promised, survived: sent.includes(c.text), sent });
      }
      const promisedFail = rows.filter((r) => r.promisedInDocs && r.survived);
      const otherSurvive = rows.filter((r) => !r.promisedInDocs && r.survived);
      return {
        verdict: promisedFail.length ? "fail" : otherSurvive.length ? "gap" : "pass",
        expected: "every kind the docs list is redacted; the rest is a coverage question",
        observed: `listed kinds that survived: ${promisedFail.map((r) => r.kind).join(", ") || "none"}. Other kinds that reached Within unredacted: ${otherSurvive.map((r) => r.kind).join(", ") || "none"}.`,
        evidence: { table: rows.map(({ kind, promisedInDocs, survived }) => ({ kind, promisedInDocs, survived })) },
      };
    },
  },
  {
    id: "C3", group: G, title: "Default settings: error messages from the vendor's tool. Do they carry private data to Within?",
    basis: 'Docs: "The only thing that leaves the process is what you configure: the activity report, and tool arguments only when you ask for them." Error text is sent on every failed call and is not described.',
    async run() {
      const msg = "No account for priya.raman@acme-fund.com, phone (617) 555-0142, name Priya Raman";
      const thrown = await bodyFor({}, { query: "x" }, async () => { throw new Error(msg); });
      const returned = await bodyFor({}, { query: "x" }, async () => ({ isError: true, content: [{ type: "text", text: msg }] }));
      const check = (b) => ({ error: b?.error, phone: String(b?.error).includes("(617) 555-0142"), name: String(b?.error).includes("Priya Raman"), email: String(b?.error).includes("priya.raman@acme-fund.com") });
      const a = check(thrown), b = check(returned);
      const leaks = a.phone || a.name || b.phone || b.name;
      return {
        verdict: leaks ? "gap" : "pass",
        expected: "error text carries no personal data, or the docs say it is sent",
        observed: `thrown error sent as: "${a.error}". Returned isError text sent as: "${b.error}". Email redacted: ${!a.email && !b.email}.`,
        evidence: { thrown: a, returned: b, captureArguments: false },
      };
    },
  },
  {
    id: "C4", group: G, title: "captureArguments on: does the tool's result text also leave?",
    basis: 'Docs: with captureArguments true, "The tool arguments, after redaction" are stored. The docs do not mention results.',
    async run() {
      const body = await bodyFor({ privacy: { captureArguments: true } }, { query: "Priya Raman (617) 555-0142" },
        async () => ({ content: [{ type: "text", text: "Account found: Priya Raman, phone (617) 555-0142, plan Team" }] }));
      const hasResult = typeof body?.resultText === "string";
      return {
        verdict: hasResult ? "gap" : "pass",
        expected: "only arguments, as documented",
        observed: `resultText sent: ${JSON.stringify(body?.resultText)}. argumentPreview sent: ${JSON.stringify(body?.argumentPreview)}`,
        evidence: { keys: Object.keys(body ?? {}), resultText: body?.resultText ?? null, argumentPreview: body?.argumentPreview ?? null },
      };
    },
  },
  {
    id: "C5", group: G, title: "captureArguments on: which kinds of private data survive in a free-text argument?",
    basis: 'Docs: with captureArguments true, "Email addresses, sk- keys, sb_ keys, bearer tokens, and card numbers that pass a Luhn check are replaced with [redacted]." They also warn that a name in free text can be stored.',
    async run() {
      const rows = [];
      for (const c of CLASSES) {
        const body = await bodyFor({ privacy: { captureArguments: true } }, { query: `look up ${c.text} please` });
        const sent = JSON.stringify(body ?? {});
        rows.push({ kind: c.id, promisedInDocs: c.promised, survived: sent.includes(c.text) });
      }
      const promisedFail = rows.filter((r) => r.promisedInDocs && r.survived);
      const otherSurvive = rows.filter((r) => !r.promisedInDocs && r.survived);
      return {
        verdict: promisedFail.length ? "fail" : otherSurvive.length ? "gap" : "pass",
        expected: "listed kinds redacted",
        observed: `listed kinds that survived: ${promisedFail.map((r) => r.kind).join(", ") || "none"}. Other kinds stored unredacted: ${otherSurvive.map((r) => r.kind).join(", ") || "none"}.`,
        evidence: { table: rows },
      };
    },
  },
  {
    id: "C6", group: G, title: "captureArguments on: which argument NAMES count as secret and are dropped?",
    basis: 'Docs: "Secret-like keys are removed." The list is not given.',
    async run() {
      const names = ["password", "passwd", "pwd", "passphrase", "apiKey", "api_key", "secret", "secretKey", "client_secret", "private_key", "privateKey", "token", "accessToken", "authorization", "credentials", "cookie", "session", "ssn", "dob", "iban", "email", "phone", "cardNumber", "cvv"];
      const schema = Object.fromEntries(names.map((n) => [n, z.string().optional()]));
      const args = Object.fromEntries(names.map((n) => [n, `Zq9${n.replace(/[^a-z]/gi, "")}`]));
      const s = await boot({ installOpts: { privacy: { captureArguments: true } }, setup: ({ server, support }) => searchTool(support, server, { schema }) });
      await s.call("search", args);
      const sent = JSON.stringify(s.stub.byPath("/v1/activity")[0]?.body ?? {});
      await s.close();
      const leaked = names.filter((n) => sent.includes(args[n]));
      const clearlySecret = ["pwd", "passphrase", "private_key", "privateKey", "credentials", "session"];
      const badLeaks = leaked.filter((n) => clearlySecret.includes(n));
      return {
        verdict: badLeaks.length ? "gap" : "pass",
        expected: "argument names that plainly hold secrets are dropped",
        observed: `values of these argument names reached Within: ${leaked.join(", ") || "none"}`,
        evidence: { leaked, tested: names },
      };
    },
  },
  {
    id: "C7", group: G, title: "A tool the vendor did NOT wrap: does it still report to Within?",
    basis: 'Docs: "Wrap each business tool you want Within to see." Docs: "Wrapped tools report activity."',
    async run() {
      const mk = async (opts) => boot({ installOpts: opts, setup: ({ server, support }) => searchTool(support, server, { wrap: false, name: "internal_admin_lookup" }) });
      const a = await mk({});
      await a.call("internal_admin_lookup", { query: "salary of Priya Raman" });
      const withoutGoal = a.stub.byPath("/v1/activity").length;
      await a.call("internal_admin_lookup", { query: "salary of Priya Raman", context: "HR wants Priya Raman's salary" });
      const acts = a.stub.byPath("/v1/activity");
      await a.close();
      const b = await mk({ privacy: { captureArguments: true } });
      await b.call("internal_admin_lookup", { query: "salary of Priya Raman (617) 555-0142", context: "HR check" });
      const argBody = b.stub.byPath("/v1/activity")[0]?.body;
      await b.close();
      return {
        verdict: acts.length > 0 ? "fail" : "pass",
        expected: "no report at all for a tool that was not wrapped",
        observed: `without a goal text: ${withoutGoal} reports. With a model-written goal text: ${acts.length} report (toolName "${acts[0]?.body?.toolName}", mcpIntent "${acts[0]?.body?.mcpIntent}"). With captureArguments on, the unwrapped tool's arguments were also sent: ${!!argBody?.argumentPreview} (${JSON.stringify(argBody?.argumentPreview)}).`,
        evidence: { reportsWithoutGoal: withoutGoal, reportsWithGoal: acts.length, argumentPreviewForUnwrapped: argBody?.argumentPreview ?? null },
      };
    },
  },
  {
    id: "C8", group: G, title: "captureArguments on: a very long free-text argument. Does redaction block the vendor's server?",
    basis: "Vendor expectation: the SDK runs inside the vendor's process, so a slow pattern match stalls every customer on that process.",
    async run() {
      const child = fileURLToPath(new URL("./_redos-child.mjs", import.meta.url));
      const rows = [];
      const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
      for (const [kind, size] of [["letters", 20000], ["letters", 40000], ["letters", 80000], ["digits-spaces", 40000], ["digits-spaces", 80000], ["error-letters-default-settings", 20000], ["error-letters-default-settings", 40000]]) {
        const runsMs = [];
        for (let i = 0; i < 3; i++) {
          const r = spawnSync(process.execPath, [child, kind, String(size)], { encoding: "utf8", timeout: 90000 });
          try { runsMs.push(JSON.parse(r.stdout.trim().split("\n").pop()).ms); } catch { runsMs.push(90000); }
        }
        rows.push({ kind, size, runsMs, ms: median(runsMs), medianMs: median(runsMs), maxMs: Math.max(...runsMs) });
      }
      const worst = Math.max(...rows.map((r) => r.medianMs));
      return {
        verdict: worst > 5000 ? "fail" : worst > 1000 ? "gap" : "pass",
        expected: "a call stays fast however long the text",
        observed: rows.map((r) => `${r.kind} ${r.size}: median ${r.medianMs} ms (slowest of 3: ${r.maxMs} ms)`).join("; "),
        evidence: { rows, note: "each row is the median of 3 runs in a fresh process; timings vary between runs on the same laptop" },
      };
    },
  },
  {
    id: "C10", group: G, title: "get_vendor_answer: what does Within receive about the customer's question?",
    basis: 'Docs, "What leaves your server": "On get_vendor_answer: The topic the agent passed, and the answer your company has saved for it." The docs do not list the question text.',
    async run() {
      const s = await boot({ setup: ({ server, support }) => searchTool(support, server) });
      const question = "Hi, I'm Priya Raman (priya.raman@acme-fund.com, +1 617 555 0142). What does Team cost for 40 seats? Card 4242 4242 4242 4242.";
      await s.call("get_vendor_answer", { topic: "pricing", question });
      const body = s.stub.byPath("/v1/answers")[0]?.body ?? {};
      await s.close();
      const sent = String(body.question ?? "");
      return {
        verdict: sent ? "gap" : "pass",
        expected: "only the topic, as documented",
        observed: `fields sent to /v1/answers: ${Object.keys(body).join(", ")}. The question text was sent as: "${sent}"`,
        evidence: { keys: Object.keys(body), question: sent, nameSurvived: sent.includes("Priya Raman"), phoneSurvived: sent.includes("617 555 0142"), emailSurvived: sent.includes("priya.raman@acme-fund.com"), cardSurvived: sent.includes("4242") },
      };
    },
  },
  {
    id: "C9", group: G, title: "Customer session ids: stable within a connection, new per connection (and per request on stateless servers)",
    basis: 'Docs: "On a stateless HTTP connection with no session id, the SDK mints one id for that connection... A new connection gets a new id."',
    async run() {
      const stub = await startStub();
      const ids = [];
      const oneRequest = async () => {
        const server = new McpServer({ name: "acme", version: "1" });
        const support = SupportBridge.install(server, { apiKey: "sb_test_key_123456", baseUrl: stub.url });
        const t = support.wrapTool({ name: "ping", description: "ping", inputSchema: { q: z.string() }, handler: async () => ({ content: [{ type: "text", text: "pong" }] }) });
        server.registerTool(t.name, { description: t.description, inputSchema: t.inputSchema }, t.handler);
        const [a, b] = InMemoryTransport.createLinkedPair();
        await server.connect(a);
        const client = new Client({ name: "c", version: "1" });
        await client.connect(b);
        await client.callTool({ name: "ping", arguments: { q: "1" } });
        await client.callTool({ name: "ping", arguments: { q: "2" } });
        await client.close(); await server.close();
      };
      for (let i = 0; i < 3; i++) await oneRequest();
      const perConnection = [];
      const acts = stub.byPath("/v1/activity").map((r) => r.body?.customerSessionId);
      for (let i = 0; i < acts.length; i += 2) perConnection.push([acts[i], acts[i + 1]]);
      await stub.close();
      const sameInside = perConnection.every(([a, b]) => a === b);
      const distinct = new Set(perConnection.map(([a]) => a)).size;
      return {
        verdict: "gap",
        expected: "n/a: documented behaviour. A rep's offer is delivered to the customer's session, so the id has to repeat for the offer to arrive.",
        observed: `3 connections, 2 calls each. Same id inside a connection: ${sameInside}. Distinct ids across the 3 connections: ${distinct}.`,
        evidence: { sameInsideConnection: sameInside, distinctAcrossConnections: distinct },
      };
    },
  },
];
