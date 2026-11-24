// Builds the report on @getwithin/sdk 0.4.0 from ONE source, stress/findings.json, plus the saved results:
//   ../FINDINGS.md         (read on GitHub)
//   ../docs/findings.html  (the same content as a web page)
//   the summary block in ../README.md
// Every number in the prose is a {{ID:path}} placeholder: a check id (read from results/sdk-0.4.0.json or results/new-in-040.json),
// U (saved real-Claude runs, see model-stats.mjs) or V (the run itself). The build fails if one cannot be resolved, if a finding
// has no check that is a gap or a fail, or if founder-level text uses jargon.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { modelStats } from "./model-stats.mjs";

const fail = (m) => { throw new Error(m); };
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(here, p), "utf8"));
const src = rd("findings.json"), main = rd("results/sdk-0.4.0.json"), news = rd("results/new-in-040.json"), patched = rd("results/patched-0.4.0.json");
const sketchFiles = rd("sketches.json");
if (main.meta.sdk.version !== "0.4.0" || news.meta.sdk.version !== "0.4.0") fail("results are not for 0.4.0");
const byId = (d) => Object.fromEntries(d.results.map((r) => [r.id, r]));
const R = { ...byId(main), ...byId(news) }, P = byId(patched);
for (const r of [...main.results, ...news.results, ...patched.results]) if (r.verdict === "error") fail(`a check errored: ${r.id}`);
const bad = (v) => v === "fail" || v === "gap";
const F = src.findings;
const U = modelStats();

