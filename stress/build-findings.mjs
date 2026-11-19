// Builds the two readable reports from ONE source, stress/findings.json, plus the saved test results:
//   ../FINDINGS.md        (read on GitHub)
//   ../docs/findings.html (the same content, linked from the interactive map)
// Every number in the prose is a {{TEST:path}} placeholder resolved from results/*.json, and the build fails if
// one cannot be resolved. That is how the report stays equal to what was measured.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(here, p), "utf8"));
const src = read("findings.json");
const stock = read("results/latest.json");
const patched = read("results/patched.json");
const byId = (r) => Object.fromEntries(r.results.map((x) => [x.id, x]));
const S = byId(stock), P = byId(patched);

// model-level results
const modelFile = (f) => (fs.existsSync(path.join(here, "results", f)) ? read("results/" + f) : null);
const hTS = modelFile("model-haiku-T-S.json"), son = modelFile("model-sonnet.json");
const xStock = modelFile("model-haiku-X-stock.json"), xPatched = modelFile("model-haiku-X-patched.json");
const rows = (m) => Object.fromEntries((m?.results ?? []).map((r) => [r.id, r]));
const X = { stock: rows(xStock), patched: rows(xPatched) };
const consentRows = [
  ...(hTS?.results ?? []).filter((r) => r.kind === "consent").map((r) => ({ ...r, who: "Haiku 5.5" })),
  ...(son?.results ?? []).filter((r) => r.kind === "consent").map((r) => ({ ...r, who: "Sonnet 5.5" })),
];
const triggerRows = [
  ...(hTS?.results ?? []).filter((r) => r.kind === "trigger").map((r) => ({ ...r, who: "Haiku 5.5" })),
  ...(son?.results ?? []).filter((r) => r.kind === "trigger").map((r) => ({ ...r, who: "Sonnet 5.5" })),
];
const sum = (a, k) => a.reduce((n, r) => n + (r[k] ?? 0), 0);
const M = {
  consentRuns: sum(consentRows, "completed"), consentConfirm: sum(consentRows, "calledConfirmAssistance"), consentAccepted: sum(consentRows, "offerAcceptedAtStandIn"),
  triggerRuns: sum(triggerRows, "completed"), triggerCalled: sum(triggerRows, "calledGetVendorAnswer"),
};

// ---- placeholders
function dig(obj, p) {
  return p.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function resolve(text) {
  return text.replace(/\{\{([A-Za-z0-9]+):([^}]+)\}\}/g, (m, id, p) => {
    const v = id === "X" ? dig(X, p) : id === "M" ? dig(M, p) : dig(S[id], p);
    if (v === undefined || v === null) throw new Error(`Unresolved placeholder ${m}`);
    return String(v);
  });
}

const sevOrder = { High: 0, Medium: 1, Low: 2 };
const verdictLabel = { pass: "pass", fail: "FAIL", gap: "gap", info: "info", error: "ERROR" };
const testLine = (id) => {
  const s = S[id], p = P[id];
  if (!s) throw new Error(`Unknown test ${id}`);
  return { id, title: s.title, verdict: s.verdict, patched: p?.verdict, observed: s.observed, basis: s.basis };
};

const groups = [...new Set(src.findings.map((f) => f.group))];
const count = (sev) => src.findings.filter((f) => f.severity === sev).length;
const tally = (r) => r.tally;
const nProto = new Set(src.findings.map((f) => f.prototype).filter(Boolean)).size;
const NCHECKS = Object.keys(S).length;
const when = (iso) => iso.replace("T", " ").slice(0, 16) + " UTC";

const poisoned = consentRows.filter((r) => ["S2", "S4"].includes(r.id));
const poisonedRuns = sum(poisoned, "completed");
const noticed = poisoned.flatMap((r) => r.replies).filter((x) => /embedded instruction|ignored|injected/i.test(x)).length;
const modelParagraph = (which = "both") => {
  const lines = [];
  if (which !== "consent") lines.push(`**Real Claude, same stand-in server.** ${M.triggerRuns} runs across ${triggerRows.length} scenario/model pairs asked buying questions in other languages and indirect wordings (Spanish pricing, German cancellation, a rate-limit question, a relayed question from a CFO, a renewal). Claude called Within in ${M.triggerCalled} of ${M.triggerRuns}.`);
  if (which !== "trigger") lines.push(`**Consent.** ${M.consentRuns} runs had a rep's offer pending. ${poisonedRuns} of them put an instruction aimed at the AI inside a company record (a note saying to connect the user without asking), and some had the user say no in advance. Claude called \`confirm_assistance\` in ${M.consentConfirm} of ${M.consentRuns} runs, and the accept reached the stand-in in ${M.consentAccepted}. In at least ${noticed} of the ${poisonedRuns} poisoned runs the reply (cut to 280 characters here) said the model had seen the embedded instruction and ignored it. These are small samples (3 runs per scenario per model) on Claude Code, not claude.ai or ChatGPT.`);
  return lines;
};

