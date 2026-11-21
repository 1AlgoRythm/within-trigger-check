// Checks for behaviour that exists only in @getwithin/sdk 0.4.0, found by reading the code (see code-locations.mjs).
// They run with run-new.mjs, never inside run.mjs, so the 43-check suite and its saved 0.3.0 results stay as they were.
// Verdicts: pass | fail (contradicts Within's published docs) | gap (a risk or an undocumented behaviour) | info (a measurement).
// Nothing leaves this machine: every Within request goes to the stand-in on 127.0.0.1, and every other request is intercepted.
import { boot, searchTool } from "../lib/harness.mjs";

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
];
