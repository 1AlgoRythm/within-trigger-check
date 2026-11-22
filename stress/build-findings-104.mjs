// Builds the report for within-sdk 1.0.4 from stress/findings-1.0.4.json plus stress/results/sdk-1.0.4.json:
//   ../FINDINGS-1.0.4.md           (read on GitHub)
//   ../docs/findings-1.0.4.html    (the same content, linked from the map and from the main report)
// The shared loading, placeholder resolution and guards are in lib104.mjs. A stale number or status stops the build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load104 } from "./lib104.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const mainSrc = JSON.parse(fs.readFileSync(path.join(here, "findings.json"), "utf8"));
const D = load104(mainSrc);
if (!D) throw new Error("Missing stress/findings-1.0.4.json or stress/results/sdk-1.0.4.json");
const { src, V, R, resolve, status, newFindings } = D;
const title = "Within's package, version 1.0.4: what still fails, what is new, and what is gone";
const verdictLabel = { pass: "pass", fail: "FAIL", gap: "gap", info: "info", error: "ERROR" };
const sevOrder = { High: 0, Medium: 1, Low: 2 };
const all = mainSrc.findings;
const sevOf = (f) => status(f.id)?.sev ?? f.severity;
const testLine = (id) => R[id];

// ---- Markdown
const md = [], L = (s = "") => md.push(s);
L(`# ${title}`);
L();
L("This page is the update to [FINDINGS.md](FINDINGS.md) for the package Within points to as public. The earlier report tested `@getwithin/sdk` 0.3.0 and 0.4.0, which are different code. Every finding in that report now has an \"In 1.0.4\" line, and the new findings are below.");
L();
L(`## ${src.title}`);
L();
for (const p of src.summary) L(resolve(p)), L();
L("### What changed");
L();
for (const b of src.changed) L(`- ${resolve(b)}`);
L();
L("### Where the package is available");
L();
for (const b of src.available) L(`- ${resolve(b)}`);
L();
L("## At a glance");
L();
L(`${V.n} automated checks ran on \`within-sdk\` ${V.version} (${V.tally}), ${V.ranAt}.`);
L();
L("| ID | Severity in 1.0.4 | What | In 1.0.4 |");
L("|---|---|---|---|");
for (const f of [...all, ...newFindings].sort((a, b) => sevOrder[sevOf(a)] - sevOrder[sevOf(b)] || a.id.localeCompare(b.id)))
  L(`| ${f.id} | ${f.id in src.statuses ? sevOf(f) : f.severity} | ${f.title} | ${f.id in src.statuses ? status(f.id).short : "**new**"} |`);
L();
L(`## New in 1.0.4`);
L();
for (const f of newFindings) {
  L(`### ${f.id}`);
  L();
  L(`**${f.severity}: ${f.title}**`);
  L();
  L(`**For a founder.** ${f.founder}`);
  L();
  L(`**In plain words.** ${f.plain}`);
  L();
  L(`**Why it matters.** ${f.why}`);
  L();
  L("**What we measured.**");
  L();
  for (const id of f.tests) { const t = testLine(id); L(`- \`${t.id}\` (${verdictLabel[t.verdict]}): ${t.title} ${t.observed}`); }
  L();
  L("**Where in the code.**");
  L();
  for (const w of f.where) L(`- ${w}`);
  L();
  L("**How to fix it.**");
  L();
  for (const w of f.fix) L(`- ${w}`);
  L();
  L(`**Reproduce.** \`${f.repro}\``);
  L();
}
L("## Every earlier finding, on 1.0.4");
L();
L("Each line gives the status, the checks behind it, and the evidence. The full text of each finding, for 0.3.0 and 0.4.0, is in [FINDINGS.md](FINDINGS.md).");
L();
for (const f of all) {
  const s = status(f.id);
  L(`- **${f.id}** (${sevOf(f)}; ${s.short}): ${f.title}. ${s.text}`);
}
L();
L("## What we did not test");
L();
for (const n of src.notTested) L(`- ${resolve(n)}`);
L();
L("## Technical notes");
L();
for (const b of src.technical) L(`- ${resolve(b)}`);
L();
L("## Reproduce");
L();
L("```bash");
L("cd stress/v104");
L("npm install --ignore-scripts   # within-sdk 1.0.4 from npm, MCP SDK 1.32.2, Zod 3.25.76 and 4.6.7");
L("node run-all.mjs               # all checks, about 5 minutes, writes stress/results/sdk-1.0.4.json");
L("node run-all.mjs C8 Z3         # only these, merged with the saved output of the others");
L("cd .. && npm run build:findings   # rebuilds FINDINGS.md, FINDINGS-1.0.4.md and the two web pages");
L("```");
fs.writeFileSync(path.join(root, "FINDINGS-1.0.4.md"), md.join("\n"));

