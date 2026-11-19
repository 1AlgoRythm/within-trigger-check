import { boot, searchTool, textOf, z } from "../lib/harness.mjs";
const safe = async (p) => { try { return { result: await p }; } catch (e) { return { thrown: String(e?.message ?? e) }; } };
const G = "Result integrity";
const OFFER = { id: "offer_1", status: "pending", source: "manual", representativeName: "Sarah", representativeRole: "Sales", vendorName: "Acme" };

export const tests = [
  {
    id: "B1", group: G, title: "Baseline: with Within up and no offer, is the vendor's result exactly unchanged?",
    basis: 'Docs: "Your tool result stays intact."',
    async run() {
      const s = await boot({ setup: ({ server, support }) => searchTool(support, server) });
      const r = await s.call("search", { query: "fintech" });
      await s.close();
      const same = textOf(r) === "results for fintech" && JSON.stringify(r.structuredContent) === JSON.stringify({ query: "fintech", items: ["a", "b"] });
      return { verdict: same ? "pass" : "fail", expected: "identical content and structuredContent", observed: JSON.stringify({ text: textOf(r), structuredContent: r.structuredContent }), evidence: {} };
    },
  },
  {
    id: "B2", group: G, title: "A rep's offer is attached to a result: is the vendor's own _meta kept?",
    basis: 'Docs: "Your tool result stays intact." The docs say an offer "appends one text line and structuredContent.assistance". They do not mention _meta.',
    async run() {
      const s = await boot({
        setup: ({ server, support }) => searchTool(support, server, {
          handler: async () => ({ content: [{ type: "text", text: "found 2" }], structuredContent: { n: 2 }, _meta: { "acme/trace-id": "abc-123" } }),
        }),
      });
      s.stub.cfg.offer = OFFER;
      const r = await s.call("search", { query: "x" });
      await s.close();
      const kept = r._meta?.["acme/trace-id"] === "abc-123";
      return {
        verdict: kept ? "pass" : "fail",
        expected: "the vendor's _meta still on the result",
        observed: `_meta after the offer was attached: ${JSON.stringify(r._meta)}. The offer itself arrived: ${!!r.structuredContent?.assistance}`,
        evidence: { _meta: r._meta ?? null, assistanceAttached: !!r.structuredContent?.assistance },
      };
    },
  },
  {
    id: "B3", group: G, title: "A vendor tool that already has an input called `context`: does the vendor's handler still receive it?",
    basis: 'Docs: "Your tools keep their names, descriptions, and results." `context` is a very common argument name (for example in retrieval tools).',
    async run() {
      let seen;
      const s = await boot({
        setup: ({ server, support }) => searchTool(support, server, {
          name: "answer_from_docs", schema: { question: z.string(), context: z.string() },
          handler: async (args) => { seen = args; return { content: [{ type: "text", text: "ok" }] }; },
        }),
      });
      const callResult = await s.call("answer_from_docs", { question: "How do refunds work?", context: "Customer Priya Raman, plan Team, 40 seats" });
      const act = s.stub.byPath("/v1/activity")[0]?.body;
      await s.close();
      return {
        verdict: seen?.context === "Customer Priya Raman, plan Team, 40 seats" ? "pass" : "fail",
        expected: "handler receives its own `context` argument",
        observed: `handler received: ${JSON.stringify(seen)}. The call itself returned an error: ${!!callResult.isError}. Within received mcpIntent: ${JSON.stringify(act?.mcpIntent)}`,
        evidence: { handlerArgs: seen, mcpIntentSentToWithin: act?.mcpIntent ?? null, callReturnedError: !!callResult.isError },
      };
    },
  },
  {
    id: "B4", group: G, title: "The model writes a goal longer than 300 characters: does the vendor's tool call still work?",
    basis: 'Docs: the SDK "adds its optional context field". Models often write long goals. The field is capped at 300 characters.',
    async run() {
      const s = await boot({ setup: ({ server, support }) => searchTool(support, server) });
      const ok = await safe(s.call("search", { query: "fintech", context: "x".repeat(300) }));
      const long = await safe(s.call("search", { query: "fintech", context: "The customer is a fund manager in Boston who wants a list of fintech companies. ".repeat(5) }));
      await s.close();
      const longOk = long.result && !long.result.isError;
      return {
        verdict: longOk ? "pass" : "fail",
        expected: "tool still runs (the goal text could be cut instead)",
        observed: `300 characters: ${ok.result && !ok.result.isError ? "ok" : "error"}. 375 characters: ${longOk ? "ok" : "rejected: " + (long.thrown ?? textOf(long.result)).slice(0, 160)}`,
        evidence: { at300: !!(ok.result && !ok.result.isError), at375: !!longOk, message: long.thrown ?? textOf(long.result) },
      };
    },
  },
  {
    id: "B5", group: G, title: "A vendor tool with no inputs: does its contract change?",
    basis: 'Docs overview: "the SDK adds its optional context field". Measurement of the effect.',
    async run() {
      const s = await boot({
        setup: ({ server, support }) => {
          const t = support.wrapTool({ name: "ping", title: "Ping", description: "Health check.", handler: async () => ({ content: [{ type: "text", text: "pong" }] }) });
          server.registerTool(t.name, { title: t.title, description: t.description }, t.handler);
        },
      });
      const tools = (await s.client.listTools()).tools;
      const ping = tools.find((t) => t.name === "ping");
      await s.close();
      const props = Object.keys(ping.inputSchema?.properties ?? {});
      return { verdict: "info", expected: "n/a", observed: `a tool declared with no inputs now lists these inputs: ${JSON.stringify(props)}`, evidence: { properties: props } };
    },
  },
  {
    id: "B6", group: G, title: "A vendor tool named like one of Within's (get_vendor_answer) and installing twice",
    basis: "Measurement: what a developer sees if they collide.",
    async run() {
      const out = {};
      try { await boot({ setup: ({ server, support }) => searchTool(support, server, { name: "get_vendor_answer", wrap: false }) }); out.collision = "no error"; }
      catch (e) { out.collision = e.message; }
      try {
        const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
        const server = new McpServer({ name: "x", version: "1" });
        SupportBridge.install(server, { apiKey: "sb_test_key_123456", baseUrl: "http://127.0.0.1:9" });
        SupportBridge.install(server, { apiKey: "sb_test_key_123456", baseUrl: "http://127.0.0.1:9" });
        out.doubleInstall = "no error";
      } catch (e) { out.doubleInstall = e.message; }
      return { verdict: "info", expected: "n/a", observed: `name collision: ${out.collision}. Second install on the same server: ${out.doubleInstall}`, evidence: out };
    },
  },
  {
    id: "B7", group: G, title: "A tool registered before install: is it seen by Within?",
    basis: 'Docs: "Call SupportBridge.install once, when the server is created." Measurement of what happens if the order is wrong.',
    async run() {
      const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
      const { SupportBridge } = await import("@getwithin/sdk");
      const { startStub } = await import("../lib/harness.mjs");
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
      const stub = await startStub();
      const server = new McpServer({ name: "late", version: "1" });
      server.registerTool("early", { description: "registered first", inputSchema: { q: z.string() } }, async () => ({ content: [{ type: "text", text: "hi" }] }));
      SupportBridge.install(server, { apiKey: "sb_test_key_123456", baseUrl: stub.url });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await server.connect(a);
      const client = new Client({ name: "c", version: "1" });
      await client.connect(b);
      stub.records.length = 0;
      await client.callTool({ name: "early", arguments: { q: "x", context: "goal" } }).catch(() => {});
      const hasContext = !!(await client.listTools()).tools.find((t) => t.name === "early")?.inputSchema?.properties?.context;
      const reported = stub.byPath("/v1/activity").length;
      await client.close(); await server.close(); await stub.close();
      return { verdict: "info", expected: "n/a", observed: `tool registered before install: has a context input: ${hasContext}; calls reported to Within: ${reported}. No error was raised either way.`, evidence: { hasContext, reported } };
    },
  },
];
