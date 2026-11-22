// Loads the 1.0.4 update: findings-1.0.4.json (the prose and the per-finding status) plus results/sdk-1.0.4.json (what was measured).
// Used by build-findings.mjs (a status line on every old finding) and build-findings-104.mjs (the full 1.0.4 report).
// Every number in the prose is a {{R:CHECK.path}} or {{V:name}} placeholder, and every status is checked against the verdicts
// underneath it, so the text cannot drift from the saved results. A mismatch throws and the build stops.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rd = (p) => JSON.parse(fs.readFileSync(path.join(here, p), "utf8"));
export const SHORT = { present: "still there", notreproduced: "not reproduced", absent: "feature gone", nottested: "not tested" };
export const LABEL = { present: "Still there in 1.0.4.", notreproduced: "Not reproduced in 1.0.4.", absent: "Not applicable in 1.0.4: the feature is not in the package.", nottested: "Not tested on 1.0.4." };
// Founder-level text must read without jargon (same list as build-findings.mjs).
const JARGON = /`|\b(SDK|API|JSON|regex|schema|MCP|Zod|JWT|payload|endpoint|handler|npm|registerTool|structuredContent|userinfo|hash|header|bearer|PII)\b|_meta/i;

export function load104(mainSrc) {
  if (!fs.existsSync(path.join(here, "results/sdk-1.0.4.json")) || !fs.existsSync(path.join(here, "findings-1.0.4.json"))) return null;
  const src = rd("findings-1.0.4.json"), res = rd("results/sdk-1.0.4.json");
  const R = Object.fromEntries(res.results.map((r) => [r.id, r]));
  const fail = (m) => { throw new Error(`1.0.4: ${m}`); };
  if (res.meta.sdk.version !== src.version) fail(`results are for ${res.meta.sdk.version}, the text is for ${src.version}`);
  if (res.results.some((r) => r.verdict === "error")) fail(`a check errored: ${res.results.filter((r) => r.verdict === "error").map((r) => r.id).join(", ")}`);
  const ids = mainSrc.findings.map((f) => f.id); // all 26, including the six that were new in 0.4.0
  for (const id of ids) if (!src.statuses[id]) fail(`${id} has no status`);
  for (const id of Object.keys(src.statuses)) if (!ids.includes(id)) fail(`status for unknown finding ${id}`);
  const absentS1 = R.S1?.evidence?.absent ?? fail("check S1 has no result");
  const bad = (v) => v === "fail" || v === "gap";
  for (const id of ids) {
    const s = src.statuses[id], vs = s.tests.map((t) => [t, (R[t] ?? fail(`${id} cites unknown check ${t}`)).verdict]);
    if (!SHORT[s.key]) fail(`${id}: unknown status ${s.key}`);
    for (const w of s.absentWords ?? []) if (!absentS1.includes(w)) fail(`${id} says "${w}" is absent from the code, but S1 found it`);
    if (s.key === "present" && !vs.some(([, v]) => bad(v))) fail(`${id} is "still there" but none of its checks is a gap or a fail`);
    if (s.key === "notreproduced") for (const [t, v] of vs) if (v === "fail" || (v === "gap" && !(s.allowGap ?? []).includes(t))) fail(`${id} is "not reproduced" but ${t} is ${v}`);
    if (s.key === "absent" && !(s.absentWords?.length || s.tests.includes("F5"))) fail(`${id} is "feature gone" with nothing to show it`);
    if (s.tests.includes("F5") && R.F5.evidence.hits.length) fail(`${id}: F5 found private-network lists after all`);
  }
  const keys = (k) => ids.filter((id) => src.statuses[id].key === k);
  const nf = src.newFindings;
  for (const f of nf) for (const t of f.tests) if (!R[t]) fail(`${f.id} cites unknown check ${t}`);
  const V = {
    version: res.meta.sdk.version, n: res.results.length, node: res.meta.node, mcpSdk: res.meta.mcpSdk, zod: res.meta.zod, zod4: res.meta.zod4, fingerprint: res.meta.sdk.distSha256.slice(0, 12),
    ranAt: res.meta.ranAt.replace("T", " ").slice(0, 16) + " UTC", oldCount: ids.length,
    tally: ["pass", "gap", "info", "fail"].map((k) => `${res.tally[k] ?? 0} ${k}`).join(", "),
    presentCount: keys("present").length, presentList: keys("present").join(", "), notreproducedCount: keys("notreproduced").length, absentCount: keys("absent").length, nottestedCount: keys("nottested").length,
    newCount: nf.length, newList: nf.map((f) => f.id).join(", "), newHigh: nf.filter((f) => f.severity === "High").length,
    stallSeconds: (R.C8.evidence.out[3].maxEventLoopStallMs / 1000).toFixed(1),
  };
  for (const [k, v] of Object.entries(src.expect)) if (V[k === "present" ? "presentCount" : k === "notreproduced" ? "notreproducedCount" : k === "absent" ? "absentCount" : k === "nottested" ? "nottestedCount" : k === "newCount" ? "newCount" : "newHigh"] !== v) fail(`the checks now give ${k} = ${V[k] ?? "?"}, but expect.${k} is ${v}: the prose is stale`);
  const dig = (o, p) => p.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce((a, k) => (a == null ? undefined : a[k]), o);
  const resolve = (text) => text.replace(/\{\{([RV]):([^}]+)\}\}/g, (m, ns, p) => {
    const v = ns === "R" ? dig(R, p) : V[p];
    if (v === undefined || v === null) fail(`unresolved placeholder ${m}`);
    return Array.isArray(v) ? v.join(", ") : String(v);
  });
  for (const [what, t] of [...src.summary.slice(0, 4).map((t, i) => [`summary[${i}]`, t]), ...nf.map((f) => [`${f.id}.founder`, f.founder])]) {
    const m = t.match(JARGON); if (m) fail(`${what}: founder-level text uses "${m[0]}". Rewrite it in plain words.`);
  }
  // resolve everything once, so a bad placeholder stops the build here
  const status = (id) => { const s = src.statuses[id]; return s ? { key: s.key, short: SHORT[s.key], label: LABEL[s.key], text: resolve(s.text), sev: s.sev104 ?? null, tests: s.tests } : null; };
  for (const id of ids) status(id);
  const newF = nf.map((f) => ({ ...f, plain: resolve(f.plain), why: resolve(f.why) }));
  return { src, res, R, V, resolve, status, newFindings: newF };
}
