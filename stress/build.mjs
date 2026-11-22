// Builds the report on within-sdk 1.0.4 from ONE source, stress/findings.json, plus the saved results:
//   ../FINDINGS.md         (read on GitHub)
//   ../docs/findings.html  (the same content as a web page)
//   ../docs/index.html     (a one-screen summary with the picture)
// Every number in the prose is a {{R:CHECK.path}} (the stock package), {{P:CHECK.path}} (the patched copy) or {{V:name}} placeholder,
// and the build fails if one cannot be resolved or if a claim does not match the verdicts underneath it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(here, p), "utf8"));
const src = rd("findings.json"), stock = rd("results/sdk-1.0.4.json"), patched = rd("results/patched-1.0.4.json");
const R = Object.fromEntries(stock.results.map((r) => [r.id, r])), P = Object.fromEntries(patched.results.map((r) => [r.id, r]));
const fail = (m) => { throw new Error(m); };

// ---- guards: the text may not say more than the results do
if (stock.meta.sdk.version !== "1.0.4" || patched.meta.sdk.version !== "1.0.4") fail("results are not for 1.0.4");
if (!patched.meta.sdk.source.startsWith("patched")) fail("results/patched-1.0.4.json was not made from the patched copy");
for (const r of [...stock.results, ...patched.results]) if (r.verdict === "error") fail(`a check errored: ${r.id}: ${r.observed.slice(0, 120)}`);
const bad = (v) => v === "fail" || v === "gap";
const F = src.findings;
for (const f of F) {
  for (const t of f.tests) if (!R[t]) fail(`${f.id} cites unknown check ${t}`);
  if (!f.tests.some((t) => bad(R[t].verdict))) fail(`${f.id} is a finding but none of its checks is a gap or a fail`);
  if (f.mitigation) { const m = R[f.mitigation.check] ?? fail(`${f.id}: unknown mitigation check`); if (m.verdict !== "pass") fail(`${f.id}: the vendor-side fix ${f.mitigation.check} does not pass (${m.verdict})`); }
  if (f.patch) for (const c of f.patch.checks) {
    if (!P[c] || !R[c]) fail(`${f.id}: patch check ${c} missing`);
    if (!bad(R[c].verdict)) fail(`${f.id}: ${c} is ${R[c].verdict} on the stock package, so the patch fixes nothing`);
    if (bad(P[c].verdict)) fail(`${f.id}: ${c} is still ${P[c].verdict} on the patched copy, so ${f.patch.id} does not fix it`);
  }
}
const JARGON = /`|\b(SDK|API|JSON|regex|schema|MCP|Zod|JWT|payload|endpoint|handler|npm|registerTool|structuredContent|userinfo|hash|header|bearer|PII)\b|_meta/i;
const sevOrder = { High: 0, Medium: 1, Low: 2 };
const count = (s) => F.filter((f) => f.severity === s).length;
const withMit = F.filter((f) => f.mitigation), withPatch = F.filter((f) => f.patch);
const V = {
  version: stock.meta.sdk.version, n: stock.results.length, node: stock.meta.node, mcpSdk: stock.meta.mcpSdk, fingerprint: stock.meta.sdk.distSha256.slice(0, 12),
  ranAt: stock.meta.ranAt.replace("T", " ").slice(0, 16) + " UTC", patchedRanAt: patched.meta.ranAt.replace("T", " ").slice(0, 16) + " UTC",
  tally: ["pass", "gap", "info", "fail"].map((k) => `${stock.tally[k] ?? 0} ${k}`).join(", "),
  patchedTally: ["pass", "gap", "info", "fail"].map((k) => `${patched.tally[k] ?? 0} ${k}`).join(", "),
  count: F.length, high: count("High"), medium: count("Medium"), low: count("Low"), mitigatedCount: withMit.length, patchedCount: withPatch.length,
  patchSummary: withPatch.map((f) => `${f.patch.id} for ${f.id}`).join(", "),
  stallSeconds: (R.C8.evidence.out[3].maxEventLoopStallMs / 1000).toFixed(1),
};
const dig = (o, p) => p.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce((a, k) => (a == null ? undefined : a[k]), o);
const resolve = (text) => text.replace(/\{\{([RPV]):([^}]+)\}\}/g, (m, ns, p) => {
  const v = ns === "R" ? dig(R, p) : ns === "P" ? dig(P, p) : V[p];
  if (v === undefined || v === null) fail(`Unresolved placeholder ${m}`);
  return Array.isArray(v) ? (v.length ? v.join(", ") : "none") : String(v);
});
for (const [what, t] of [...src.summary.map((t, i) => [`summary[${i}]`, t]), ...F.map((f) => [f.id + ".founder", f.founder])]) { const m = t.match(JARGON); if (m) fail(`${what}: founder-level text uses "${m[0]}". Rewrite it in plain words.`); }
const cards = F.map((f) => ({ ...f, plain: resolve(f.plain), why: resolve(f.why), mitigation: f.mitigation && { ...f.mitigation, text: resolve(f.mitigation.text) }, patch: f.patch && { ...f.patch, text: resolve(f.patch.text) }, where: f.where.map(resolve) }));
const sorted = [...cards].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.id.localeCompare(b.id));
const verdictLabel = { pass: "pass", fail: "FAIL", gap: "gap", info: "info" };
const summary = src.summary.map(resolve), intro = src.intro.map(resolve), method = src.method.map(resolve), notTested = src.notTested.map(resolve);
const testLine = (id) => R[id];

// ---- Markdown
const md = [], L = (s = "") => md.push(s);
L(`# ${src.title}`); L();
for (const p of intro) L(p), L();
L("## The short version"); L();
for (const b of summary) L(`- ${b}`);
L();
L(`Tested ${V.ranAt} on \`within-sdk\` ${V.version} from npm (file fingerprint \`${V.fingerprint}\`), Node ${V.node}, MCP SDK ${V.mcpSdk}. Line numbers refer to that package's files, because Within's source repository is not public.`); L();
L("## At a glance"); L();
L(`${V.count} findings: ${V.high} High, ${V.medium} Medium, ${V.low} Low. ${V.n} checks on the stock package (${V.tally}); the same checks on the patched copy (${V.patchedTally}).`); L();
L("| ID | Severity | What | A vendor can fix it today | Within's fix, tested |"); L("|---|---|---|---|---|");
for (const f of sorted) L(`| [${f.id}](#${f.id.toLowerCase()}) | ${f.severity} | ${f.title} | ${f.mitigation ? `yes (\`${f.mitigation.check}\`)` : "no"} | ${f.patch ? `yes (\`${f.patch.id}\`)` : "not patched"} |`);
L(); L("### What the severity words mean"); L();
for (const s of src.severity) L(`- **${s.name}.** ${s.meaning}`);
L(); L("### What the verdicts mean"); L();
L("- **pass.** The package did what the README, or a reasonable vendor, would expect."); L("- **FAIL.** The package breaks something a vendor would reasonably expect."); L("- **gap.** Behaviour that is deliberate or documented in passing but leaves a risk. A decision for Within's team."); L("- **info.** A measurement."); L();
L("![A tool call's journey through within-sdk, with the findings marked](docs/flow.svg)"); L();
L("## Findings"); L();
for (const f of sorted) {
  L(`### ${f.id}`); L(); L(`**${f.severity}: ${f.title}**`); L();
  L(`**For a founder.** ${f.founder}`); L(); L(`**In plain words.** ${f.plain}`); L(); L(`**Why it matters.** ${f.why}`); L();
  L("**What we measured.**"); L();
  for (const id of f.tests) { const t = testLine(id); L(`- \`${t.id}\` (${verdictLabel[t.verdict]}): ${t.title} ${t.observed}`); }
  L(); L("**Where in the code.**"); L(); for (const w of f.where) L(`- ${w}`); L();
  L("**What Within should change.**"); L(); for (const w of f.fix) L(`- ${w}`); L();
  if (f.mitigation) L(`**What a vendor can do today** (\`${f.mitigation.check}\`, pass). ${f.mitigation.text}`), L();
  if (f.patch) L(`**Within's fix, tested** (\`${f.patch.id}\`). ${f.patch.text}`), L();
  if (f.earlier) L(`*Earlier numbering: ${f.earlier}.*`), L();
  L(`**Reproduce.** \`${f.repro}\``); L();
}
L("## What held up"); L(); for (const h of src.heldUp) L(`- ${h.text} (\`${h.test}\`)`); L();
L("## What we did not test"); L(); for (const n of notTested) L(`- ${n}`); L();
L("## Method"); L(); for (const b of method) L(`- ${b}`); L();
L("## Reproduce everything"); L();
L("```bash"); L("cd stress/v104"); L("npm install --ignore-scripts          # within-sdk 1.0.4 from npm"); L("node run-all.mjs                      # the checks on the stock package, about 6 minutes"); L("node patches.mjs                      # builds patched-sdk with fixes P1 to P6");
L("WITHIN_PKG_DIR=$PWD/patched-sdk OUT_DIR=$PWD/out-patched RESULTS_FILE=$PWD/../results/patched-1.0.4.json node run-all.mjs"); L("cd .. && npm run build:findings       # rebuilds this file and the web pages from the saved results"); L("```");
fs.writeFileSync(path.join(root, "FINDINGS.md"), md.join("\n"));

