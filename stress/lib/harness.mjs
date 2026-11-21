// Shared pieces for the stress tests: a configurable stand-in for Within's API, and a helper
// that boots a vendor MCP server with the stock @getwithin/sdk installed and connects a client.
// Nothing here talks to Within's real service. Every request goes to 127.0.0.1.
import http from "node:http";
import { performance } from "node:perf_hooks";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";

// WITHIN_SDK_ENTRY lets the same tests run against a patched copy of the SDK (see ../patches/apply.mjs).
const sdk = await import(process.env.WITHIN_SDK_ENTRY ? pathToFileURL(process.env.WITHIN_SDK_ENTRY).href : "@getwithin/sdk");
export const SupportBridge = sdk.SupportBridge;
export const SERVER_INSTRUCTIONS = sdk.SERVER_INSTRUCTIONS;
export { z, performance };

// A stand-in for Within's API. `cfg` can be changed while it runs:
//   delayMs   wait this long before answering        hang   never answer (the socket stays open)
//   status    HTTP status for every reply            badJson  answer 200 with a body that is not JSON
//   offer     an offer object returned by /v1/offers/deliver
//   failFirstAnswers   answer /v1/answers with 500 this many times before succeeding
//   check     the record /v1/checks/<id> returns (0.4.0 doctor); hubInvite / hubOpen  the replies to /v1/hubs/invite and /v1/hubs/open (0.4.0 hubs)
export async function startStub(initial = {}) {
  const cfg = { delayMs: 0, hang: false, status: 200, badJson: false, offer: null, failFirstAnswers: 0, offerOnce: false, check: null, hubInvite: null, hubOpen: null, ...initial };
  const state = { presented: false, accepted: false };
  const records = [];
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
      const rec = { at: performance.now(), method: req.method, path: req.url, auth: req.headers.authorization, body };
      records.push(rec);
      if (cfg.hang) return; // never reply
      const reply = () => {
        if (cfg.badJson) { res.writeHead(200, { "content-type": "application/json" }); return res.end("<<not json>>"); }
        let status = cfg.status, payload = {};
        if (req.url.startsWith("/v1/answers")) {
          if (cfg.failFirstAnswers > 0) { cfg.failFirstAnswers--; status = 500; }
          else payload = { answer: { text: "Acme Team is $18 per seat a month." }, match: "confident" };
        } else if (req.url.startsWith("/v1/offers/deliver")) {
          // offerOnce: a rep's offer is announced once, then stays pending (and un-announced) until accepted
          if (!cfg.offer || state.accepted) payload = {};
          else { payload = { offer: cfg.offer, newlyPresented: cfg.offerOnce ? !state.presented : true }; state.presented = true; }
        } else if (/^\/v1\/offers\/[^/]+\/accept/.test(req.url)) {
          state.accepted = true;
          payload = { conversation: { id: "conv_1", representativeName: "Sarah" }, offer: cfg.offer ?? {} };
        } else if (/^\/v1\/checks\//.test(req.url)) {
          payload = cfg.check ?? { identity: { kind: "idOnly", issuer: null, loginVerified: false } };
        } else if (req.url.startsWith("/v1/hubs/invite")) {
          payload = cfg.hubInvite ?? {};
        } else if (req.url.startsWith("/v1/hubs/open")) {
          payload = cfg.hubOpen ?? { status: "off" };
        }
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      cfg.delayMs ? setTimeout(reply, cfg.delayMs) : reply();
    });
  });
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, cfg, records,
    byPath: (p) => records.filter((r) => r.path.startsWith(p)),
    close: () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(r); }),
  };
}

// Boot a vendor MCP server with the SDK installed, register tools, connect an in-memory client.
//   setup({ server, support, z })  registers the vendor's tools (after install, as the docs say)
//   installOpts                    extra options for SupportBridge.install
//   instructions                   the vendor's own server instructions
export async function boot({ stub, setup, installOpts = {}, instructions, serverInfo = { name: "acme", version: "1.0.0" } } = {}) {
  const ownStub = !stub;
  stub = stub ?? (await startStub());
  const server = new McpServer(serverInfo, instructions === undefined ? {} : { instructions });
  const support = SupportBridge.install(server, { apiKey: "sb_test_key_123456", baseUrl: stub.url, source: "stress", ...installOpts });
  await setup?.({ server, support, z });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "stress-client", version: "1.0.0" });
  await client.connect(b);
  return {
    server, support, client, stub,
    call: (name, args = {}) => client.callTool({ name, arguments: args }),
    async close() { await client.close().catch(() => {}); await server.close().catch(() => {}); if (ownStub) await stub.close(); },
  };
}

// A plain vendor tool that returns text, used by many tests.
export const searchTool = (support, server, { wrap = true, handler, name = "search", schema } = {}) => {
  const tool = {
    name, title: "Search", description: "Search the vendor's data.",
    inputSchema: schema ?? { query: z.string() },
    handler: handler ?? (async ({ query }) => ({ content: [{ type: "text", text: `results for ${query}` }], structuredContent: { query, items: ["a", "b"] } })),
  };
  const t = wrap ? support.wrapTool(tool) : tool;
  server.registerTool(t.name, { title: t.title, description: t.description, inputSchema: t.inputSchema }, t.handler);
};

export const textOf = (r) => (r?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join(" | ");
export const ms = (n) => Math.round(n);

// Run a function and capture anything the SDK prints to console or the process warning channel.
export async function captureLogs(fn) {
  const lines = [];
  const orig = {};
  for (const k of ["log", "warn", "error", "info", "debug"]) { orig[k] = console[k]; console[k] = (...a) => lines.push(`${k}: ${a.join(" ")}`); }
  const onWarn = (w) => lines.push(`warning: ${w.message}`);
  process.on("warning", onWarn);
  try { const value = await fn(); await new Promise((r) => setTimeout(r, 50)); return { value, lines }; }
  finally { for (const k of Object.keys(orig)) console[k] = orig[k]; process.off("warning", onWarn); }
}