// ---- HTML
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
const h = [], H = (s) => h.push(s);
const mainHtml = fs.readFileSync(path.join(root, "docs/findings.html"), "utf8");
const style = mainHtml.match(/<style>[\s\S]*?<\/style>/)[0].replace("</style>", ".st.present{color:var(--red)}.st.notreproduced,.st.absent{color:var(--grn)}.st.nottested{color:var(--mute)}</style>");
H(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
${style}</head><body><div class="wrap">
<div class="top"><a href="index.html" target="_top">← Back to the interactive map</a> · <a href="findings.html">The report on 0.3.0 and 0.4.0</a> · <a href="https://github.com/1AlgoRythm/within-trigger-check">Source and tests on GitHub</a></div>
<h1>${esc(title)}</h1>
<p>This page is the update to <a href="findings.html">the main report</a> for the package Within points to as public. The earlier report tested <code>@getwithin/sdk</code> 0.3.0 and 0.4.0, which are different code. Every finding in that report now has an "In 1.0.4" line, and the new findings are below.</p>
<h2>${esc(src.title)}</h2>`);
for (const p of src.summary) H(`<p>${inline(resolve(p))}</p>`);
H(`<h3 style="margin-top:18px">What changed</h3><ul>${src.changed.map((b) => `<li>${inline(resolve(b))}</li>`).join("")}</ul>`);
H(`<h3 style="margin-top:18px">Where the package is available</h3><ul>${src.available.map((b) => `<li>${inline(resolve(b))}</li>`).join("")}</ul>`);
H(`<h2>At a glance</h2><p>${V.n} automated checks ran on <code>within-sdk</code> ${V.version} (${V.tally}), ${V.ranAt}.</p>`);
H(`<table class="sum"><tr><th>ID</th><th>Severity in 1.0.4</th><th>What</th><th>In 1.0.4</th></tr>`);
for (const f of [...all, ...newFindings].sort((a, b) => sevOrder[sevOf(a)] - sevOrder[sevOf(b)] || a.id.localeCompare(b.id))) {
  const old = f.id in src.statuses, sev = old ? sevOf(f) : f.severity;
  H(`<tr><td><a href="#${f.id.toLowerCase()}${old ? "-104" : ""}">${f.id}</a></td><td><span class="badge ${sev}">${sev}</span></td><td>${inline(f.title)}</td><td>${old ? `<span class="st ${status(f.id).key}">${status(f.id).short}</span>` : "<strong>new</strong>"}</td></tr>`);
}
H(`</table><h2>New in 1.0.4</h2>`);
for (const f of newFindings) {
  H(`<div class="card ${f.severity}" id="${f.id.toLowerCase()}"><h3><span class="badge ${f.severity}">${f.severity}</span>${f.id} · ${inline(f.title)}</h3>`);
  H(`<div class="k">For a founder</div><p>${esc(f.founder)}</p><div class="k">In plain words</div><p>${inline(f.plain)}</p><div class="k">Why it matters</div><p>${inline(f.why)}</p>`);
  H(`<div class="k">What we measured</div><ul>${f.tests.map((id) => { const t = testLine(id); return `<li><code>${t.id}</code> <span class="v ${t.verdict}">${verdictLabel[t.verdict]}</span> ${inline(t.title)} ${inline(t.observed)}</li>`; }).join("")}</ul>`);
  H(`<div class="k">Where in the code</div><ul>${f.where.map((w) => `<li>${inline(w)}</li>`).join("")}</ul><div class="k">How to fix it</div><ul>${f.fix.map((w) => `<li>${inline(w)}</li>`).join("")}</ul>`);
  H(`<p class="mute"><strong>Reproduce:</strong> <code>${esc(f.repro)}</code></p></div>`);
}
H(`<h2>Every earlier finding, on 1.0.4</h2><p>Each line gives the status, the checks behind it, and the evidence. The full text of each finding, for 0.3.0 and 0.4.0, is in <a href="findings.html">the main report</a>.</p><ul>`);
for (const f of all) { const s = status(f.id); H(`<li id="${f.id.toLowerCase()}-104"><strong>${f.id}</strong> (${sevOf(f)}; <span class="st ${s.key}">${s.short}</span>): ${inline(f.title)}. ${inline(s.text)}</li>`); }
H(`</ul><h2>What we did not test</h2><ul>${src.notTested.map((n) => `<li>${inline(resolve(n))}</li>`).join("")}</ul>`);
H(`<h2>Technical notes</h2><ul>${src.technical.map((b) => `<li>${inline(resolve(b))}</li>`).join("")}</ul>`);
H(`<h2>Reproduce</h2><pre>cd stress/v104
npm install --ignore-scripts   # within-sdk 1.0.4 from npm, MCP SDK 1.32.2, Zod 3.25.76 and 4.6.7
node run-all.mjs               # all checks, about 5 minutes, writes stress/results/sdk-1.0.4.json
node run-all.mjs C8 Z3         # only these, merged with the saved output of the others
cd .. &amp;&amp; npm run build:findings   # rebuilds FINDINGS.md, FINDINGS-1.0.4.md and the two web pages</pre>`);
H(`</div></body></html>`);
fs.writeFileSync(path.join(root, "docs/findings-1.0.4.html"), h.join("\n"));
console.log(`built FINDINGS-1.0.4.md and docs/findings-1.0.4.html: ${all.length} earlier findings, ${newFindings.length} new, ${V.n} checks (${V.tally})`);
