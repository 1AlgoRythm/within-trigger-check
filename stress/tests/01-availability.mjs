import net from "node:net";
import { boot, startStub, searchTool, textOf, ms, performance, captureLogs, z, SupportBridge } from "../lib/harness.mjs";

const safe = async (p) => { try { return { result: await p }; } catch (e) { return { thrown: String(e?.message ?? e) }; } };
const closedPortUrl = async () => { const s = net.createServer(); await new Promise((r) => s.listen(0, "127.0.0.1", r)); const port = s.address().port; await new Promise((r) => s.close(r)); return `http://127.0.0.1:${port}`; };
const G = "Availability";

export const tests = [
  {
    id: "A1", group: G, title: "Within hangs: how long does the vendor's tool wait?",
    basis: 'Docs: "Calls to Within abort after 5 seconds. An unreachable service leaves your result in place."',
    async run() {
      const stub = await startStub({ hang: true });
      const s = await boot({ stub, setup: ({ server, support }) => searchTool(support, server) });
      const t0 = performance.now();
      const r = await s.call("search", { query: "fintech" });
      const took = performance.now() - t0;
      await s.close();
      const kept = /results for fintech/.test(textOf(r));
      return {
        verdict: took <= 5600 && kept ? "pass" : "fail",
        expected: "result returned within about 5 s, with the vendor's own text kept",
        observed: `returned after ${ms(took)} ms; vendor text kept: ${kept}; text: ${textOf(r)}`,
        evidence: { tookMs: ms(took), kept },
      };
    },
  },
  {
    id: "A1b", group: G, title: "Within hangs: does the SDK stop waiting on later calls (circuit breaker)?",
    basis: "Vendor expectation: a service that has been hanging for 3 calls should not charge the next customer call 5 s again.",
    async run() {
      const stub = await startStub({ hang: true });
      const s = await boot({ stub, setup: ({ server, support }) => searchTool(support, server) });
      const times = [];
      for (let i = 0; i < 3; i++) { const t0 = performance.now(); await s.call("search", { query: "q" + i }); times.push(ms(performance.now() - t0)); }
      await s.close();
      const allSlow = times.every((t) => t > 4500);
      return {
        verdict: allSlow ? "gap" : "pass",
        expected: "later calls fail fast once Within is known to be hanging",
        observed: `three calls in a row took ${times.join(" ms, ")} ms`,
        evidence: { timesMs: times },
      };
    },
  },
  {
    id: "A2", group: G, title: "Within is down (connection refused): is the vendor's result returned?",
    basis: 'Docs: "When Within cannot be reached, your result is still returned, with a line that the service is unreachable."',
    async run() {
      const url = await closedPortUrl();
      const s = await boot({ installOpts: { baseUrl: url }, setup: ({ server, support }) => searchTool(support, server) });
      const t0 = performance.now();
      const r = await s.call("search", { query: "fintech" });
      const took = performance.now() - t0;
      await s.close();
      const text = textOf(r);
      return {
        verdict: /results for fintech/.test(text) && /unreachable/.test(text) ? "pass" : "fail",
        expected: "vendor text kept, plus one 'unreachable' line",
        observed: `after ${ms(took)} ms: ${text}`,
        evidence: { tookMs: ms(took), text },
      };
    },
  },
  {
    id: "A3", group: G, title: "Within is down: is the vendor's own structured data left alone?",
    basis: 'Docs: "Your tools keep their names, descriptions, and results."',
    async run() {
      const url = await closedPortUrl();
      const s = await boot({
        installOpts: { baseUrl: url },
        setup: ({ server, support }) => searchTool(support, server, {
          name: "status_lookup",
          handler: async () => ({ content: [{ type: "text", text: "order shipped" }], structuredContent: { status: "shipped", items: ["a"] } }),
        }),
      });
      const r = await s.call("status_lookup", { query: "order-1" });
      await s.close();
      const status = r.structuredContent?.status;
      return {
        verdict: status === "shipped" ? "pass" : "fail",
        expected: 'vendor structuredContent.status stays "shipped"',
        observed: `structuredContent.status came back as "${status}"`,
        evidence: { structuredContent: r.structuredContent },
      };
    },
  },
  {
    id: "A3b", group: G, title: "Within is down: does a tool with a declared output schema still work?",
    basis: 'Docs: "Your tool still returns." MCP checks a tool\'s structured result against its declared outputSchema.',
    async run() {
      const schema = { status: z.enum(["shipped", "pending"]), items: z.array(z.string()) };
      const setup = ({ server, support }) => {
        const t = support.wrapTool({
          name: "order_lookup", title: "Order", description: "Look up an order.", inputSchema: { id: z.string() },
          handler: async () => ({ content: [{ type: "text", text: "order shipped" }], structuredContent: { status: "shipped", items: ["a"] } }),
        });
        server.registerTool(t.name, { title: t.title, description: t.description, inputSchema: t.inputSchema, outputSchema: schema }, t.handler);
      };
      const up = await boot({ setup });
      const base = await safe(up.call("order_lookup", { id: "1" }));
      await up.close();
      const down = await boot({ installOpts: { baseUrl: await closedPortUrl() }, setup });
      const r = await safe(down.call("order_lookup", { id: "1" }));
      await down.close();
      const baseOk = base.result && !base.result.isError;
      const downOk = r.result && !r.result.isError;
      return {
        verdict: baseOk && !downOk ? "fail" : baseOk ? "pass" : "info",
        expected: "same successful result whether or not Within is reachable",
        observed: `Within up: ${baseOk ? "ok" : "error"}. Within down: ${downOk ? "ok" : "error: " + (r.thrown ?? textOf(r.result))}`,
        evidence: { within_up_ok: !!baseOk, within_down_ok: !!downOk, within_down_message: r.thrown ?? textOf(r.result) },
      };
    },
  },
  {
    id: "A4", group: G, title: "Wrong API key (Within answers 401): does the vendor get any signal?",
    basis: "Vendor expectation: a mistyped key should be noticed at start-up or in logs, not silently ignored.",
    async run() {
      const stub = await startStub({ status: 401 });
      const { value: r, lines } = await captureLogs(async () => {
        const s = await boot({ stub, installOpts: { apiKey: "sb_wrong_key_000000" }, setup: ({ server, support }) => searchTool(support, server) });
        const out = await s.call("search", { query: "fintech" });
        await s.close();
        return out;
      });
      await stub.close();
      return {
        verdict: lines.length === 0 ? "gap" : "pass",
        expected: "a log line or error saying the key was rejected",
        observed: `tool result: ${textOf(r)}. Log lines from the SDK: ${lines.length}. Within answered ${stub.records.length} requests, all 401.`,
        evidence: { logLines: lines, requests: stub.records.length },
      };
    },
  },
  {
    id: "A5", group: G, title: "Within sends a broken (non-JSON) reply: does the vendor's tool survive?",
    basis: 'Docs: "Your tool still returns."',
    async run() {
      const stub = await startStub({ badJson: true });
      const s = await boot({ stub, setup: ({ server, support }) => searchTool(support, server) });
      const r = await safe(s.call("search", { query: "fintech" }));
      await s.close(); await stub.close();
      const ok = r.result && /results for fintech/.test(textOf(r.result));
      return { verdict: ok ? "pass" : "fail", expected: "vendor result returned", observed: ok ? textOf(r.result) : (r.thrown ?? "no result"), evidence: {} };
    },
  },
  {
    id: "A6", group: G, title: "40 customers at once with a slow Within: do calls overlap, and does each keep its own goal text?",
    basis: "Vendor expectation: concurrent customers must not slow each other or swap data (the goal text is stored per call).",
    async run() {
      const stub = await startStub({ delayMs: 150 });
      const s = await boot({ stub, setup: ({ server, support }) => searchTool(support, server) });
      const N = 40;
      const t0 = performance.now();
      await Promise.all(Array.from({ length: N }, (_, i) => s.call("search", { query: "q" + i, context: `goal number ${i}` })));
      const took = performance.now() - t0;
      const acts = stub.byPath("/v1/activity");
      const seen = new Set(acts.map((a) => a.body?.mcpIntent));
      const allDistinct = seen.size === N && Array.from({ length: N }, (_, i) => seen.has(`goal number ${i}`)).every(Boolean);
      await s.close(); await stub.close();
      return {
        verdict: took < 1500 && allDistinct ? "pass" : "fail",
        expected: "about one delay's worth of time (not 40 of them), and 40 distinct goals recorded",
        observed: `${N} calls took ${ms(took)} ms with 150 ms delay each; distinct goals recorded: ${seen.size} of ${N}`,
        evidence: { tookMs: ms(took), distinctGoals: seen.size, activityRecords: acts.length },
      };
    },
  },
  {
    id: "A7", group: G, title: "A customer-identity callback throws: does the vendor's tool still return?",
    basis: 'Docs: "Your tool still returns." (identify is the vendor\'s own function, documented in Install options.)',
    async run() {
      let handlerRan = false;
      const s = await boot({
        installOpts: { identify: async () => { throw new Error("session store is down"); } },
        setup: ({ server, support }) => searchTool(support, server, { handler: async ({ query }) => { handlerRan = true; return { content: [{ type: "text", text: `results for ${query}` }] }; } }),
      });
      const r = await safe(s.call("search", { query: "fintech" }));
      await s.close();
      const ok = r.result && !r.result.isError && /results for fintech/.test(textOf(r.result));
      return {
        verdict: ok ? "pass" : "gap",
        expected: "vendor result returned even if the identity lookup fails",
        observed: ok ? textOf(r.result) : `tool call failed: ${r.thrown ?? textOf(r.result)}. The vendor's own handler had already run: ${handlerRan}`,
        evidence: { message: r.thrown ?? textOf(r.result), vendorHandlerRan: handlerRan },
      };
    },
  },
  {
    id: "A8", group: G, title: "How many calls does Within receive per vendor tool call?",
    basis: "Measurement, no pass/fail. Each call is also a possible 5 s wait.",
    async run() {
      const s = await boot({ setup: ({ server, support }) => searchTool(support, server) });
      s.stub.records.length = 0;
      for (let i = 0; i < 10; i++) await s.call("search", { query: "q" + i });
      const counts = {};
      for (const r of s.stub.records) counts[r.path] = (counts[r.path] ?? 0) + 1;
      await s.close();
      return { verdict: "info", expected: "n/a", observed: `10 tool calls produced: ${JSON.stringify(counts)}`, evidence: { counts } };
    },
  },
  {
    id: "A8b", group: G, title: "How much time does the SDK add to one vendor tool call (Within answering in 0 ms and in 300 ms)?",
    basis: "Measurement. Wrapped tool, and a tool the vendor did not wrap (the AI fills in the goal text). Median of 7 calls each.",
    async run() {
      const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
      const out = {};
      for (const delayMs of [0, 300]) {
        const stub = await startStub({ delayMs });
        const s = await boot({ stub, setup: ({ server, support }) => { searchTool(support, server, { name: "wrapped" }); searchTool(support, server, { name: "unwrapped", wrap: false }); } });
        for (const name of ["wrapped", "unwrapped"]) {
          const times = [];
          for (let i = 0; i < 7; i++) { const t0 = performance.now(); await s.call(name, { query: "q" + i, context: "goal " + i }); times.push(performance.now() - t0); }
          out[`${name}_${delayMs}ms`] = Math.round(med(times));
        }
        await s.close(); await stub.close();
      }
      return {
        verdict: "info", expected: "n/a",
        observed: `median time per call. Within answering instantly: wrapped ${out.wrapped_0ms} ms, unwrapped ${out.unwrapped_0ms} ms. Within answering after 300 ms: wrapped ${out.wrapped_300ms} ms, unwrapped ${out.unwrapped_300ms} ms.`,
        evidence: out,
      };
    },
  },
  {
    id: "A9", group: G, title: "baseUrl left out (homepage snippet with an unset env var): where do the calls go?",
    basis: 'Docs: "When baseUrl is omitted, the SDK calls http://127.0.0.1:8787, which is the local service." The homepage snippet passes process.env.SUPPORTBRIDGE_URL with no fallback.',
    async run() {
      const realFetch = globalThis.fetch;
      const urls = [];
      globalThis.fetch = async (u, init) => { urls.push(String(u)); throw new Error("blocked by test"); };
      let text, lines;
      try {
        const out = await captureLogs(async () => {
          const s = await boot({ installOpts: { baseUrl: undefined }, setup: ({ server, support }) => searchTool(support, server) });
          const r = await s.call("search", { query: "fintech" });
          await s.close();
          return r;
        });
        text = textOf(out.value); lines = out.lines;
      } finally { globalThis.fetch = realFetch; }
      const local = urls.length > 0 && urls.every((u) => u.startsWith("http://127.0.0.1:8787/"));
      return {
        verdict: local && lines.length === 0 ? "gap" : "info",
        expected: "a loud start-up error or warning when no real URL is set",
        observed: `install did not complain. Calls went to ${[...new Set(urls.map((u) => u.replace(/\/v1.*/, "")))].join(", ")}. Every tool result now ends with: "${text.split(" | ").pop()}". SDK log lines: ${lines.length}.`,
        evidence: { urlsContacted: [...new Set(urls)], logLines: lines.length },
      };
    },
  },
  {
    id: "A10", group: G, title: "API key checks at start-up",
    basis: 'Docs: "A missing apiKey throws api_key_required at startup, before the server accepts calls."',
    async run() {
      const tryKey = (apiKey) => { try { SupportBridge.install({ registerTool() {}, registerResource() {}, server: {} }, { apiKey }); return "accepted"; } catch (e) { return "threw " + e.message; } };
      const out = { missing: tryKey(undefined), empty: tryKey(""), spaces: tryKey("   ") };
      return {
        verdict: out.missing === "threw api_key_required" && out.spaces === "accepted" ? "gap" : out.missing === "threw api_key_required" ? "pass" : "fail",
        expected: "missing key throws; a blank key should too",
        observed: `missing: ${out.missing}; empty string: ${out.empty}; three spaces: ${out.spaces}`,
        evidence: out,
      };
    },
  },
];
