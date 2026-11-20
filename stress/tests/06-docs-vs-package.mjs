import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { boot, searchTool, startStub, SupportBridge, z } from "../lib/harness.mjs";
const G = "Docs versus the published package";
const require_ = createRequire(import.meta.url);
const sdkDir = process.env.WITHIN_SDK_ENTRY ? path.dirname(path.dirname(process.env.WITHIN_SDK_ENTRY)) : path.dirname(path.dirname(fileURLToPath(import.meta.resolve("@getwithin/sdk"))));
const pkg = JSON.parse(fs.readFileSync(path.join(sdkDir, "package.json"), "utf8"));
const dist = fs.readFileSync(path.join(sdkDir, "dist", "index.js"), "utf8");

export const tests = [
  {
    id: "F1", group: G, title: "Is zod a peer dependency, as the docs say?",
    basis: 'Docs: "Zod 3.25 or newer, or Zod 4, is yours: it is a peer dependency, and the SDK adds its optional context field with the same Zod your schemas use."',
    async run() {
      const inDeps = pkg.dependencies?.zod, inPeer = pkg.peerDependencies?.zod;
      return {
        verdict: inPeer ? "pass" : "fail",
        expected: "zod under peerDependencies",
        observed: `@getwithin/sdk ${pkg.version}: dependencies.zod = ${inDeps ?? "none"}; peerDependencies.zod = ${inPeer ?? "none"}`,
        evidence: { version: pkg.version, dependencies: pkg.dependencies, peerDependencies: pkg.peerDependencies },
      };
    },
  },
  {
    id: "F2", group: G, title: "Does the docs' install line plus the docs' quickstart run on a fresh project?",
    basis: 'Docs Install: "npm install @getwithin/sdk @modelcontextprotocol/sdk zod", then the Quickstart snippet.',
    async run() {
      if (process.env.WITHIN_SDK_ENTRY && !process.env.F2_SPEC) return { verdict: "info", expected: "n/a", observed: "not applicable to a patched copy: this test installs the published package from npm", evidence: {} };
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "within-fresh-"));
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "fresh", type: "module", private: true }));
      const inst = spawnSync("npm", ["install", process.env.F2_SPEC ?? "@getwithin/sdk@0.3.0", "@modelcontextprotocol/sdk", "zod", "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: dir, encoding: "utf8", timeout: 180000 });
      const ver = (n) => { try { return JSON.parse(fs.readFileSync(path.join(dir, "node_modules", n, "package.json"), "utf8")).version; } catch { return "n/a"; } };
      const nested = fs.existsSync(path.join(dir, "node_modules/@getwithin/sdk/node_modules/zod"));
      fs.writeFileSync(path.join(dir, "quickstart.mjs"), `
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SERVER_INSTRUCTIONS, SupportBridge } from "@getwithin/sdk";
const server = new McpServer({ name: "acme", version: "1.0.0" }, { instructions: \`Your business instructions. \${SERVER_INSTRUCTIONS}\` });
const support = SupportBridge.install(server, { apiKey: "sb_test_key_123456", baseUrl: "http://127.0.0.1:9", source: "acme-mcp", privacy: { captureArguments: false } });
const search = support.wrapTool({ name: "search_companies", title: "Search companies", description: "Search companies.", inputSchema: { query: z.string() },
  handler: async ({ query }) => ({ content: [{ type: "text", text: "Found companies for " + query + "." }], structuredContent: { query, companies: [] } }) });
server.registerTool(search.name, { title: search.title, description: search.description, inputSchema: search.inputSchema }, search.handler);
console.log("quickstart ran");
process.exit(0);
`);
      const run = spawnSync(process.execPath, ["quickstart.mjs"], { cwd: dir, encoding: "utf8", timeout: 60000 });
      const err = (run.stderr.match(/Error: [^\n]+/) ?? [])[0];
      const ok = run.status === 0;
      const sdkPrivate = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, "node_modules/@getwithin/sdk/node_modules/zod/package.json"), "utf8")).version; } catch { return "none"; } })();
      const versions = { installedZod: ver("zod"), sdkPrivateZod: sdkPrivate, mcpSdk: ver("@modelcontextprotocol/sdk") }; // read BEFORE the folder is removed
      fs.rmSync(dir, { recursive: true, force: true });
      return {
        verdict: ok ? "pass" : "fail",
        expected: "quickstart runs",
        observed: ok ? "ran" : `crashed: ${err}`,
        evidence: { ...versions, error: err ?? null, npmInstallExit: inst.status },
      };
    },
  },
  {
    id: "F3", group: G, title: "The docs describe an `identity` option, `{ provider, issuer }`, for Auth0, WorkOS and Clerk user lookups. Is it in the package?",
    basis: 'Docs Install options: "identity { provider, issuer } for Auth0, WorkOS, or Clerk, so a token that carries only a user id can be resolved to a name and email." Identity: "the SDK asks that provider\'s userinfo endpoint".',
    async run() {
      const hits = Object.fromEntries(["auth0", "workos", "clerk", "userinfo", "options.identity ", "options.identity.", "issuer"].map((k) => [k, dist.toLowerCase().split(k.toLowerCase()).length - 1]));
      // dynamic check: pass the option and see whether any outbound request other than to the stand-in is attempted
      const realFetch = globalThis.fetch; const hosts = new Set();
      globalThis.fetch = async (u, i) => { hosts.add(new URL(String(u)).host); return realFetch(u, i); };
      const stub = await startStub();
      try {
        const s = await boot({ stub, installOpts: { identity: { provider: "auth0", issuer: "https://acme.us.auth0.com/" } }, setup: ({ server, support }) => searchTool(support, server) });
        await s.call("search", { query: "x" }); await s.close();
      } finally { globalThis.fetch = realFetch; await stub.close(); }
      const absent = Object.values(hits).every((n) => n === 0);
      return {
        verdict: absent ? "fail" : "pass",
        expected: "code for the documented identity lookups",
        observed: `occurrences in dist/index.js: ${JSON.stringify(hits)}. Hosts contacted when the option was passed: ${[...hosts].join(", ")}`,
        evidence: { occurrences: hits, hostsContacted: [...hosts] },
      };
    },
  },
  {
    id: "F4", group: G, title: "get_vendor_answer: retries once, with both tries sharing one 5 s budget?",
    basis: 'Docs: "If get_vendor_answer cannot reach Within, it retries once. Both attempts share one 5-second budget, so a hung service is not retried."',
    async run() {
      const mk = async (cfg) => { const stub = await startStub(cfg); const s = await boot({ stub, setup: ({ server, support }) => searchTool(support, server) }); return s; };
      const a = await mk({ failFirstAnswers: 1 });
      const ra = await a.call("get_vendor_answer", { topic: "pricing", question: "How much is Team?" });
      const tries = a.stub.byPath("/v1/answers").length;
      await a.close();
      const b = await mk({ hang: true });
      const t0 = performance.now();
      const rb = await b.call("get_vendor_answer", { topic: "pricing", question: "How much is Team?" });
      const took = performance.now() - t0;
      const hangTries = b.stub.byPath("/v1/answers").length;
      await b.close();
      return {
        verdict: tries === 2 && !ra.isError && took < 5600 && hangTries === 1 ? "pass" : "fail",
        expected: "2 tries after a 500, then success; 1 try and about 5 s for a hang",
        observed: `after one 500: ${tries} tries, error: ${!!ra.isError}. With a hang: ${hangTries} try, ${Math.round(took)} ms, told the model: "${(rb.content?.[0]?.text ?? "").slice(0, 90)}"`,
        evidence: { triesAfter500: tries, hangTries, hangMs: Math.round(took) },
      };
    },
  },
  {
    id: "F5", group: G, title: "Two lists of private-network addresses sit in the code. Are they ever used?",
    basis: "Static check of dist/index.js. Our earlier research note said a private-IP block list guards the identity lookups, so this checks that statement.",
    async run() {
      const defs = (dist.match(/new BlockList\(\)/g) ?? []).length;
      const uses = (dist.match(/\b(?:blocked|globalV6)\.(?:check|rules)\b/g) ?? []).length;
      return {
        verdict: "info",
        expected: "n/a",
        observed: `BlockList objects created: ${defs}; places that check an address against them: ${uses}`,
        evidence: { defined: defs, used: uses },
      };
    },
  },
];
