// Runs the checks for within-sdk 1.0.4, each in its own process (the SDK keeps one process-wide event queue, so checks
// must not share one), then merges everything into ../results/sdk-1.0.4.json with the same shape as the 0.x result files.
//   node run-all.mjs          all checks (about 4 minutes)
//   node run-all.mjs F2 C8    only these, merged with the saved output of the others
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(here, "out");
const RESULTS = process.env.RESULTS_FILE ? path.resolve(process.env.RESULTS_FILE) : path.join(here, "..", "results", "sdk-1.0.4.json");
const PKG = process.env.WITHIN_PKG_DIR ? path.resolve(process.env.WITHIN_PKG_DIR) : path.join(here, "node_modules", "within-sdk");
const run = (args) => spawnSync("node", [path.join(here, "checks.mjs"), ...args], { cwd: here, encoding: "utf8", timeout: 600000 });
const order = run(["--list"]).stdout.trim().split(/\s+/);
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : order;
if (wanted.length === order.length) fs.rmSync(OUT, { recursive: true, force: true });
for (const id of wanted) {
  const r = run([id]); const f = path.join(OUT, `${id}.json`);
  if (!fs.existsSync(f)) fs.mkdirSync(path.dirname(f), { recursive: true }), fs.writeFileSync(f, JSON.stringify({ results: [{ id, title: id, basis: "", verdict: "error", observed: `the check produced no result: ${(r.stderr || r.stdout).slice(-300)}`, evidence: {} }] }));
  const one = JSON.parse(fs.readFileSync(f, "utf8")).results[0];
  process.stdout.write(`${one.verdict.toUpperCase().padEnd(5)} ${id}\n`);
}
const results = order.map((id) => { const f = path.join(OUT, `${id}.json`); if (!fs.existsSync(f)) throw new Error(`No saved result for ${id}: run the whole suite first.`); return JSON.parse(fs.readFileSync(f, "utf8")).results[0]; });
const tally = results.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
const pkg = (n) => JSON.parse(fs.readFileSync(path.join(here, "node_modules", n, "package.json"), "utf8")).version;
const dist = fs.readFileSync(path.join(PKG, "dist", "index.js"));
const out = { meta: { ranAt: new Date().toISOString(), sdk: { name: "within-sdk", version: JSON.parse(fs.readFileSync(path.join(PKG, "package.json"), "utf8")).version, source: process.env.WITHIN_PKG_DIR ? "patched copy: " + path.relative(here, PKG) : "registry.npmjs.org (npm install)", distSha256: crypto.createHash("sha256").update(dist).digest("hex") }, node: process.version, mcpSdk: pkg("@modelcontextprotocol/sdk"), zod: pkg("zod"), zod4: pkg("zod4") }, tally, results };
fs.writeFileSync(RESULTS, JSON.stringify(out, null, 2));
console.log("TALLY", JSON.stringify(tally), "checks", results.length);
