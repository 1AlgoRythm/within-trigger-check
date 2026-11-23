// Builds the interactive map for @getwithin/sdk 0.4.0:
//   ../docs/explorer/*.html   the five diagrams, built from docs/explorer/src/*.json with the Archify skill
//   ../docs/index.html        the clickable wrapper, from map.template.html. Every finding opens its sketch.
// Run `node sketches.mjs` first: the map opens a sketch for every finding.
//   node map.mjs            (set ARCHIFY_DIR if the skill is not in ~/.claude/skills/archify)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fail = (m) => { throw new Error(m); };
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(here, p), "utf8"));
const src = rd("findings.json"), sketches = rd("sketches.json"), main = rd("results/sdk-0.4.0.json");
if (main.meta.sdk.version !== "0.4.0") fail("results are not for 0.4.0");
const version = main.meta.sdk.version;

// ---- Archify builds the diagrams
const ARCHIFY = process.env.ARCHIFY_DIR ?? path.join(process.env.HOME, ".claude/skills/archify");
const exp = path.join(root, "docs", "explorer"), SRC = path.join(exp, "src");
const pages = [["architecture", "l1-within-end-to-end"], ["architecture", "l2-inside-the-sdk"], ["architecture", "l2-newer-parts"], ["architecture", "l2-within-side"], ["sequence", "l2-the-decision"]];
if (!fs.existsSync(path.join(ARCHIFY, "bin/archify.mjs"))) fail(`Archify not found at ${ARCHIFY}; set ARCHIFY_DIR`);
for (const f of fs.readdirSync(exp)) if (f.endsWith(".html") || f.endsWith(".png")) fs.unlinkSync(path.join(exp, f));
for (const [type, n] of pages) {
  const r = spawnSync("node", [path.join(ARCHIFY, "bin/archify.mjs"), "deliver", type, path.join(SRC, `${n}.${type}.json`), path.join(exp, `${n}.html`), "--quality", "showcase", "--json"], { encoding: "utf8" });
  if (r.status !== 0) fail(`archify failed on ${n}:\n${(r.stdout + r.stderr).slice(-1800)}`);
  console.log(`archify ok: ${n}`);
}
const srcIds = new Set(fs.readdirSync(SRC).map((f) => f.split(".")[0]));
for (const [, n] of pages) srcIds.delete(n);
if (srcIds.size) fail(`diagram sources with no page: ${[...srcIds].join(", ")}`);

// ---- the screens table. Findings are looked up, never typed, so a title cannot disagree with the report.
const fid = (id) => `f-${id.toLowerCase().replace("-", "")}`;
const S = {};
for (const f of src.findings) {
  const sk = sketches[f.id] ?? fail(`no sketch for ${f.id}`);
  const checks = f.tests.map((t) => `<code>${t}</code>`).join(", ");
  const how = f.tests.length > 1 ? `Checks ${checks}` : f.tests.length ? `Check ${checks}` : "Measured with real-Claude runs";
  S[fid(f.id)] = { title: `${f.id} · ${sk.title}`, file: sk.file, kind: "leaf", note: ["measured", `${how}. <a href="findings.html#${f.id.toLowerCase()}">Read ${f.id} on the findings page</a>.`] };
}
const ids = (...a) => a.map(fid);
S.l1 = { title: "Within, end to end", file: "explorer/l1-within-end-to-end.html", kind: "arch", note: ["read", "Read from Within's docs and the SDK source. W-numbers in the box text point to findings in the report."], drill: { sdk: "l2-sdk", host: "l2-decision", api: "l2-within", doctor: "l2-new" }, extra: ["l2-new", "leaf-flow"] };
S["l2-sdk"] = { title: "Inside the SDK", file: "explorer/l2-inside-the-sdk.html", kind: "arch", note: ["read", "Read from the published SDK source. Each box with a W-number opens a hand-drawn sketch of that finding, or use the chips below."], drill: { instr: fid("W-15"), ctx: fid("W-10"), wrap: fid("W-03"), tools3: fid("W-22"), http: fid("W-02"), patch: fid("W-09") }, extra: ids("W-04", "W-05", "W-06", "W-07", "W-08", "W-12", "W-13", "W-16", "W-17").concat(["l2-new"]) };
S["l2-decision"] = { title: "One buying question", file: "explorer/l2-the-decision.html", kind: "arch", note: ["measured", "Step 2 is the model's choice. The numbers on the cards are from saved runs against Claude (see stress/results)."], drill: { model: fid("W-20") }, extra: ids("W-18", "W-19", "W-22", "W-24") };
S["l2-within"] = { title: "Within's side", file: "explorer/l2-within-side.html", kind: "arch", note: ["read", "The /v1 routes come from the SDK source. Within's server code is private, so what happens inside it is not visible."], drill: { ans: "leaf-flow", act: fid("W-10"), hubsr: fid("W-24"), checks: fid("W-25"), doctor: fid("W-25") }, extra: ids("W-11", "W-21") };
S["l2-new"] = { title: "The newer parts", file: "explorer/l2-newer-parts.html", kind: "arch", note: ["measured", "Read from the 0.4.0 file and tested with checks N1 to N9 and real-Claude runs. A box with a W-number opens that finding."], drill: { fields: fid("W-21"), tools4: fid("W-22"), hubs: fid("W-24"), doctor: fid("W-25"), checks: fid("W-25") }, extra: ids("W-23", "W-26") };
S["leaf-flow"] = { title: "One tool call, step by step", file: "flow.svg", kind: "leaf", note: ["read", "Read from the SDK source. Each W-number is a finding in the report."] };
for (const [k, s] of Object.entries(S)) for (const t of [...Object.values(s.drill ?? {}), ...(s.extra ?? [])]) if (!S[t]) fail(`${k} points at unknown screen ${t}`);
// every finding must be reachable from the first screen
const reach = (start) => { const out = new Set([start]), q = [start]; while (q.length) { const s = S[q.pop()]; for (const t of [...Object.values(s.drill ?? {}), ...(s.extra ?? [])]) if (!out.has(t)) { out.add(t); q.push(t); } } return out; };
const reached = reach("l1");
for (const f of src.findings) if (!reached.has(fid(f.id))) fail(`no path from the first screen to ${f.id}`);

let html = fs.readFileSync(path.join(here, "map.template.html"), "utf8");
if (!html.includes("/*S*/")) fail("template has no /*S*/");
html = html.replace("/*S*/", JSON.stringify(S, null, 2)).replaceAll("{{VERSION}}", version);
fs.writeFileSync(path.join(root, "docs", "index.html"), html);
console.log(`map built: ${Object.keys(S).length} screens, ${pages.length} diagrams, ${src.findings.length} findings reachable`);
