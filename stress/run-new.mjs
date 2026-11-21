// Runs the checks that only apply to @getwithin/sdk 0.4.0 (stress/new/*.mjs) and saves results/new-in-040.json.
//   WITHIN_SDK_ENTRY=$PWD/sdk-0.4.0/dist/index.js STOCK_COPY=1 SDK_SOURCE="where it came from" node run-new.mjs
// It refuses to run against the default 0.3.0 package, where these features do not exist. See "Run it on another version".
// Nothing is sent to Within's real service: every request goes to 127.0.0.1, and every other request is intercepted.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.WITHIN_SDK_ENTRY) { console.error("Set WITHIN_SDK_ENTRY to the 0.4.0 dist/index.js. These checks do not apply to 0.3.0."); process.exit(1); }
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sdkDir = path.dirname(path.dirname(process.env.WITHIN_SDK_ENTRY));
const meta = {
  ranAt: new Date().toISOString(), node: process.version, platform: `${os.platform()} ${os.release()}`,
  sdk: { name: "@getwithin/sdk", patched: false, source: process.env.SDK_SOURCE ?? "unknown", version: readJson(path.join(sdkDir, "package.json")).version, distSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(sdkDir, "dist/index.js"))).digest("hex") },
  note: "All requests go to a stand-in on 127.0.0.1. Nothing was sent to Within's service.",
};
const files = fs.readdirSync(path.join(here, "new")).filter((f) => f.endsWith(".mjs")).sort();
const results = [];
for (const f of files) {
  const mod = await import(path.join(here, "new", f));
  for (const t of mod.tests) {
    let r;
    try { r = await t.run(); } catch (e) { r = { verdict: "error", expected: "", observed: `the test itself crashed: ${e.message}`, evidence: { stack: String(e.stack).split("\n").slice(0, 4) } }; }
    const row = { id: t.id, group: t.group, title: t.title, basis: t.basis, verdict: r.verdict, expected: r.expected, observed: r.observed, evidence: r.evidence ?? {} };
    results.push(row);
    console.log(`${row.verdict.toUpperCase().padEnd(5)} ${row.id.padEnd(4)} ${row.title}\n        ${row.observed.slice(0, 600)}`);
  }
}
const tally = results.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
console.log("\nTotals:", JSON.stringify(tally));
fs.writeFileSync(path.join(here, "results/new-in-040.json"), JSON.stringify({ meta, tally, results }, null, 2));
console.log("Wrote results/new-in-040.json");
process.exit(0);
