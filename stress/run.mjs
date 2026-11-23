// Runs every stress test against the stock @getwithin/sdk in ./node_modules and a local stand-in for Within.
//   node run.mjs                run everything, write results/latest.json
//   node run.mjs A1 C8          run only these test ids
// Another published version can be tested without touching ./node_modules (see README, "Run it on another version"):
//   WITHIN_SDK_ENTRY=<dir>/dist/index.js  the package to test; the dir must sit inside stress/ so it finds zod and the MCP SDK
//   STOCK_COPY=1                          say that entry is an unmodified published package, not a patched copy
//   RESULTS_FILE=results/sdk-0.4.0.json   where to write (the default for an alternate entry is results/patched.json)
//   SDK_SOURCE="where it came from"       recorded in the results
//   F2_SPEC=<tarball or name@version>     lets F2 install that package on a fresh project instead of skipping
// Nothing is sent to Within's real service: every request goes to 127.0.0.1.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const only = new Set(process.argv.slice(2));
const files = fs.readdirSync(path.join(here, "tests")).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort();
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sdkDir = process.env.WITHIN_SDK_ENTRY ? path.dirname(path.dirname(process.env.WITHIN_SDK_ENTRY)) : path.join(here, "node_modules/@getwithin/sdk");
const resultsFile = process.env.RESULTS_FILE ?? (process.env.WITHIN_SDK_ENTRY ? "results/patched.json" : "results/latest.json");
const meta = {
  ranAt: new Date().toISOString(),
  node: process.version,
  platform: `${os.platform()} ${os.release()}`,
  sdk: { name: "@getwithin/sdk", patched: Boolean(process.env.WITHIN_SDK_ENTRY) && !process.env.STOCK_COPY, source: process.env.SDK_SOURCE ?? "npm registry (stress/node_modules)", version: readJson(path.join(sdkDir, "package.json")).version, distSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(sdkDir, "dist/index.js"))).digest("hex") },
  mcpSdk: readJson(path.join(here, "node_modules/@modelcontextprotocol/sdk/package.json")).version,
  zodInTestProject: readJson(path.join(here, "node_modules/zod/package.json")).version,
  note: "All requests go to a stand-in on 127.0.0.1. Nothing was sent to Within's service.",
};

const results = [];
for (const f of files) {
  const mod = await import(path.join(here, "tests", f));
  for (const t of mod.tests) {
    if (only.size && !only.has(t.id)) continue;
    const t0 = Date.now();
    let r;
    try { r = await t.run(); } catch (e) { r = { verdict: "error", expected: "", observed: `the test itself crashed: ${e.message}`, evidence: { stack: String(e.stack).split("\n").slice(0, 4) } }; }
    const row = { id: t.id, group: t.group, title: t.title, basis: t.basis, verdict: r.verdict, expected: r.expected, observed: r.observed, evidence: r.evidence ?? {}, tookMs: Date.now() - t0 };
    results.push(row);
    console.log(`${row.verdict.toUpperCase().padEnd(5)} ${row.id.padEnd(4)} ${row.title}\n        ${row.observed.slice(0, 300)}`);
  }
}
const tally = results.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
console.log("\nTotals:", JSON.stringify(tally));
if (!only.size) {
  fs.mkdirSync(path.join(here, "results"), { recursive: true });
  const out = { meta, tally, results };
  fs.writeFileSync(path.join(here, resultsFile), JSON.stringify(out, null, 2));
  console.log("Wrote " + resultsFile);
}
process.exit(0);