// ---- Markdown
const md = [];
const L = (s = "") => md.push(s);
L(`# ${src.title}`);
L();
for (const p of src.intro) L(resolve(p)), L();
L(`Tested ${when(stock.meta.ranAt)} on \`@getwithin/sdk\` ${stock.meta.sdk.version} (file fingerprint \`${stock.meta.sdk.distSha256.slice(0, 12)}\`), Node ${stock.meta.node}, MCP SDK ${stock.meta.mcpSdk}. Line numbers below refer to that package's \`dist/index.js\`, because Within's source repository is not public (the address in the package's package.json returns 404).`);
L();
L("## At a glance");
L();
L(`**${src.findings.length} findings: ${count("High")} High, ${count("Medium")} Medium, ${count("Low")} Low.** ${Object.keys(S).length} automated checks ran against the published package: ${tally(stock).pass} pass, ${tally(stock).fail} fail, ${tally(stock).gap} gap (documented or undocumented behaviour worth a decision), ${tally(stock).info} information only. A patched copy with ${nProto} small prototype fixes turns ${Object.keys(S).filter((id) => ["fail", "gap"].includes(S[id].verdict) && P[id]?.verdict === "pass").length} of those fails and gaps into passes.`);
L();
L("| ID | Severity | What | Prototype fix |");
L("|---|---|---|---|");
for (const f of [...src.findings].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.id.localeCompare(b.id)))
  L(`| [${f.id}](#${f.id.toLowerCase()}) | ${f.severity} | ${f.title} | ${f.prototype ?? "none"} |`);
L();
L("**If you only fix six things:** W-02 (an outage must not change or break the vendor's own answers), W-09, W-10 and W-11 (what leaves the vendor's server, and what the docs say about it), W-01 (the install steps must work on a new project), and W-04 (never swallow a vendor's own `context` input).");
L();
L("### What the severity words mean");
L();
for (const s of src.severity) L(`- **${s.name}.** ${s.meaning}`);
L();
L("### What the verdicts mean");
L();
L("- **pass.** The package did what the docs, or a reasonable vendor, would expect.");
L("- **FAIL.** The package contradicts its own docs, or breaks something a vendor would reasonably expect.");
L("- **gap.** Behaviour that is documented or deliberate but leaves a risk, or behaviour the docs do not mention. A decision for Within's team, not necessarily a bug.");
L("- **info.** A measurement, with no judgement attached.");
L();
for (const g of groups) {
  L(`## ${g}`);
  L();
  for (const f of src.findings.filter((x) => x.group === g)) {
    L(`### ${f.id}`);
    L();
    L(`**${f.severity}: ${f.title}**`);
    L();
    L(`**In plain words.** ${resolve(f.plain)}`);
    L();
    L(`**Why it matters.** ${resolve(f.why)}`);
    L();
    if (f.tests.length) {
      L("**What we measured.**");
      L();
      for (const id of f.tests) { const t = testLine(id); L(`- \`${t.id}\` (${verdictLabel[t.verdict]}${t.patched && t.patched !== t.verdict ? `, ${verdictLabel[t.patched]} on the patched copy` : ""}): ${t.title} ${t.observed}`); }
      L();
    }
    if (f.models) { for (const l of modelParagraph("consent")) L(l), L(); }
    L("**Where in the code.**");
    L();
    for (const w of f.where) L(`- ${w}`);
    L();
    L("**How to fix it.**");
    L();
    for (const w of f.fix) L(`- ${w}`);
    L();
    if (f.prototype) L(`**Prototype fix.** \`${f.prototype}\` in \`stress/patches/apply.mjs\`. Run \`npm run test:patched\` to see the checks above change.`), L();
    if (f.extra) L(`**Note.** ${f.extra}`), L();
    L(`**Reproduce.** \`cd stress && npm install && ${f.repro.startsWith("npm") ? f.repro : "node run.mjs " + f.repro.replace(/^node run\.mjs /, "")}\``);
    L();
  }
}
L("## What held up");
L();
for (const h of src.heldUp) L(`- ${h.text} (\`${h.test}\`)`);
for (const l of modelParagraph()) L(`- ${l}`);
L();
L("## What we did not test");
L();
for (const n of src.notTested) L(`- ${n}`);
L();
L("## Method");
L();
L("- **Stand-in server.** `stress/lib/harness.mjs` starts a small local web server that plays Within's API. It can answer slowly, never answer, send broken replies, or offer a rep's chat. Every request goes to `127.0.0.1`.");
L("- **Real package, real MCP.** The tests install the stock `@getwithin/sdk` from npm, build an MCP server around it with the official MCP SDK, and call its tools with an MCP client.");
L("- **Checks, not opinions.** Each check says what it expected and why (a quote from Within's docs, or a stated vendor expectation), and what happened. Results are saved in `stress/results/`.");
L("- **Prototype fixes.** `stress/patches/apply.mjs` builds a patched copy of the package and re-runs the same checks, so each proposed fix is shown to work. They are proposals for Within's engineers, written against the published file.");
L("- **Model runs.** `stress/model/run-model.mjs` runs real Claude (headless Claude Code) against the same demo server, three runs per scenario unless noted.");
L();
L("## Reproduce everything");
L();
L("```bash");
L("cd stress");
L("npm install");
L(`npm test                 # ${NCHECKS} checks against the stock package, about 70 seconds, writes results/latest.json`);
L("npm run test:patched     # builds the patched copy and runs the same checks");
L("npm run test:model       # real Claude (needs Claude Code signed in), writes results/model-*.json");
L("npm run build:findings   # rebuilds this file and docs/findings.html from the saved results");
L("```");
L();
fs.writeFileSync(path.join(root, "FINDINGS.md"), md.join("\n"));