// ---- HTML
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
const css = fs.readFileSync(path.join(here, "report.css"), "utf8");
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>\n${css}</style></head><body><div class="wrap">\n${body}\n</div></body></html>`;
const top = (other) => `<div class="top">${other} · <a href="https://github.com/1AlgoRythm/within-trigger-check">Source and tests on GitHub</a></div>`;
const h = [], H = (s) => h.push(s);
H(top('<a href="index.html">Summary</a>')); H(`<h1>${esc(src.title)}</h1>`);
for (const p of intro) H(`<p>${inline(p)}</p>`);
H(`<h2>The short version</h2><ul>${summary.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`);
H(`<p class="mute">Tested ${V.ranAt} on <code>within-sdk</code> ${V.version} from npm (file fingerprint <code>${V.fingerprint}</code>), Node ${V.node}, MCP SDK ${V.mcpSdk}. Line numbers refer to that package's files, because Within's source repository is not public.</p>`);
H(`<h2>At a glance</h2><p><strong>${V.count} findings: ${V.high} High, ${V.medium} Medium, ${V.low} Low.</strong> ${V.n} checks on the stock package (${V.tally}); the same checks on the patched copy (${V.patchedTally}).</p>`);
H(`<img src="flow.svg" alt="A tool call's journey through within-sdk, with the findings marked" style="width:100%;border:1px solid var(--line);border-radius:10px;background:#fff">`);
H(`<table class="sum"><tr><th>ID</th><th>Severity</th><th>What</th><th>A vendor can fix it today</th><th>Within's fix, tested</th></tr>`);
for (const f of sorted) H(`<tr><td><a href="#${f.id.toLowerCase()}">${f.id}</a></td><td><span class="badge ${f.severity}">${f.severity}</span></td><td>${inline(f.title)}</td><td>${f.mitigation ? `<span class="st yes">yes</span> <code>${f.mitigation.check}</code>` : `<span class="st no">no</span>`}</td><td>${f.patch ? `<span class="st yes">yes</span> <code>${f.patch.id}</code>` : `<span class="st no">not patched</span>`}</td></tr>`);
H(`</table><h3 style="margin-top:20px">What the words mean</h3><ul>${src.severity.map((s) => `<li><strong>${s.name}.</strong> ${inline(s.meaning)}</li>`).join("")}<li><span class="v pass">pass</span> did what the README, or a reasonable vendor, would expect.</li><li><span class="v fail">FAIL</span> breaks something a vendor would reasonably expect.</li><li><span class="v gap">gap</span> deliberate or only mentioned in passing, and it leaves a risk. A decision for Within's team.</li><li><span class="v info">info</span> a measurement.</li></ul>`);
H(`<h2>Findings</h2>`);
for (const f of sorted) {
  H(`<div class="card ${f.severity}" id="${f.id.toLowerCase()}"><h3><span class="badge ${f.severity}">${f.severity}</span>${f.id} · ${inline(f.title)}</h3>`);
  H(`<div class="k">For a founder</div><p>${esc(f.founder)}</p><div class="k">In plain words</div><p>${inline(f.plain)}</p><div class="k">Why it matters</div><p>${inline(f.why)}</p>`);
  H(`<div class="k">What we measured</div><ul>${f.tests.map((id) => { const t = testLine(id); return `<li><code>${t.id}</code> <span class="v ${t.verdict}">${verdictLabel[t.verdict]}</span> ${inline(t.title)} ${inline(t.observed)}</li>`; }).join("")}</ul>`);
  H(`<div class="k">Where in the code</div><ul>${f.where.map((w) => `<li>${inline(w)}</li>`).join("")}</ul><div class="k">What Within should change</div><ul>${f.fix.map((w) => `<li>${inline(w)}</li>`).join("")}</ul>`);
  if (f.mitigation) H(`<div class="mit"><strong>What a vendor can do today</strong> (<code>${f.mitigation.check}</code>, pass). ${inline(f.mitigation.text)}</div>`);
  if (f.patch) H(`<div class="pat"><strong>Within's fix, tested</strong> (<code>${f.patch.id}</code>). ${inline(f.patch.text)}</div>`);
  if (f.earlier) H(`<p class="mute">Earlier numbering: ${esc(f.earlier)}.</p>`);
  H(`<p class="mute"><strong>Reproduce:</strong> <code>${esc(f.repro)}</code></p></div>`);
}
H(`<h2>What held up</h2><ul>${src.heldUp.map((x) => `<li>${inline(x.text)} (<code>${x.test}</code>)</li>`).join("")}</ul>`);
H(`<h2>What we did not test</h2><ul>${notTested.map((n) => `<li>${inline(n)}</li>`).join("")}</ul>`);
H(`<h2>Method</h2><ul>${method.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`);
H(`<h2>Reproduce everything</h2><pre>cd stress/v104
npm install --ignore-scripts          # within-sdk 1.0.4 from npm
node run-all.mjs                      # the checks on the stock package, about 6 minutes
node patches.mjs                      # builds patched-sdk with fixes P1 to P6
WITHIN_PKG_DIR=$PWD/patched-sdk OUT_DIR=$PWD/out-patched RESULTS_FILE=$PWD/../results/patched-1.0.4.json node run-all.mjs
cd .. &amp;&amp; npm run build:findings       # rebuilds this page, FINDINGS.md and the summary page</pre>`);
fs.writeFileSync(path.join(root, "docs/findings.html"), page(src.title, h.join("\n")));

// ---- one-screen summary
const i = [], I = (s) => i.push(s);
I(top('<a href="findings.html">The full report</a>')); I(`<h1>Within's public package, <code>within-sdk</code> ${V.version}</h1>`);
I(`<p>${inline(intro[0])}</p>`);
I(`<div class="big"><div><b>${V.count}</b>problems found<br><span class="mute">${V.high} High, ${V.medium} Medium, ${V.low} Low</span></div><div><b>${V.mitigatedCount}</b>a vendor can fix today<br><span class="mute">with the package's own options</span></div><div><b>${V.patchedCount}</b>fixed by a small change<br><span class="mute">tested on a patched copy</span></div><div><b>${V.n}</b>checks run<br><span class="mute">${V.tally}</span></div></div>`);
I(`<img src="flow.svg" alt="A tool call's journey through within-sdk, with the findings marked" style="width:100%;border:1px solid var(--line);border-radius:10px;background:#fff">`);
I(`<h2>The short version</h2><ul>${summary.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`);
I(`<table class="sum"><tr><th>ID</th><th>Severity</th><th>What</th><th>Vendor fix today</th><th>Within's fix</th></tr>${sorted.map((f) => `<tr><td><a href="findings.html#${f.id.toLowerCase()}">${f.id}</a></td><td><span class="badge ${f.severity}">${f.severity}</span></td><td>${inline(f.title)}</td><td>${f.mitigation ? `<span class="st yes">yes</span>` : `<span class="st no">no</span>`}</td><td>${f.patch ? `<span class="st yes">tested</span>` : `<span class="st no">not patched</span>`}</td></tr>`).join("")}</table>`);
I(`<p><a href="findings.html"><strong>Read the full report →</strong></a> Every finding has the evidence, the place in the code, what a vendor can do today, and Within's fix tested on a patched copy.</p>`);
fs.writeFileSync(path.join(root, "docs/index.html"), page(`Within's public package, within-sdk ${V.version}`, i.join("\n")));

// ---- the summary block in README.md, between its two markers, so the README cannot drift from the results
const readmePath = path.join(root, "README.md"); let readme = fs.readFileSync(readmePath, "utf8");
const a = "<!-- summary:start -->", b = "<!-- summary:end -->";
if (!readme.includes(a) || !readme.includes(b)) fail("README.md has no summary markers");
const block = `${a}\n\n**${V.count} findings on \`within-sdk\` ${V.version}: ${V.high} High, ${V.medium} Medium, ${V.low} Low.** ${V.n} checks on the stock package (${V.tally}), tested ${V.ranAt}.\n\n${summary.map((x) => `- ${x}`).join("\n")}\n\n| ID | Severity | What | Vendor fix today | Within's fix, tested |\n|---|---|---|---|---|\n${sorted.map((f) => `| [${f.id}](FINDINGS.md#${f.id.toLowerCase()}) | ${f.severity} | ${f.title} | ${f.mitigation ? "yes" : "no"} | ${f.patch ? "yes (" + f.patch.id + ")" : "not patched"} |`).join("\n")}\n\n${b}`;
readme = readme.slice(0, readme.indexOf(a)) + block + readme.slice(readme.indexOf(b) + b.length);
fs.writeFileSync(readmePath, readme);
console.log(`built FINDINGS.md, docs/findings.html and docs/index.html: ${V.count} findings, ${V.n} checks (${V.tally}); patched ${V.patchedTally}`);