for (const f of F) {
  if (!sketchFiles[f.id] || !fs.existsSync(path.join(root, "docs", sketchFiles[f.id].file))) fail(`${f.id} has no sketch: run node sketches.mjs first`);
  for (const t of f.tests) if (!R[t]) fail(`${f.id} cites unknown check ${t}`);
  if (f.tests.length && !f.infoOk && !f.tests.some((t) => bad(R[t].verdict))) fail(`${f.id} is a finding but none of its checks is a gap or a fail`);
  if (!f.tests.length && !f.modelTest) fail(`${f.id} has neither a check nor a model test`);
}
const JARGON = /`|\b(SDK|API|JSON|regex|schema|MCP|Zod|JWT|payload|endpoint|handler|npm|registerTool|structuredContent|userinfo|hash|header|bearer|PII)\b|_meta/i;
for (const [what, t] of [...F.map((f) => [f.id, f.founder]), ...src.founderSummary.map((t, i) => [`founderSummary[${i}]`, t])]) { const m = t?.match(JARGON); if (m) fail(`${what}: founder-level text uses "${m[0]}"; only the glossary may explain it`); }

const count = (s) => F.filter((f) => f.severity === s).length;
function flips(f) { return f.tests.filter((t) => P[t] && bad(R[t].verdict) && !bad(P[t].verdict)); }
const noPatch = F.filter((f) => f.prototype && !flips(f).length && !f.modelTest).map((f) => `${f.id} (${f.prototype})`);
const V = {
  version: main.meta.sdk.version, n: main.results.length, nNew: news.results.length, node: main.meta.node, mcpSdk: main.meta.mcpSdk, fingerprint: main.meta.sdk.distSha256.slice(0, 12),
  ranAt: main.meta.ranAt.replace("T", " ").slice(0, 16) + " UTC", source: main.meta.sdk.source,
  tally: ["pass", "gap", "info", "fail"].map((k) => `${main.results.filter((r) => r.verdict === k).length} ${k}`).join(", "),
  newTally: ["pass", "gap", "info", "fail"].map((k) => `${news.results.filter((r) => r.verdict === k).length} ${k}`).join(", "),
  patchedTally: ["pass", "gap", "info", "fail"].map((k) => `${patched.results.filter((r) => r.verdict === k).length} ${k}`).join(", "),
  count: F.length, high: count("High"), medium: count("Medium"), low: count("Low"),
  highIds: F.filter((f) => f.severity === "High").map((f) => f.id).join(", "),
  flipped: new Set(F.flatMap(flips)).size, flipList: [...new Set(F.flatMap(flips))].join(", "), noPatch: noPatch.length ? noPatch.join(", ") : "none",
  stall: (R.C8.evidence.rows[2].medianMs / 1000).toFixed(1),
};
const dig = (o, p) => p.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce((a, k) => (a == null ? undefined : a[k]), o);
const resolve = (text) => String(text).replace(/\{\{([A-Za-z0-9]+):([^}]+)\}\}/g, (m, ns, p) => {
  const v = ns === "U" ? U[p] : ns === "V" ? V[p] : dig(R[ns] ?? fail(`unknown check in ${m}`), p);
  if (v === undefined || v === null) fail(`Unresolved placeholder ${m}`);
  return Array.isArray(v) ? v.join(", ") : String(v);
});
const patchLine = (f) => {
  if (!f.prototype) return null;
  if (f.modelTest) return `Patch ${f.prototype}, tested with real Claude: ${resolve("{{U:x1Patched}}")} runs sent the question to Within, against ${U.x1New} unpatched (Fisher exact p = ${U.x1PatchedP}).`;
  const fl = flips(f);
  if (fl.length) return `Patch ${f.prototype} (in \`stress/patches\`), tested on a patched copy: ${fl.map((t) => `${t} goes from ${R[t].verdict} to ${P[t].verdict}`).join("; ")}.`;
  return `Patch ${f.prototype} does not change the verdict of ${f.tests.join(", ")} on this version's code (${f.tests.map((t) => `${t}: ${P[t] ? P[t].verdict : "not run"} on the patched copy`).join("; ")}), so it is not offered as a fix.`;
};
const groups = src.groups.map((g) => ({ g, items: F.filter((f) => f.group === g) })).filter((x) => x.items.length);
const sevOrder = { High: 0, Medium: 1, Low: 2 };
const glance = [...F].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.id.localeCompare(b.id));
const verdictLabel = { pass: "pass", fail: "FAIL", gap: "gap", info: "info" };
const founder = src.founderSummary.map(resolve);
const heldUp = [
  ...src.heldUp.map((h) => `${h.text} (\`${h.test}\`)`),
  `Real Claude (Haiku and Sonnet, ${U.trigHaikuRuns + U.trigSonnetRuns} runs): every buying question reached Within (${U.trigHaikuCalled} of ${U.trigHaikuRuns} and ${U.trigSonnetCalled} of ${U.trigSonnetRuns}).`,
  `Real Claude with a rep's offer waiting (Haiku ${U.consHaikuRuns} runs, Sonnet ${U.consSonnetRuns} runs, some with an instruction planted in a record): the accept tool was called ${U.consHaikuConfirm + U.consSonnetConfirm} times.`,
  `The 20 labelled prompts in the repo's test page: ${U.recallCalled} of ${U.recallOf} buying questions reached Within, and ${U.falseCalled} of ${U.falseOf} other questions did.`,
];
const method = [
  `Tested ${V.ranAt} on \`@getwithin/sdk\` ${V.version} from the npm registry (file fingerprint \`${V.fingerprint}\`; the public mirror serves the same file), Node ${V.node}, MCP SDK ${V.mcpSdk}. Line numbers refer to that package's \`dist/index.js\`, because Within's source repository is not public.`,
  `${V.n} checks on the stock package (${V.tally}), ${V.nNew} checks for the newer parts (${V.newTally}), and the same ${V.n} on a patched copy (${V.patchedTally}). Nothing contacts Within: every request goes to a stand-in on 127.0.0.1.`,
  "The real-Claude runs (Haiku 5.5 and Sonnet 5.5, one fresh headless session per run) were made on 2026-11-20 and 2026-11-21 on the same package file, and were not repeated on 2026-11-23 because each batch spends Claude usage. They are labelled as such wherever they are used.",
  "A check that gives the same verdict as another run proves nothing about the code behind it: the repo also compares the function text that each finding points at (`code-locations.mjs`).",
];

