// Checks for behaviour that exists only in @getwithin/sdk 0.4.0, found by reading the code (see code-locations.mjs).
// They run with run-new.mjs, never inside run.mjs, so the 43-check suite and its saved 0.3.0 results stay as they were.
// Verdicts: pass | fail (contradicts Within's published docs) | gap (a risk or an undocumented behaviour) | info (a measurement).
// Nothing leaves this machine: every Within request goes to the stand-in on 127.0.0.1, and every other request is intercepted.
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { boot, searchTool, startStub, SupportBridge, z } from "../lib/harness.mjs";

const G = "New in 0.4.0";
const ISSUER = "https://acme.us.auth0.com/";

// A fake login token, built at run time so no token-shaped string is stored in the repo.
const part = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
const fakeToken = () => `${part({ alg: "none", typ: "JWT" })}.${part({ sub: "auth0|u1" })}.${part("test-only-signature")}`;

// Replace fetch for the duration of fn: 127.0.0.1 passes through, the named issuer's /userinfo answers with a fixed profile,
// anything else is refused and recorded. The SDK captures fetch when it is installed, so this must be set before boot().
async function guarded(token, fn) {
  const real = globalThis.fetch;
  const outbound = [];
  globalThis.fetch = async (input, init) => {
    const u = new URL(typeof input === "string" ? input : (input.href ?? String(input)));
    if (u.hostname === "127.0.0.1") return real(input, init);
    outbound.push({ host: u.host, path: u.pathname, method: init?.method, bearerIsTheLoginToken: init?.headers?.authorization === `Bearer ${token}` });
    if (u.host === "acme.us.auth0.com" && u.pathname === "/userinfo")
      return new Response(JSON.stringify({ sub: "auth0|u1", email: "ada@example.com", email_verified: true, name: "Ada Lovelace" }), { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`blocked by the test: ${u.host}`);
  };
  try { return await fn(outbound); } finally { globalThis.fetch = real; }
}

// Call a wrapped tool directly with a chosen `extra` (what an HTTP transport would add), then return what Within received.
async function callWith({ installOpts = {}, extras }) {
  const b = await boot({ installOpts });
  const wrapped = b.support.instrumentTool("search", async () => ({ content: [{ type: "text", text: "ok" }] }));
  for (const extra of extras) await wrapped({ query: "hello" }, extra);
  await new Promise((r) => setTimeout(r, 150));
  const activity = b.stub.byPath("/v1/activity").map((r) => r.body);
  await b.close();
  return { activity };
}
const authExtra = (token) => ({ authInfo: { token, extra: { sub: "auth0|u1", iss: ISSUER } } });
const IDENTITY = { provider: "auth0", issuer: ISSUER };
// A vendor MCP server over real HTTP (stateless), with the SDK installed, so the doctor command-line tool can connect to it.
// A bearer token in the request is turned into authInfo, the way an OAuth-protected server would do it.
async function vendorHttp({ stub, installOpts = {}, ownContextInput = false }) {
  const srv = http.createServer(async (req, res) => {
    const server = new McpServer({ name: "acme", version: "1.0.0" });
    const support = SupportBridge.install(server, { apiKey: "sb_test_key_123456", baseUrl: stub.url, source: "stress-http", ...installOpts });
    const tool = support.wrapTool({
      name: "search", title: "Search", description: "Search the vendor's data.",
      inputSchema: ownContextInput ? { query: z.string(), context: z.string() } : { query: z.string() },
      handler: async () => ({ content: [{ type: "text", text: "ok" }] }),
    });
    server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.inputSchema }, tool.handler);
    const auth = String(req.headers.authorization ?? "");
    if (auth.startsWith("Bearer ")) req.auth = { token: auth.slice(7), clientId: "test", scopes: [], extra: { sub: "auth0|u1", iss: ISSUER } };
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${srv.address().port}/mcp`, close: () => new Promise((r) => srv.close(r)) };
}
// Run the real doctor command (dist/cli.js of the package under test) as a separate process.
// It must not block: the vendor server and the stand-in run in this same process and have to answer the command's requests.
function runDoctorCli(args) {
  const sdkDir = path.dirname(path.dirname(process.env.WITHIN_SDK_ENTRY));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(sdkDir, "dist/cli.js"), "doctor", ...args]);
    let out = "";
    child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGTERM"), 60000);
    child.on("close", (code) => { clearTimeout(timer); resolve({ exit: code, out: out.trim() }); });
  });
}
const didNotRun = (r) => r.exit === null || !r.out;
const CHECK_RECORD = { identity: { kind: "named", issuer: ISSUER, loginVerified: true } };


export const tests = [
  {
    id: "N1", group: G, title: "With the identity option set, is the customer's login token sent to Within?",
    basis: 'Within docs (Data, "Left on your server"): "Tool arguments, when captureArguments is omitted or false. Your database, your logs, and the raw bearer token." And (Identity): "The default path does not read tool arguments, decode the bearer token, or call a userinfo endpoint."',
    async run() {
      const token = fakeToken();
      const withIdentity = await guarded(token, () => callWith({ installOpts: { identity: IDENTITY }, extras: [authExtra(token)] }));
      const byDefault = await guarded(token, () => callWith({ extras: [authExtra(token)] }));
      const a = withIdentity.activity[0] ?? {}, d = byDefault.activity[0] ?? {};
      const sentWithIdentity = a.authToken === token, sentByDefault = d.authToken === token;
      return {
        verdict: sentWithIdentity || sentByDefault ? "fail" : "pass",
        expected: "the raw login token stays on the vendor's server",
        observed: `with the identity option: the activity report to Within ${sentWithIdentity ? "CONTAINED the customer's login token, exactly as received (field authToken)" : "did not contain the login token"}. By default (no identity option): ${sentByDefault ? "contained it" : "did not contain it"}.`,
        evidence: { withIdentity: { fieldsSent: Object.keys(a), authTokenSent: sentWithIdentity }, byDefault: { fieldsSent: Object.keys(d), authTokenSent: sentByDefault } },
      };
    },
  },
  {
    id: "N2", group: G, title: "With the identity option set, does the profile lookup go only to the named issuer, and once per person?",
    basis: 'Within docs (Identity): "the SDK asks that provider\'s userinfo endpoint (Auth0 /userinfo ...) with the same token, once per person, for their name and verified email ... The request goes only to the issuer you name."',
    async run() {
      const token = fakeToken();
      let outbound;
      const r = await guarded(token, async (o) => { outbound = o; return callWith({ installOpts: { identity: IDENTITY }, extras: [authExtra(token), authExtra(token)] }); });
      const onlyIssuer = outbound.every((o) => o.host === "acme.us.auth0.com" && o.path === "/userinfo");
      const once = outbound.length === 1;
      const sent = r.activity[0] ?? {};
      return {
        verdict: onlyIssuer && once && outbound.length > 0 ? "pass" : "fail",
        expected: "one request to the issuer's /userinfo for two calls by the same person, and no other outside request",
        observed: `two calls by the same person made ${outbound.length} outside request(s): ${outbound.map((o) => `${o.method} ${o.host}${o.path} (bearer is the login token: ${o.bearerIsTheLoginToken})`).join("; ") || "none"}. What Within then received as the person's identity: customerUserId "${sent.customerUserId ?? ""}", displayName "${sent.displayName ?? ""}".`,
        evidence: { outbound, identityFieldsSentToWithin: { customerUserId: sent.customerUserId ?? null, displayName: sent.displayName ?? null, authUserId: sent.authUserId ?? null, authIssuer: sent.authIssuer ?? null } },
      };
    },
  },
  {
    id: "N3", group: G, title: "The new 'hubs' feature: is it off by default, and what does it send when on?",
    basis: "Not described on Within's docs page as of 2026-11-20 (the page still says release 0.3.0). The code adds `options.hubs`, an `open_hub` tool, `/v1/hubs/*` requests and extra server instructions.",
    async run() {
      const probe = async (installOpts) => {
        const b = await boot({ installOpts, setup: ({ server, support }) => searchTool(support, server) });
        await b.call("search", { query: "hello" });
        await new Promise((r) => setTimeout(r, 150));
        const tools = (await b.client.listTools()).tools.map((t) => t.name);
        const install = b.stub.byPath("/v1/install")[0]?.body ?? {};
        const hubCalls = b.stub.records.filter((r) => r.path.startsWith("/v1/hubs"));
        await b.close();
        return { tools, installHubsFlag: install.hubs, hubRequests: hubCalls.map((r) => ({ path: r.path, fields: Object.keys(r.body ?? {}) })) };
      };
      const off = await probe({}), on = await probe({ hubs: true });
      const offIsQuiet = !off.tools.includes("open_hub") && off.installHubsFlag === false && off.hubRequests.length === 0;
      return {
        verdict: offIsQuiet ? "info" : "gap",
        expected: "off by default: no extra tool, no /v1/hubs request",
        observed: `default: tools ${JSON.stringify(off.tools)}, install says hubs=${off.installHubsFlag}, ${off.hubRequests.length} hubs request(s). With hubs:true: tools ${JSON.stringify(on.tools)}, install says hubs=${on.installHubsFlag}, ${on.hubRequests.length} hubs request(s) after one tool call (${on.hubRequests.map((x) => `${x.path} sending ${x.fields.join(", ") || "nothing"}`).join("; ") || "none"}).`,
        evidence: { off, on },
      };
    },
  },
  {
    id: "N4", group: G, title: "What does Within learn about the customer's AI app on every call?",
    basis: 'Within docs (Data): "The client\'s name and version, when the MCP server reports them."',
    async run() {
      const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/1.0.0 Chrome/120.0.0.0 Electron/28.0.0 Safari/537.36";
      const { activity } = await callWith({ extras: [
        { clientInfo: { name: "claude-ai", version: "1.2.3" } },
        { requestInfo: { headers: { "user-agent": ua } } },
        {},
      ] });
      const host = (a = {}) => Object.fromEntries(Object.entries(a).filter(([k]) => k.startsWith("host")));
      const [viaInit, viaUa, none] = activity.map(host);
      const sendsUa = Boolean(viaUa.hostName) && viaUa.hostName.length > 40;
      return {
        verdict: sendsUa ? "gap" : "pass",
        expected: "only the app's name and version",
        observed: `when the app reports itself: ${JSON.stringify(viaInit)}. When only a browser-style user-agent header is present: ${JSON.stringify(viaUa)} (${viaUa.hostName?.length ?? 0} characters of the header sent as the app name). With neither: ${JSON.stringify(none)}.`,
        evidence: { viaInit, viaUa, none, userAgentLength: ua.length },
      };
    },
  },
  {
    id: "N5", group: G, title: "The new model-callable tool report_void: does private detail in what the AI writes reach Within?",
    basis: "Not described on Within's docs page as of 2026-11-20. 0.4.0 registers report_void on every install (no option needed) and adds a sentence to every server's instructions telling the AI to call it, with `asked` set to \"a short phrase in the customer's own words\".",
    async run() {
      const b = await boot({ setup: ({ server, support }) => searchTool(support, server) });
      const asked = "find Priya Raman, call her on 617 555 0142 or email priya.raman@example.com";
      const reply = await b.call("report_void", { tool: "search", asked });
      await new Promise((r) => setTimeout(r, 150));
      const sent = b.stub.byPath("/v1/activity").map((r) => r.body).find((x) => x.toolName === "report_void") ?? {};
      const tools = (await b.client.listTools()).tools.map((t) => t.name);
      await b.close();
      const text = String(sent.voidAsked ?? "");
      const leaked = { phone: text.includes("617 555 0142"), name: text.includes("Priya Raman"), email: text.includes("priya.raman@example.com") };
      return {
        verdict: leaked.phone || leaked.name ? "gap" : "pass",
        expected: "private details in the customer's words are removed before they leave, or the field is not sent",
        observed: `report_void is listed to the AI by default (${tools.includes("report_void")}). The AI's phrase went to Within as voidAsked: "${text}". Phone number sent as written: ${leaked.phone}. Name sent as written: ${leaked.name}. Email sent as written: ${leaked.email}.`,
        evidence: { toolListedByDefault: tools.includes("report_void"), fieldsSent: Object.keys(sent), voidTool: sent.voidTool ?? null, voidAsked: text, leaked, replyToTheAI: reply?.content?.[0]?.text ?? null },
      };
    },
  },
  {
    id: "N6", group: G, title: "The new doctor command: what does it send, and to whom?",
    basis: "Not described on Within's docs page as of 2026-11-20. The command connects to a vendor's server over HTTP, optionally with a customer's token, calls one tool, then asks Within's /v1/checks/<id> what arrived.",
    async run() {
      const token = fakeToken();
      const KEY = "sb_test_key_123456";
      const once = async (installOpts) => guarded(token, async () => {
        const stub = await startStub({ check: CHECK_RECORD });
        const v = await vendorHttp({ stub, installOpts });
        const r = await runDoctorCli(["--url", v.url, "--token", token, "--tool", "search", "--args", '{"query":"hello"}', "--api-key", KEY, "--within-url", stub.url]);
        await new Promise((x) => setTimeout(x, 200));
        const recs = stub.records.map((q) => ({ method: q.method, path: q.path.replace(/chk_[0-9a-f]+/, "chk_<id>"), bearerIsApiKey: q.auth === `Bearer ${KEY}`, carriesToken: JSON.stringify(q.body ?? "").includes(token) || String(q.auth ?? "").includes(token), withinCheck: typeof q.body?.withinCheck === "string" }));
        await v.close(); await stub.close();
        return { exit: r.exit, out: r.out, recs };
      });
      const plain = await once({}), withId = await once({ identity: IDENTITY });
      if (didNotRun(plain) || didNotRun(withId)) return { verdict: "error", expected: "doctor runs", observed: `the doctor command produced no output or timed out (exit ${plain.exit} / ${withId.exit}), so this check did not run`, evidence: { plainExit: plain.exit, identityExit: withId.exit } };
      const checkCalls = plain.recs.filter((q) => q.path.startsWith("/v1/checks/"));
      const tokenToWithinPlain = plain.recs.some((q) => q.carriesToken), tokenToWithinIdentity = withId.recs.some((q) => q.carriesToken);
      const ok = plain.exit === 0 && checkCalls.length > 0 && checkCalls.every((q) => q.method === "GET" && q.bearerIsApiKey) && !tokenToWithinPlain;
      return {
        verdict: ok ? "pass" : "fail",
        expected: "doctor sends the token only to the vendor's server, and only the API key to Within",
        observed: `By default (no identity option): doctor exit ${plain.exit}; Within received ${plain.recs.length} request(s) (${[...new Set(plain.recs.map((q) => `${q.method} ${q.path}`))].join(", ")}); the /v1/checks lookups used the API key as bearer: ${checkCalls.every((q) => q.bearerIsApiKey)}; the customer's token reached Within: ${tokenToWithinPlain}. With the identity option on: the token reached Within through the SDK's own reports: ${tokenToWithinIdentity}. Doctor's output: ${plain.out.replace(/\s+/g, " ").slice(0, 330)}`,
        evidence: { plain, withIdentity: { exit: withId.exit, tokenReachedWithin: tokenToWithinIdentity, recs: withId.recs }, defaultWithinUrl: "https://app.getwith.in (cli.js and doctor.js)" },
      };
    },
  },
  {
    id: "N7", group: G, title: "Can the doctor command tell a vendor's own `context` input from Within's?",
    basis: "Doctor's 'tools' step says: \"These tools have no context field, so Within can't see what the customer wants\", and passes when each vendor tool carries a `context` input. W-04 is the case where the vendor's own `context` input is silently removed.",
    async run() {
      const stub = await startStub({ check: CHECK_RECORD });
      const v = await vendorHttp({ stub, ownContextInput: true });
      const r = await runDoctorCli(["--url", v.url]);
      await v.close(); await stub.close();
      if (didNotRun(r)) return { verdict: "error", expected: "doctor runs", observed: `the doctor command produced no output or timed out (exit ${r.exit}), so this check did not run`, evidence: { exit: r.exit } };
      const toolsLine = (r.out.split("\n").find((l) => /tools/i.test(l)) ?? "").trim();
      const passes = /✓/.test(toolsLine) || /carry the context field/i.test(toolsLine);
      return {
        verdict: passes ? "gap" : "pass",
        expected: "doctor warns that a tool's own `context` input will be taken for Within's goal field",
        observed: `For a vendor tool that has its own \`context\` input, doctor printed: "${toolsLine.slice(0, 200)}". It ${passes ? "passed it, so it cannot see the W-04 problem" : "flagged it"}.`,
        evidence: { exit: r.exit, output: r.out.slice(0, 600) },
      };
    },
  },
  {
    id: "N8", group: G, title: "With the hubs feature on, does Within's reply change the vendor's own tool result?",
    basis: "Within docs: \"Your tool result stays intact.\" The hubs feature is not on the docs page. In 0.4.0 `attachHubLine` adds a text block, a `hubInvitation` field and an `open_hub` step to the result when Within answers /v1/hubs/invite with a line.",
    async run() {
      const LINE = "You have 2 new introductions waiting. Want to see them?";
      const mk = async (installOpts) => {
        const b = await boot({ stub: undefined, installOpts, setup: ({ server, support }) => searchTool(support, server, { handler: async ({ query }) => ({ content: [{ type: "text", text: `results for ${query}` }], structuredContent: { items: ["a", "b"], next: [{ tool: "refine" }] } }) }) });
        b.stub.cfg.hubInvite = { line: LINE };
        const r = await b.call("search", { query: "fintech" });
        const out = { content: (r.content ?? []).map((c) => c.text), structured: r.structuredContent };
        await b.close();
        return out;
      };
      const off = await mk({}), on = await mk({ hubs: true });
      const inserted = on.content.length > off.content.length && on.content.includes(LINE) && on.structured?.hubInvitation === LINE;
      return {
        verdict: inserted ? "gap" : "pass",
        expected: "the vendor's result is returned as it is",
        observed: `Without hubs: ${off.content.length} text block(s), fields ${JSON.stringify(Object.keys(off.structured ?? {}))}, next ${JSON.stringify(off.structured?.next)}. With hubs on, and Within replying with a line: ${on.content.length} text blocks, last one "${on.content.at(-1)}", fields ${JSON.stringify(Object.keys(on.structured ?? {}))}, next ${JSON.stringify(on.structured?.next)}. Text written by Within's side is ${inserted ? "inside" : "not inside"} the vendor's result.`,
        evidence: { off, on, line: LINE },
      };
    },
  },
  {
    id: "N9", group: G, title: "The hub_card tool is labelled app-only. Does the SDK refuse a direct call?",
    basis: "The tool's description says \"The model does not call this\" and its metadata says visibility app. Within's own confirm_assistance tool was visible to the model (check E2). Hosts are meant to hide app-only tools; the SDK is not.",
    async run() {
      const b = await boot({ installOpts: { hubs: true } });
      const listed = (await b.client.listTools()).tools;
      const card = listed.find((t) => t.name === "hub_card"), openHub = listed.find((t) => t.name === "open_hub");
      const r = await b.client.callTool({ name: "hub_card", arguments: { action: "send", text: "hello from a plain MCP client" } });
      await new Promise((x) => setTimeout(x, 150));
      const sends = b.stub.byPath("/v1/hubs/send");
      await b.close();
      const reached = sends.length > 0 && sends[0].body?.text === "hello from a plain MCP client";
      return {
        verdict: reached ? "gap" : "pass",
        expected: "a call to an app-only tool from a plain client is refused",
        observed: `hub_card is listed to every client (visibility ${JSON.stringify(card?._meta?.ui?.visibility)}); open_hub visibility ${JSON.stringify(openHub?._meta?.ui?.visibility)}. A direct hub_card call with action send ${reached ? "reached Within as POST /v1/hubs/send with the text unchanged" : "did not reach Within"} (the reply to the caller was "${(r.content?.[0]?.text ?? "").slice(0, 60)}"). Only a host that honours the visibility label keeps the AI from calling it.`,
        evidence: { hubCardVisibility: card?._meta?.ui?.visibility ?? null, openHubVisibility: openHub?._meta?.ui?.visibility ?? null, sendReached: reached, sendBodyFields: sends[0] ? Object.keys(sends[0].body) : [] },
      };
    },
  },
];