// ---- HTML
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
const h = [];
const H = (s) => h.push(s);
H(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(src.title)}</title>
<style>
:root{--ink:#1f2328;--mute:#59636e;--line:#d8dee4;--bg:#fbfaf6;--red:#d1242f;--org:#d97706;--blu:#2563eb;--grn:#059669}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
.wrap{max-width:860px;margin:0 auto;padding:24px 20px 80px}
a{color:#0969da}h1{font-size:28px;line-height:1.25;margin:8px 0 16px}h2{margin:40px 0 8px;font-size:22px;border-bottom:1px solid var(--line);padding-bottom:6px}
h3{margin:0;font-size:18px}code{background:#eef0f3;padding:1px 5px;border-radius:4px;font-size:.9em}
.top{font-size:14px;margin-bottom:6px}.mute{color:var(--mute)}
table{border-collapse:collapse;width:100%;font-size:14px;margin:12px 0}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f3f5}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:18px 0;border-left-width:6px}
.card.High{border-left-color:var(--red)}.card.Medium{border-left-color:var(--org)}.card.Low{border-left-color:var(--blu)}
.badge{display:inline-block;font-size:12px;font-weight:700;padding:1px 8px;border-radius:999px;color:#fff;margin-right:8px;vertical-align:middle}
.badge.High{background:var(--red)}.badge.Medium{background:var(--org)}.badge.Low{background:var(--blu)}
.k{font-weight:700;margin:12px 0 2px}ul{margin:4px 0 4px 20px;padding:0}li{margin:3px 0}
.v{font-size:12px;font-weight:700;border-radius:4px;padding:0 5px;color:#fff}.v.pass{background:var(--grn)}.v.fail{background:var(--red)}.v.gap{background:var(--org)}.v.info{background:#6b7280}.v.error{background:#111}
pre{background:#161b22;color:#e6edf3;padding:12px;border-radius:8px;overflow:auto;font-size:13px}
.sum td:first-child{white-space:nowrap}
</style></head><body><div class="wrap">
<div class="top"><a href="index.html">← Back to the interactive map</a> · <a href="https://github.com/1AlgoRythm/within-trigger-check">Source and tests on GitHub</a></div>
<h1>${esc(src.title)}</h1>`);
for (const p of src.intro) H(`<p>${inline(resolve(p))}</p>`);
H(`<p class="mute">Tested ${when(stock.meta.ranAt)} on <code>@getwithin/sdk</code> ${stock.meta.sdk.version} (file fingerprint <code>${stock.meta.sdk.distSha256.slice(0, 12)}</code>), Node ${stock.meta.node}, MCP SDK ${stock.meta.mcpSdk}. Line numbers refer to that package's <code>dist/index.js</code>, because Within's source repository is not public (the address in the package's package.json returns 404).</p>`);
H(`<h2>At a glance</h2><p><strong>${src.findings.length} findings: ${count("High")} High, ${count("Medium")} Medium, ${count("Low")} Low.</strong> ${Object.keys(S).length} automated checks ran against the published package: ${tally(stock).pass} pass, ${tally(stock).fail} fail, ${tally(stock).gap} gap, ${tally(stock).info} information only. A patched copy with ${nProto} small prototype fixes turns ${Object.keys(S).filter((id) => ["fail", "gap"].includes(S[id].verdict) && P[id]?.verdict === "pass").length} of those fails and gaps into passes.</p>`);
H(`<table class="sum"><tr><th>ID</th><th>Severity</th><th>What</th><th>Prototype fix</th></tr>`);
for (const f of [...src.findings].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.id.localeCompare(b.id)))
  H(`<tr><td><a href="#${f.id.toLowerCase()}">${f.id}</a></td><td><span class="badge ${f.severity}">${f.severity}</span></td><td>${inline(f.title)}</td><td>${f.prototype ?? "none"}</td></tr>`);
H(`</table><p><strong>If you only fix six things:</strong> W-02 (an outage must not change or break the vendor's own answers), W-09, W-10 and W-11 (what leaves the vendor's server, and what the docs say about it), W-01 (the install steps must work on a new project), and W-04 (never swallow a vendor's own <code>context</code> input).</p>`);
H(`<h3 style="margin-top:20px">What the words mean</h3><ul>`);
for (const s of src.severity) H(`<li><strong>${s.name}.</strong> ${inline(s.meaning)}</li>`);
H(`<li><span class="v pass">pass</span> did what the docs, or a reasonable vendor, would expect.</li><li><span class="v fail">FAIL</span> contradicts the package's own docs, or breaks something a vendor would reasonably expect.</li><li><span class="v gap">gap</span> documented or deliberate behaviour that leaves a risk, or behaviour the docs do not mention. A decision for Within's team.</li><li><span class="v info">info</span> a measurement with no judgement attached.</li></ul>`);
for (const g of groups) {
  H(`<h2>${esc(g)}</h2>`);
  for (const f of src.findings.filter((x) => x.group === g)) {
    H(`<div class="card ${f.severity}" id="${f.id.toLowerCase()}"><h3><span class="badge ${f.severity}">${f.severity}</span>${f.id} · ${inline(f.title)}</h3>`);
    H(`<div class="k">In plain words</div><p>${inline(resolve(f.plain))}</p><div class="k">Why it matters</div><p>${inline(resolve(f.why))}</p>`);
    if (f.tests.length) {
      H(`<div class="k">What we measured</div><ul>`);
      for (const id of f.tests) { const t = testLine(id); H(`<li><code>${t.id}</code> <span class="v ${t.verdict}">${verdictLabel[t.verdict]}</span>${t.patched && t.patched !== t.verdict ? ` → <span class="v ${t.patched}">${verdictLabel[t.patched]}</span> patched` : ""} ${inline(t.title)} ${inline(t.observed)}</li>`); }
      H(`</ul>`);
    }
    if (f.models) { H(`<div class="k">Real Claude</div>`); for (const l of modelParagraph("consent")) H(`<p>${inline(l)}</p>`); }
    H(`<div class="k">Where in the code</div><ul>${f.where.map((w) => `<li>${inline(w)}</li>`).join("")}</ul>`);
    H(`<div class="k">How to fix it</div><ul>${f.fix.map((w) => `<li>${inline(w)}</li>`).join("")}</ul>`);
    if (f.prototype) H(`<p><strong>Prototype fix:</strong> <code>${f.prototype}</code> in <code>stress/patches/apply.mjs</code>. Run <code>npm run test:patched</code> to see the checks above change.</p>`);
    if (f.extra) H(`<p><strong>Note.</strong> ${inline(f.extra)}</p>`);
    H(`<p class="mute"><strong>Reproduce:</strong> <code>cd stress &amp;&amp; npm install &amp;&amp; ${esc(f.repro.startsWith("npm") ? f.repro : "node run.mjs " + f.repro.replace(/^node run\.mjs /, ""))}</code></p></div>`);
  }
}
H(`<h2>What held up</h2><ul>${src.heldUp.map((x) => `<li>${inline(x.text)} (<code>${x.test}</code>)</li>`).join("")}${modelParagraph().map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`);
H(`<h2>What we did not test</h2><ul>${src.notTested.map((n) => `<li>${inline(n)}</li>`).join("")}</ul>`);
H(`<h2>Reproduce everything</h2><pre>cd stress
npm install
npm test                 # ${Object.keys(S).length} checks against the stock package, about 70 seconds
npm run test:patched     # builds the patched copy and runs the same checks
npm run test:model       # real Claude (needs Claude Code signed in)
npm run build:findings   # rebuilds this page and FINDINGS.md from the saved results</pre>`);
H(`</div></body></html>`);
fs.writeFileSync(path.join(root, "docs/findings.html"), h.join("\n"));
console.log(`Wrote FINDINGS.md (${md.length} lines) and docs/findings.html`);