// ---- Markdown
const md = [], L = (s = "") => md.push(s);
L(`# ${src.title}`); L();
for (const p of src.intro) L(p), L();
L("## The short version, for a founder"); L(); for (const b of founder) L(`- ${b}`); L();
L("**Explore it:** [the interactive map](https://satyaasudarshan.me/within-trigger-check/) opens a hand-drawn sketch of every finding below."); L();
L("## At a glance"); L();
L(`**${V.count} findings: ${V.high} High, ${V.medium} Medium, ${V.low} Low.** ${V.n} checks on the stock package (${V.tally}); ${V.nNew} more for the newer parts (${V.newTally}).`); L();
L("| ID | Severity | What | Prototype fix |"); L("|---|---|---|---|");
for (const f of glance) L(`| [${f.id}](#${f.id.toLowerCase()}) | ${f.severity} | ${f.title} | ${f.prototype && patchLine(f) && !/not offered/.test(patchLine(f)) ? f.prototype : "none"} |`);
L(); L("**If you only fix six things:** W-02 (an outage must not change or break the vendor's own answers), W-09, W-10 and W-11 (what leaves the vendor's server, and what the docs say about it), W-04 (never swallow a vendor's own `context` input) and W-21 (a login token must not leave the vendor's server)."); L();
L("### What the severity words mean"); L(); for (const s of src.severity) L(`- **${s.name}.** ${s.meaning}`);
L(); L("### What the verdicts mean"); L(); L("- **pass.** The package did what the docs, or a reasonable vendor, would expect."); L("- **FAIL.** The package contradicts its own docs, or breaks something a vendor would reasonably expect."); L("- **gap.** Behaviour that is documented or deliberate but leaves a risk, or behaviour the docs do not mention. A decision for Within's team, not necessarily a bug."); L("- **info.** A measurement, with no judgement attached."); L();
L("![One tool call through the Within SDK, with the findings marked](docs/flow.svg)"); L();
for (const { g, items } of groups) {
  L(`## ${g}`); L();
  for (const f of items) {
    L(`### ${f.id}`); L(); L(`**${f.severity}: ${f.title}**`); L();
    L(`![Sketch of ${f.id}: ${f.title}](docs/${sketchFiles[f.id].file})`); L();
    L(`**For a founder.** ${f.founder}`); L(); L(`**In plain words.** ${resolve(f.plain)}`); L(); L(`**Why it matters.** ${resolve(f.why)}`); L();
    if (f.tests.length) { L("**What we measured.**"); L(); for (const id of f.tests) { const t = R[id]; L(`- \`${t.id}\` (${verdictLabel[t.verdict]}): ${t.title} ${t.observed}`); } L(); }
    L("**Where in the code.**"); L(); for (const w of f.where) L(`- ${w}`); L();
    L("**What Within should change.**"); L(); for (const w of f.fix) L(`- ${w}`); L();
    const pl = patchLine(f); if (pl) L(`**Prototype fix.** ${pl}`), L();
    if (f.extra) L(`**Note.** ${f.extra}`), L();
    L(`**Reproduce.** \`${f.reproFull ?? f.repro}\``); L();
  }
}
L("## What held up"); L(); for (const h of heldUp) L(`- ${h}`); L();
L("## What we did not test"); L(); for (const n of src.notTested) L(`- ${n}`); L();
L("## Method"); L(); for (const b of method) L(`- ${b}`); L();
L("## Reproduce everything"); L(); L("Every step, with the result to expect, is in [REPRODUCE.md](REPRODUCE.md)."); L();
L("## Words used in this report"); L(); for (const g of src.glossary) L(`- **${g.term}.** ${g.means}`); L();
L("## Back to the portfolio"); L(); L("This stress test is one of Satyaa Sudarshan Guruswamy Sethuraman's projects. [satyaasudarshan.me](https://satyaasudarshan.me) has the rest.");
fs.writeFileSync(path.join(root, "FINDINGS.md"), md.join("\n"));

// ---- HTML
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
const css = fs.readFileSync(path.join(here, "report.css"), "utf8");
const PORTFOLIO = "https://satyaasudarshan.me";
const foot = `<h2>Back to the portfolio</h2><p>This stress test is one of Satyaa Sudarshan Guruswamy Sethuraman's projects. <a href="${PORTFOLIO}">satyaasudarshan.me</a> has the rest.</p>`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>\n${css}</style></head><body><div class="wrap">\n${body}\n${foot}\n</div></body></html>`;
const h = [], H = (s) => h.push(s);
H(`<div class="top"><a href="index.html">Interactive map</a> · <a href="https://github.com/1AlgoRythm/within-trigger-check">Source and tests on GitHub</a> · <a href="${PORTFOLIO}">Portfolio</a></div>`); H(`<h1>${esc(src.title)}</h1>`);
for (const p of src.intro) H(`<p>${inline(p)}</p>`);
H(`<h2>The short version, for a founder</h2><ul>${founder.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`);
H(`<p><a href="index.html"><strong>Open the interactive map →</strong></a> Click into the package box by box; every finding opens its sketch.</p>`);
H(`<h2>At a glance</h2><p><strong>${V.count} findings: ${V.high} High, ${V.medium} Medium, ${V.low} Low.</strong> ${V.n} checks on the stock package (${V.tally}); ${V.nNew} more for the newer parts (${V.newTally}).</p>`);
H(`<img src="flow.svg" alt="One tool call through the Within SDK, with the findings marked" style="width:100%;border:1px solid var(--line);border-radius:10px;background:#fff">`);
H(`<table class="sum"><tr><th>ID</th><th>Severity</th><th>What</th><th>Prototype fix</th></tr>`);
for (const f of glance) H(`<tr><td><a href="#${f.id.toLowerCase()}">${f.id}</a></td><td><span class="badge ${f.severity}">${f.severity}</span></td><td>${inline(f.title)}</td><td>${f.prototype && !/not offered/.test(patchLine(f)) ? `<code>${f.prototype}</code>` : "none"}</td></tr>`);
H(`</table><p><strong>If you only fix six things:</strong> W-02 (an outage must not change or break the vendor's own answers), W-09, W-10 and W-11 (what leaves the vendor's server, and what the docs say about it), W-04 (never swallow a vendor's own <code>context</code> input) and W-21 (a login token must not leave the vendor's server).</p>`);
H(`<h3>What the words mean</h3><ul>${src.severity.map((s) => `<li><strong>${s.name}.</strong> ${inline(s.meaning)}</li>`).join("")}<li><span class="v pass">pass</span> did what the docs, or a reasonable vendor, would expect.</li><li><span class="v fail">FAIL</span> contradicts the docs, or breaks something a vendor would reasonably expect.</li><li><span class="v gap">gap</span> deliberate or documented behaviour that leaves a risk, or behaviour the docs do not mention. A decision for Within's team.</li><li><span class="v info">info</span> a measurement.</li></ul>`);
for (const { g, items } of groups) {
  H(`<h2>${esc(g)}</h2>`);
  for (const f of items) {
    H(`<div class="card ${f.severity}" id="${f.id.toLowerCase()}"><h3><span class="badge ${f.severity}">${f.severity}</span>${f.id} · ${inline(f.title)}</h3>`);
    H(`<img src="${sketchFiles[f.id].file}" alt="Sketch of ${f.id}: ${esc(f.title)}" style="width:100%;border:1px solid var(--line);border-radius:10px;background:#fffdf7;margin:6px 0">`);
    H(`<div class="k">For a founder</div><p>${esc(f.founder)}</p><div class="k">In plain words</div><p>${inline(resolve(f.plain))}</p><div class="k">Why it matters</div><p>${inline(resolve(f.why))}</p>`);
    if (f.tests.length) H(`<div class="k">What we measured</div><ul>${f.tests.map((id) => { const t = R[id]; return `<li><code>${t.id}</code> <span class="v ${t.verdict}">${verdictLabel[t.verdict]}</span> ${inline(t.title)} ${inline(t.observed)}</li>`; }).join("")}</ul>`);
    H(`<div class="k">Where in the code</div><ul>${f.where.map((w) => `<li>${inline(w)}</li>`).join("")}</ul><div class="k">What Within should change</div><ul>${f.fix.map((w) => `<li>${inline(w)}</li>`).join("")}</ul>`);
    const pl = patchLine(f); if (pl) H(`<div class="pat"><strong>Prototype fix.</strong> ${inline(pl)}</div>`);
    if (f.extra) H(`<p class="mute"><strong>Note.</strong> ${inline(f.extra)}</p>`);
    H(`<p class="mute"><strong>Reproduce:</strong> <code>${esc(f.reproFull ?? f.repro)}</code></p></div>`);
  }
}
H(`<h2>What held up</h2><ul>${heldUp.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`);
H(`<h2>What we did not test</h2><ul>${src.notTested.map((n) => `<li>${inline(n)}</li>`).join("")}</ul>`);
H(`<h2>Method</h2><ul>${method.map((b) => `<li>${inline(b)}</li>`).join("")}</ul>`);
H(`<h2>Reproduce everything</h2><p>Every step, with the result to expect, is in <a href="https://github.com/1AlgoRythm/within-trigger-check/blob/main/REPRODUCE.md">REPRODUCE.md</a>.</p>`);
H(`<h2>Words used in this report</h2><ul>${src.glossary.map((g) => `<li><strong>${esc(g.term)}.</strong> ${inline(g.means)}</li>`).join("")}</ul>`);
fs.writeFileSync(path.join(root, "docs/findings.html"), page(src.title, h.join("\n")));

// ---- the summary block in README.md, between its two markers, so the README cannot drift from the results
const readmePath = path.join(root, "README.md"); let readme = fs.readFileSync(readmePath, "utf8");
const a = "<!-- summary:start -->", b = "<!-- summary:end -->";
if (!readme.includes(a) || !readme.includes(b)) fail("README.md has no summary markers");
const block = `${a}\n\n**${V.count} findings on \`@getwithin/sdk\` ${V.version}: ${V.high} High, ${V.medium} Medium, ${V.low} Low.** ${V.n} checks on the stock package (${V.tally}) and ${V.nNew} for the newer parts (${V.newTally}), run ${V.ranAt} on the file npm serves.\n\n${founder.map((x) => `- ${x}`).join("\n")}\n\n| ID | Severity | What | Prototype fix |\n|---|---|---|---|\n${glance.map((f) => `| [${f.id}](FINDINGS.md#${f.id.toLowerCase()}) | ${f.severity} | ${f.title} | ${f.prototype && !/not offered/.test(patchLine(f)) ? f.prototype : "none"} |`).join("\n")}\n\n${b}`;
readme = readme.slice(0, readme.indexOf(a)) + block + readme.slice(readme.indexOf(b) + b.length);
fs.writeFileSync(readmePath, readme);
console.log(`built FINDINGS.md and docs/findings.html: ${V.count} findings (${V.high}/${V.medium}/${V.low}), ${V.n}+${V.nNew} checks`);

// ---- guard: every "`symbol`, ... line N" a finding cites must point at a line of the 0.4.0 file that contains that symbol
{
  const files = { "index.js": fs.readFileSync(path.join(here, "sdk-0.4.0/dist/index.js"), "utf8").split("\n"), "doctor.js": fs.readFileSync(path.join(here, "sdk-0.4.0/dist/doctor.js"), "utf8").split("\n") };
  const bad = []; let total = 0;
  for (const f of F) for (const w of [...f.where, f.plain]) {
    const file = /doctor\.js/.test(w) ? "doctor.js" : "index.js";
    let checked = 0;
    for (const m of w.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`(?:[^`]|`dist\/(?:index|doctor)\.js`){0,60}?\blines? (\d{3,5})/g)) { checked++; total++;
      const [, sym, n] = m; const line = files[file][Number(n) - 1] ?? "";
      const L = files[file], k = Number(n);
      // accepted when the line names the symbol, or lies inside the top-level function (or tool registration) that the symbol names
      const defRe = new RegExp(`^(async )?function \\w*${sym}\\(`, "i");
      let def = -1; L.forEach((x, i) => { if (i < k - 1 && (defRe.test(x) || x.includes(`"${sym}"`))) def = i; });
      let end = def; if (def >= 0) { end = L.findIndex((x, i) => i > def && /^(async )?function |^var /.test(x)); if (end < 0) end = L.length; }
      const inside = def >= 0 && k - 1 > def && k - 1 < end;
      if (!line.includes(sym) && !inside) bad.push(`${f.id}: ${file} line ${n} does not contain ${sym} and is not inside it`);
    }
  }
  if (bad.length) fail(`code locations do not match the 0.4.0 file:\n${bad.join("\n")}`);
  console.log(`code locations checked against the 0.4.0 file: ${total}`);
}
