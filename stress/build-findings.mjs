// Builds the two readable reports from ONE source, stress/findings.json, plus the saved test results:
//   ../FINDINGS.md        (read on GitHub)
//   ../docs/findings.html (the same content, linked from the interactive map)
// Every number in the prose is a {{TEST:path}} placeholder resolved from results/*.json, and the build fails if
// one cannot be resolved. That is how the report stays equal to what was measured.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load104 } from "./lib104.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(here, p), "utf8"));
const src = read("findings.json");
// The 1.0.4 update (optional): a status line on every finding and a pointer near the top. See lib104.mjs and build-findings-104.mjs.
const D104 = load104(src);
const s104 = (f) => D104?.status(f.id) ?? null;
const stock = read("results/latest.json");
const patched = read("results/patched.json");
// The hand-drawn sketch for a finding, if there is one: [file in docs/diagrams, link text]. The map (docs/index.html) opens the same files.
const SKETCH = {
  "W-01": ["07-zod-bug.svg", "The Zod crash"], "W-02": ["12-outage-alters-data.svg", "An outage changes the vendor's answer"],
  "W-03": ["11-every-call-waits.svg", "Every call waits"], "W-04": ["13-context-input-lost.svg", "The vendor's own context input is lost"],
  "W-09": ["14-unwrapped-tools-report.svg", "An unwrapped tool still reports"], "W-10": ["08-pii-gap.svg", "The goal text gap"],
  "W-15": ["10-instructions-deleted.svg", "Instructions replaced"], "W-20": ["06-false-alarm-and-fixes.svg", "The false alarm and the fixes"],
  "W-21": ["16-login-token-sent.svg", "The login token is sent"], "W-22": ["17-report-void-default.svg", "report_void sends the customer's words"],
  "W-23": ["18-user-agent-fallback.svg", "The app name fallback"], "W-24": ["19-hub-text-inserted.svg", "Within's text inside the vendor's result"],
  "W-25": ["20-doctor-misses-w04.svg", "The doctor command misses W-04"], "W-26": ["21-hub-card-app-only.svg", "hub_card is app-only by label"],
};
const byId = (r) => Object.fromEntries(r.results.map((x) => [x.id, x]));
const S = byId(stock), P = byId(patched);

// ---- version 0.4.0 (optional: only when results/sdk-0.4.0.json and results/new-in-040.json exist). Every figure and every
// per-finding status is computed from the saved results, never typed in. A finding is "fixed" when every check that was a
// fail or a gap on 0.3.0 passes on 0.4.0, "unchanged" when no check changed verdict, "not re-run" when no automated check
// covers it, and "new" when it was found by reading the 0.4.0 code (its checks are in results/new-in-040.json).
const exists = (f) => fs.existsSync(path.join(here, "results", f));
const v040 = exists("sdk-0.4.0.json") ? read("results/sdk-0.4.0.json") : null;
const newRes = exists("new-in-040.json") ? read("results/new-in-040.json") : null;
const codeLoc = exists("code-locations-0.4.0.json") ? read("results/code-locations-0.4.0.json") : null;
const patched040 = exists("patched-0.4.0.json") ? read("results/patched-0.4.0.json") : null;
const modelOf = (f) => (exists(f) ? read("results/" + f) : null);
const mTS4 = modelOf("model-haiku-T-S-040.json"), mXS4 = modelOf("model-haiku-X-040-stock.json"), mXP4 = modelOf("model-haiku-X-040-patched.json"), mV4 = modelOf("model-haiku-V-040.json"), app4 = modelOf("app-prompts-040.json");
const mSTS = modelOf("model-sonnet-T-S-040.json"), mSXS = modelOf("model-sonnet-X-040-stock.json"), mSV = modelOf("model-sonnet-V-040.json"), mSX1n = modelOf("model-sonnet-X1-040-a.json"), mSX1o = modelOf("model-sonnet-X1-030-a.json"), mHH = modelOf("model-haiku-H-040.json"), mHS = modelOf("model-sonnet-H-040.json");
const rowsOf = (m) => Object.fromEntries((m?.results ?? []).map((r) => [r.id, r]));
// pooled counts for one scenario over the three same-day batches a, b, c (e.g. tag "X1-040" reads model-haiku-X1-040-a.json ...)
const pooled = (tag, id) => {
  let c = 0, n = 0;
  for (const b of ["a", "b", "c"]) {
    const f = `model-haiku-${tag}-${b}.json`;
    if (!exists(f)) return null;
    const r = rowsOf(read("results/" + f))[id];
    c += r.calledGetVendorAnswer; n += r.completed;
  }
  return { c, n };
};
// two-sided Fisher exact test for a 2x2 table (a of a+b versus c of c+d)
const fisherP = (a, b, c, d) => {
  const comb = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
  const n = a + b + c + d, r1 = a + b, c1 = a + c, pr = (x) => (comb(r1, x) * comb(n - r1, c1 - x)) / comb(n, c1), p0 = pr(a);
  let t = 0;
  for (let x = Math.max(0, c1 - (n - r1)); x <= Math.min(r1, c1); x++) if (pr(x) <= p0 * (1 + 1e-9)) t += pr(x);
  return t;
};
const V = v040 ? byId(v040) : null;
const P4 = patched040 ? byId(patched040) : null;
const NEWR = newRes ? byId(newRes) : {};
const CODE = codeLoc ? Object.fromEntries(codeLoc.findings.map((r) => [r.id, r.units])) : {};
const FINDINGS = V && newRes && P4 && mTS4 && mXS4 && mXP4 && mV4 && app4 && mSTS && mSXS && mSV && mSX1n && mSX1o && mHH && mHS && pooled("X1-040", "X1") && pooled("X1-030", "X1") && pooled("X1-040P", "X1") ? src.findings : src.findings.filter((f) => !f.since);
const oldFindings = FINDINGS.filter((f) => !f.since), newFindings = FINDINGS.filter((f) => f.since);
const when2 = (iso) => iso.replace("T", " ").slice(0, 16) + " UTC";
const status040 = (f) => {
  if (!V) return null;
  if (f.since) return { key: "new", short: "new", label: `New in ${f.since}: found by reading the ${f.since} code. It is not in 0.3.0.` };
  if (f.modelTest) {
    const a = pooled("X1-040", f.modelTest), b = pooled("X1-030", f.modelTest), pv = fisherP(a.c, a.n - a.c, b.c, b.n - b.c);
    const nums = `${a.c} of ${a.n} runs on 0.4.0 against ${b.c} of ${b.n} on 0.3.0 the same day`;
    if (a.c === 0) return { key: "notreproduced", short: "not reproduced", label: `Not reproduced in 0.4.0: real Claude (Haiku) sent this to Within in ${nums}. Small samples, so not proof it is gone.` };
    if (a.c < b.c && pv < 0.05) return { key: "reduced", short: "reduced", label: `Still present in 0.4.0, but less often: real Claude (Haiku) sent this to Within in ${nums} (Fisher exact p = ${pv.toFixed(3)}).` };
    return { key: "unchanged", short: "unchanged", label: `Unchanged in 0.4.0: real Claude (Haiku) sent this to Within in ${nums}.` };
  }
  const pairs = f.tests.filter((id) => S[id] && V[id]).map((id) => [S[id].verdict, V[id].verdict]);
  if (!pairs.length) return { key: "notrerun", short: "not re-run", label: "Not re-run on 0.4.0: no automated check covers it." };
  if (pairs.every(([a, b]) => a === b)) return { key: "unchanged", short: "unchanged", label: "Unchanged in 0.4.0: its checks give the same verdicts." };
  const wasBad = pairs.filter(([a]) => a === "fail" || a === "gap");
  if (wasBad.length && wasBad.every(([, b]) => b === "pass")) return { key: "fixed", short: "fixed", label: "Fixed in 0.4.0: its checks now pass." };
  return { key: "changed", short: "partly changed", label: "Partly changed in 0.4.0: some of its checks changed verdict." };
};
const U = (() => {
  if (!FINDINGS.some((f) => f.since)) return null;
  const ids = Object.keys(S);
  const ofKey = (k, sev) => oldFindings.filter((f) => status040(f).key === k && (!sev || f.severity === sev)).map((f) => f.id);
  // every finding must have been checked on 0.4.0: by automated checks, by real-Claude runs, or (new ones) by their own checks
  const unchecked = FINDINGS.filter((f) => (f.since ? !(f.tests.length && f.tests.every((id) => NEWR[id])) : f.modelTest ? !pooled("X1-040", f.modelTest) : !(f.tests.length && f.tests.every((id) => V[id])))).map((f) => f.id);
  if (unchecked.length) throw new Error(`Not checked on 0.4.0: ${unchecked.join(", ")}. Do not publish until they are.`);
  for (const f of oldFindings) if (!["fixed", "unchanged", "reduced", "notreproduced"].includes(status040(f).key)) throw new Error(`${f.id}: unexpected 0.4.0 status "${status040(f).key}". Rewrite update040 by hand.`);
  const newHigh = newFindings.filter((f) => f.severity === "High").map((f) => f.id).join(", ");
  if (newHigh !== src.update040.expectNewHigh) throw new Error(`The High findings among the new ones are now "${newHigh}", but update040.expectNewHigh is "${src.update040.expectNewHigh}": the prose is stale.`);
  const list = (a) => (a.length ? a.join(", ") : "none");
  const chars = (r) => Number(r.D5?.observed?.match(/\d+/)?.[0]);
  const fmt = (n) => n.toLocaleString("en-US");
  const units = new Map(Object.values(CODE).flat().map((u) => [u.name, u.verdict]));
  const flips = (a, b) => Object.keys(a).filter((id) => ["fail", "gap"].includes(a[id].verdict) && b[id]?.verdict === "pass");
  const flipNew = flips(V, P4), flipOld = flips(S, P);
  if (P4.B4?.verdict !== "fail") throw new Error("B4 no longer fails on the patched 0.4.0 copy: rewrite the update040 text about patch P3.");
  if (ofKey("changed").length) throw new Error("A finding changed only partly in 0.4.0: rewrite update040 by hand, then adjust this guard.");
  const out = {
    version: v040.meta.sdk.version, n: ids.length, nNew: Object.keys(NEWR).length, ranAt: when2(v040.meta.ranAt),
    oldCount: oldFindings.length, fixedCount: ofKey("fixed").length, fixedList: list(ofKey("fixed")), unchangedCount: ofKey("unchanged").length, reducedCount: ofKey("reduced").length, reducedList: list(ofKey("reduced")), notReproducedCount: ofKey("notreproduced").length, totalFindings: FINDINGS.length, byChecks: oldFindings.filter((f) => f.tests.length).length, byModel: oldFindings.filter((f) => f.modelTest).length,
    newCount: newFindings.length, newList: list(newFindings.map((f) => f.id)), newHighCount: newFindings.filter((f) => f.severity === "High").length,
    d5Old: fmt(chars(S)), d5New: fmt(chars(V)), d5Diff: fmt(chars(V) - chars(S)),
    unitsTotal: units.size, unitsIdentical: [...units.values()].filter((v) => v === "identical").length, unitsChanged: [...units.values()].filter((v) => v !== "identical").length,
    ...(() => {
      const tr = rowsOf(mTS4), xs = rowsOf(mXS4), xp = rowsOf(mXP4), vr = rowsOf(mV4);
      const sumKind = (kind, k) => Object.values(tr).filter((r) => r.kind === kind).reduce((n, r) => n + (r[k] ?? 0), 0);
      const first = [...Object.values(tr), ...Object.values(xs), ...Object.values(xp)];
      const voidRuns = first.reduce((n, r) => n + r.toolSequences.filter((q) => q.includes("report_void")).length, 0);
      const totalRuns = first.reduce((n, r) => n + r.completed, 0);
      const voidIn = Object.values(vr).flatMap((r) => r.voidInputs ?? []).map((x) => String(x.asked ?? "").toLowerCase());
      const A = app4.rows, rec = A.filter((r) => r.expect === "within"), fa = A.filter((r) => r.expect === "no"), tot = (xs_, k) => xs_.reduce((n, r) => n + r[k], 0);
      const c4 = pooled("X1-040", "X1"), c3 = pooled("X1-030", "X1"), cp = pooled("X1-040P", "X1"), x2p = pooled("X1-040P", "X2");
      return {
        trig4Runs: sumKind("trigger", "completed"), trig4Called: sumKind("trigger", "calledGetVendorAnswer"),
        cons4Runs: sumKind("consent", "completed"), cons4Confirm: sumKind("consent", "calledConfirmAssistance"), cons4Accepted: sumKind("consent", "offerAcceptedAtStandIn"),
        voidRuns, totalRuns,
        vRuns: Object.values(vr).reduce((n, r) => n + r.completed, 0), vVoidCalls: voidIn.length,
        vNames: voidIn.filter((a) => a.includes("priya") || a.includes("raman")).length, vPhones: voidIn.filter((a) => a.includes("555")).length, vEmails: voidIn.filter((a) => a.includes("@")).length,
        appRuns: tot(A, "of"), recallCalled: tot(rec, "called"), recallOf: tot(rec, "of"), falseCalled: tot(fa, "called"), falseOf: tot(fa, "of"), appErrors: tot(A, "errors"), appPrompts: A.length,
        x1New: `${c4.c} of ${c4.n}`, x1Ctl: `${c3.c} of ${c3.n}`, x1P: fisherP(c4.c, c4.n - c4.c, c3.c, c3.n - c3.c).toFixed(3), x1Patched: `${cp.c} of ${cp.n}`, x1PatchedP: fisherP(cp.c, cp.n - cp.c, c4.c, c4.n - c4.c).toFixed(4), x2Patched: `${x2p.c} of ${x2p.n}`,
        x1First: `${rowsOf(mXS4).X1.calledGetVendorAnswer} of ${rowsOf(mXS4).X1.completed}`, x1All: `${c4.c + rowsOf(mXS4).X1.calledGetVendorAnswer} of ${c4.n + rowsOf(mXS4).X1.completed}`,
      };
    })(),
    ...(() => {
      const st = rowsOf(mSTS), sx = rowsOf(mSXS), sv = rowsOf(mSV), a = rowsOf(mSX1n).X1, b = rowsOf(mSX1o).X1;
      const kind = (rows, k, f) => Object.values(rows).filter((r) => r.kind === k).reduce((n, r) => n + (r[f] ?? 0), 0);
      const ord = [...Object.values(st), ...Object.values(sx)];
      const voidIn = (m) => Object.values(rowsOf(m)).flatMap((r) => r.voidInputs ?? []).map((x) => String(x.asked ?? "").toLowerCase());
      const allV = [...voidIn(mSV), ...voidIn(mV4)];
      const hubRows = [mHH, mHS].flatMap((m) => Object.values(rowsOf(m))), h2 = [mHH, mHS].map((m) => rowsOf(m).H2);
      const sum = (rows, f) => rows.reduce((n, r) => n + r[f], 0);
      return {
        sTrigRuns: kind(st, "trigger", "completed"), sTrigCalled: kind(st, "trigger", "calledGetVendorAnswer"), sConsRuns: kind(st, "consent", "completed"), sConsConfirm: kind(st, "consent", "calledConfirmAssistance"),
        sVoidRuns: ord.reduce((n, r) => n + r.toolSequences.filter((q) => q.includes("report_void")).length, 0), sTotalRuns: sum(ord, "completed"),
        allVoidCalls: allV.length, allNames: allV.filter((x) => x.includes("priya") || x.includes("raman")).length, allPhones: allV.filter((x) => x.includes("555")).length, allEmails: allV.filter((x) => x.includes("@")).length,
        sX1New: `${a.calledGetVendorAnswer} of ${a.completed}`, sX1Old: `${b.calledGetVendorAnswer} of ${b.completed}`,
        hubInvites: sum(hubRows, "hubInvitesSent"), hubRuns: sum(hubRows, "completed"), hubRelayed: sum(hubRows, "relayedInvitation"), hubRunsH2: sum(h2, "completed"), hubRelayedH2: sum(h2, "relayedInvitation"),
        hubOpened: sum(hubRows, "calledOpenHub"), hubCardCalls: hubRows.flatMap((r) => r.toolSequences).filter((q) => q.includes("hub_card")).length,
      };
    })(),
    patchFlipNew: flipNew.length, patchFlipNewList: list(flipNew), patchFlipOld: flipOld.length, patchNotFlipped: list(flipOld.filter((id) => !flipNew.includes(id))),
    source: v040.meta.sdk.source, fingerprint: v040.meta.sdk.distSha256.slice(0, 12), oldFingerprint: stock.meta.sdk.distSha256.slice(0, 12),
  };
  if (out.fixedList !== src.update040.expectFixed) throw new Error(`The checks now say fixed = ${out.fixedList}, but update040.expectFixed is "${src.update040.expectFixed}": the prose in update040 is stale.`);
  return out;
})();

// Founder-level text must read without jargon: no code formatting and none of these words. Only the glossary explains them.
const JARGON = /`|\b(SDK|API|JSON|regex|schema|MCP|Zod|JWT|payload|endpoint|handler|npm|registerTool|structuredContent|userinfo|hash|header|bearer|PII)\b|_meta/i;
for (const [what, text] of [...FINDINGS.map((f) => [f.id, f.founder]), ...src.founderSummary.map((t, i) => [`founderSummary[${i}]`, t]), ...src.update040.summary.map((t, i) => [`update040.summary[${i}]`, t]), ["update040.changed[0]", src.update040.changed[0]], ["update040.available[0]", src.update040.available[0]]]) {
  if (!text) throw new Error(`${what} has no founder-level text`);
  const m = text.match(JARGON);
  if (m) throw new Error(`${what}: founder-level text uses "${m[0]}". Rewrite it in plain words.`);
}
// One line per named function a finding points at: is it the same text in 0.4.0, and if not, what changed (read by hand into codeNotes).
const codeLines = (f) => {
  if (!U || f.since) return [];
  const units = CODE[f.id] ?? [];
  if (!units.length) return ["**In 0.4.0:** no named function to compare for this finding; its status comes from its checks."];
  return units.map((u) => {
    if (u.verdict === "identical") return `**In 0.4.0:** \`${u.name}\` has exactly the same text (now line ${u.lineNew}, was ${u.lineOld}).`;
    if (u.verdict !== "changed") return `**In 0.4.0:** \`${u.name}\`: ${u.verdict}.`;
    const note = src.codeNotes[u.name];
    if (!note) throw new Error(`The code of ${u.name} changed in 0.4.0 and has no note in findings.json codeNotes. Read the difference (DUMP_DIR, see code-locations.mjs) and write one.`);
    return `**In 0.4.0:** \`${u.name}\` differs (now line ${u.lineNew}, was ${u.lineOld}): ${note}.`;
  });
};

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
    const v = id === "X" ? dig(X, p) : id === "M" ? dig(M, p) : id === "U" ? dig(U, p) : dig(S[id], p);
    if (v === undefined || v === null) throw new Error(`Unresolved placeholder ${m}`);
    return String(v);
  });
}

const sevOrder = { High: 0, Medium: 1, Low: 2 };
const verdictLabel = { pass: "pass", fail: "FAIL", gap: "gap", info: "info", error: "ERROR" };
const testLine = (id) => {
  const s = S[id] ?? NEWR[id], p = P[id];
  if (!s) throw new Error(`Unknown test ${id}`);
  return { id, title: s.title, verdict: s.verdict, patched: p?.verdict, observed: s.observed, basis: s.basis };
};

const groups = [...new Set(FINDINGS.map((f) => f.group))];
const count = (sev) => oldFindings.filter((f) => f.severity === sev).length;
const tally = (r) => r.tally;
const nProto = new Set(FINDINGS.map((f) => f.prototype).filter(Boolean)).size;
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
if (U) {
  L("## The short version, for a founder");
  L();
  for (const b of src.founderSummary) L(`- ${resolve(b)}`);
  L();
  L("Every finding below starts with a short founder-level summary. The technical detail follows it: what happens, where in the code, and how to fix it. A glossary of the technical words is at the end.");
  L();
}
L("## About this report");
L();
for (const p of src.intro) L(resolve(p)), L();
L(`Tested ${when(stock.meta.ranAt)} on \`@getwithin/sdk\` ${stock.meta.sdk.version} (file fingerprint \`${stock.meta.sdk.distSha256.slice(0, 12)}\`), Node ${stock.meta.node}, MCP SDK ${stock.meta.mcpSdk}. Line numbers below refer to that package's \`dist/index.js\`, because Within's source repository is not public (the address in the package's package.json returns 404).`);
L();
const fixedNote = (id) => (V && status040(FINDINGS.find((f) => f.id === id))?.key === "fixed" ? "; fixed in 0.4.0" : "");
if (D104) {
  L(`## ${D104.src.title}`);
  L();
  for (const p of D104.src.summary) L(D104.resolve(p)), L();
  L("**The full update, with the five new findings and every earlier finding re-checked, is in [FINDINGS-1.0.4.md](FINDINGS-1.0.4.md)** ([web page](docs/findings-1.0.4.html)). The sections below describe 0.3.0 and 0.4.0; each finding has an \"In 1.0.4\" line.");
  L();
}
if (U) {
  L(`## ${src.update040.title}`);
  L();
  for (const p of src.update040.summary) L(resolve(p)), L();
  L("### What changed in 0.4.0");
  L();
  for (const b of src.update040.changed) L(`- ${resolve(b)}`);
  L();
  L("### Where the package is available");
  L();
  for (const b of src.update040.available) L(`- ${resolve(b)}`);
  L();
  L("### Technical notes on the 0.4.0 test");
  L();
  for (const b of src.update040.technical) L(`- ${resolve(b)}`);
  L();
}
L("## At a glance");
L();
L(`**${oldFindings.length} findings: ${count("High")} High, ${count("Medium")} Medium, ${count("Low")} Low.** ${Object.keys(S).length} automated checks ran against the published package (0.3.0): ${tally(stock).pass} pass, ${tally(stock).fail} fail, ${tally(stock).gap} gap (documented or undocumented behaviour worth a decision), ${tally(stock).info} information only. A patched copy with ${nProto} small prototype fixes turns ${Object.keys(S).filter((id) => ["fail", "gap"].includes(S[id].verdict) && P[id]?.verdict === "pass").length} of those fails and gaps into passes.`);
L();
if (U) L(`Version 0.4.0 adds ${newFindings.length} more findings (${newFindings.map((f) => f.id).join(", ")}), in their own group at the end. They were found by reading the new code and confirmed by ${U.nNew} extra checks (${newRes.tally.fail ?? 0} fail, ${newRes.tally.gap ?? 0} gap, ${newRes.tally.pass ?? 0} pass, ${newRes.tally.info ?? 0} info).`), L();
L(`| ID | Severity | What | Prototype fix |${U ? " In 0.4.0 |" : ""}${D104 ? " In 1.0.4 |" : ""}`);
L(`|---|---|---|---|${U ? "---|" : ""}${D104 ? "---|" : ""}`);
for (const f of [...FINDINGS].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.id.localeCompare(b.id)))
  L(`| [${f.id}](#${f.id.toLowerCase()}) | ${f.severity} | ${f.title} | ${f.prototype ?? "none"} |${U ? ` ${status040(f).key === "fixed" ? "**fixed**" : status040(f).short} |` : ""}${D104 ? ` ${s104(f)?.short ?? "n/a"} |` : ""}`);
L();
L("**If you only fix six things:** W-02 (an outage must not change or break the vendor's own answers), W-09, W-10 and W-11 (what leaves the vendor's server, and what the docs say about it), W-01 (the install steps must work on a new project" + fixedNote("W-01") + "), and W-04 (never swallow a vendor's own `context` input).");
L();
if (U) L(`**New in 0.4.0, fix these as well:** ${newFindings.filter((f) => f.severity === "High").map((f) => f.id).join(" and ")} (customer data that leaves the server without the documents saying so).`), L();
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
  for (const f of FINDINGS.filter((x) => x.group === g)) {
    L(`### ${f.id}`);
    L();
    L(`**${f.severity}: ${f.title}**`);
    L();
    if (U) L(`**In 0.4.0.** ${status040(f).label}`), L();
    if (s104(f)) L(`**In 1.0.4 (${s104(f).short}).** ${s104(f).text} See [FINDINGS-1.0.4.md](FINDINGS-1.0.4.md).`), L();
    if (U) L(`**For a founder.** ${f.founder}`), L();
    if (SKETCH[f.id]) L(`**Sketch.** [${SKETCH[f.id][1]}](../docs/diagrams/${SKETCH[f.id][0]}) (hand-drawn, animated)`.replace("](../docs/", "](docs/")), L();
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
    for (const l of codeLines(f)) L(`- ${l}`);
    L();
    L("**How to fix it.**");
    L();
    for (const w of f.fix) L(`- ${w}`);
    L();
    if (f.prototype) L(`**Prototype fix.** \`${f.prototype}\` in \`stress/patches/apply.mjs\`. Run \`npm run test:patched\` to see the checks above change.`), L();
    if (f.extra) L(`**Note.** ${f.extra}`), L();
    if (f.reproFull) L("**Reproduce.** `" + f.reproFull + "`");
    else L(`**Reproduce.** \`cd stress && npm install && ${f.repro.startsWith("npm") ? f.repro : "node run.mjs " + f.repro.replace(/^node run\.mjs /, "")}\``);
    L();
  }
}
L("## What held up");
L();
for (const h of src.heldUp.filter((x) => !x.since || U)) L(`- ${h.text} (\`${h.test}\`)`);
for (const l of modelParagraph()) L(`- ${l}`);
L();
L("## What we did not test");
L();
for (const n of src.notTested) L(`- ${n}`);
L();
L("## Method");
L();
L("- **Stand-in server.** `stress/lib/harness.mjs` starts a small local web server that plays Within's API. It can answer slowly, never answer, send broken replies, or offer a rep's chat. Every request goes to `127.0.0.1`.");
L("- **Real package, real MCP.** The tests use the stock `@getwithin/sdk` package (0.3.0 came from npm; the 0.4.0 copy came from a public mirror, see the update above), build an MCP server around it with the official MCP SDK, and call its tools with an MCP client.");
L("- **Checks, not opinions.** Each check says what it expected and why (a quote from Within's docs, or a stated vendor expectation), and what happened. Results are saved in `stress/results/`.");
L("- **Prototype fixes.** `stress/patches/apply.mjs` builds a patched copy of the package and re-runs the same checks, so each proposed fix is shown to work. They are proposals for Within's engineers, written against the published file.");
L("- **Model runs.** `stress/model/run-model.mjs` runs real Claude (headless Claude Code) against the same demo server, three runs per scenario unless noted.");
L();
L("## Reproduce everything");
L();
L("`stress/` is pinned to 0.3.0, the baseline. npm no longer serves that package, so `npm install` there needs the mirror address first: see the install note in `stress/README.md`.");
L();
L("```bash");
L("cd stress");
L("npm install");
L(`npm test                 # ${NCHECKS} checks against the stock package, about 70 seconds, writes results/latest.json`);
L("npm run test:patched     # builds the patched copy and runs the same checks");
L("npm run test:model       # real Claude (needs Claude Code signed in), writes results/model-*.json");
L("node run-new.mjs         # the checks for code that only exists in 0.4.0 (needs the 0.4.0 copy, see stress/README.md)");
L("node code-locations.mjs <0.3.0 dist/index.js> <0.4.0 dist/index.js> results/code-locations-0.4.0.json   # compare the code each finding points at");
L("npm run build:findings   # rebuilds this file and docs/findings.html from the saved results");
L("```");
L();
if (U) { L("## Words used in this report"); L(); for (const g of src.glossary) L(`- **${g.term}.** ${g.means}`); L(); }
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
.st{font-size:13px;font-weight:600;margin:6px 0}.st.fixed{color:var(--grn)}.st.unchanged,.st.notrerun{color:var(--mute)}.st.changed{color:var(--org)}.st.present{color:var(--red)}.st.notreproduced,.st.absent{color:var(--grn)}.st.nottested{color:var(--mute)}
</style></head><body><div class="wrap">
<div class="top"><a href="index.html" target="_top">← Back to the interactive map</a> · <a href="https://github.com/1AlgoRythm/within-trigger-check">Source and tests on GitHub</a></div>
<h1>${esc(src.title)}</h1>`);
if (U) {
  H(`<h2 style="margin-top:20px">The short version, for a founder</h2><ul>${src.founderSummary.map((b) => `<li>${inline(resolve(b))}</li>`).join("")}</ul>`);
  H(`<p>Every finding below starts with a short founder-level summary. The technical detail follows it: what happens, where in the code, and how to fix it. A glossary of the technical words is at the end.</p>`);
}
H(`<h2>About this report</h2>`);
for (const p of src.intro) H(`<p>${inline(resolve(p))}</p>`);
H(`<p class="mute">Tested ${when(stock.meta.ranAt)} on <code>@getwithin/sdk</code> ${stock.meta.sdk.version} (file fingerprint <code>${stock.meta.sdk.distSha256.slice(0, 12)}</code>), Node ${stock.meta.node}, MCP SDK ${stock.meta.mcpSdk}. Line numbers refer to that package's <code>dist/index.js</code>, because Within's source repository is not public (the address in the package's package.json returns 404).</p>`);
if (D104) {
  H(`<h2 id="update-version-104">${esc(D104.src.title)}</h2>`);
  for (const p of D104.src.summary) H(`<p>${inline(D104.resolve(p))}</p>`);
  H(`<p><strong>The full update, with the five new findings and every earlier finding re-checked, is on <a href="findings-1.0.4.html">its own page</a></strong> (also <a href="https://github.com/1AlgoRythm/within-trigger-check/blob/main/FINDINGS-1.0.4.md">on GitHub</a>). The sections below describe 0.3.0 and 0.4.0; each finding has an "In 1.0.4" line.</p>`);
}
if (U) {
  H(`<h2 id="update-version-040">${esc(src.update040.title)}</h2>`);
  for (const p of src.update040.summary) H(`<p>${inline(resolve(p))}</p>`);
  H(`<h3 style="margin-top:18px">What changed in 0.4.0</h3><ul>${src.update040.changed.map((b) => `<li>${inline(resolve(b))}</li>`).join("")}</ul>`);
  H(`<h3 style="margin-top:18px">Where the package is available</h3><ul>${src.update040.available.map((b) => `<li>${inline(resolve(b))}</li>`).join("")}</ul>`);
  H(`<h3 style="margin-top:18px">Technical notes on the 0.4.0 test</h3><ul>${src.update040.technical.map((b) => `<li>${inline(resolve(b))}</li>`).join("")}</ul>`);
}
H(`<h2>At a glance</h2><p><strong>${oldFindings.length} findings: ${count("High")} High, ${count("Medium")} Medium, ${count("Low")} Low.</strong> ${Object.keys(S).length} automated checks ran against the published package (0.3.0): ${tally(stock).pass} pass, ${tally(stock).fail} fail, ${tally(stock).gap} gap, ${tally(stock).info} information only. A patched copy with ${nProto} small prototype fixes turns ${Object.keys(S).filter((id) => ["fail", "gap"].includes(S[id].verdict) && P[id]?.verdict === "pass").length} of those fails and gaps into passes.</p>`);
if (U) H(`<p>Version 0.4.0 adds ${newFindings.length} more findings (${newFindings.map((f) => f.id).join(", ")}), in their own group at the end. They were found by reading the new code and confirmed by ${U.nNew} extra checks (${newRes.tally.fail ?? 0} fail, ${newRes.tally.gap ?? 0} gap, ${newRes.tally.pass ?? 0} pass, ${newRes.tally.info ?? 0} info).</p>`);
H(`<table class="sum"><tr><th>ID</th><th>Severity</th><th>What</th><th>Prototype fix</th>${U ? "<th>In 0.4.0</th>" : ""}${D104 ? "<th>In 1.0.4</th>" : ""}</tr>`);
for (const f of [...FINDINGS].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.id.localeCompare(b.id)))
  H(`<tr><td><a href="#${f.id.toLowerCase()}">${f.id}</a></td><td><span class="badge ${f.severity}">${f.severity}</span></td><td>${inline(f.title)}</td><td>${f.prototype ?? "none"}</td>${U ? `<td><span class="st ${status040(f).key}">${status040(f).short}</span></td>` : ""}${D104 ? `<td><span class="st ${s104(f)?.key ?? ""}">${s104(f)?.short ?? "n/a"}</span></td>` : ""}</tr>`);
H(`</table><p><strong>If you only fix six things:</strong> W-02 (an outage must not change or break the vendor's own answers), W-09, W-10 and W-11 (what leaves the vendor's server, and what the docs say about it), W-01 (the install steps must work on a new project${fixedNote("W-01")}), and W-04 (never swallow a vendor's own <code>context</code> input).</p>`);
if (U) H(`<p><strong>New in 0.4.0, fix these as well:</strong> ${newFindings.filter((f) => f.severity === "High").map((f) => f.id).join(" and ")} (customer data that leaves the server without the documents saying so).</p>`);
H(`<h3 style="margin-top:20px">What the words mean</h3><ul>`);
for (const s of src.severity) H(`<li><strong>${s.name}.</strong> ${inline(s.meaning)}</li>`);
H(`<li><span class="v pass">pass</span> did what the docs, or a reasonable vendor, would expect.</li><li><span class="v fail">FAIL</span> contradicts the package's own docs, or breaks something a vendor would reasonably expect.</li><li><span class="v gap">gap</span> documented or deliberate behaviour that leaves a risk, or behaviour the docs do not mention. A decision for Within's team.</li><li><span class="v info">info</span> a measurement with no judgement attached.</li></ul>`);
for (const g of groups) {
  H(`<h2>${esc(g)}</h2>`);
  for (const f of FINDINGS.filter((x) => x.group === g)) {
    H(`<div class="card ${f.severity}" id="${f.id.toLowerCase()}"><h3><span class="badge ${f.severity}">${f.severity}</span>${f.id} · ${inline(f.title)}</h3>`);
    if (U) H(`<p class="st ${status040(f).key}"><strong>In 0.4.0.</strong> ${esc(status040(f).label)}</p>`);
    if (s104(f)) H(`<p class="st ${s104(f).key}"><strong>In 1.0.4 (${esc(s104(f).short)}).</strong> ${inline(s104(f).text)} <a href="findings-1.0.4.html#${f.id.toLowerCase()}-104">Details</a></p>`);
    if (U) H(`<div class="k">For a founder</div><p>${esc(f.founder)}</p>`);
    if (SKETCH[f.id]) H(`<div class="k">Sketch</div><p><a href="diagrams/${SKETCH[f.id][0]}">${esc(SKETCH[f.id][1])}</a> (hand-drawn, animated; the map opens it too)</p>`);
    H(`<div class="k">In plain words</div><p>${inline(resolve(f.plain))}</p><div class="k">Why it matters</div><p>${inline(resolve(f.why))}</p>`);
    if (f.tests.length) {
      H(`<div class="k">What we measured</div><ul>`);
      for (const id of f.tests) { const t = testLine(id); H(`<li><code>${t.id}</code> <span class="v ${t.verdict}">${verdictLabel[t.verdict]}</span>${t.patched && t.patched !== t.verdict ? ` → <span class="v ${t.patched}">${verdictLabel[t.patched]}</span> patched` : ""} ${inline(t.title)} ${inline(t.observed)}</li>`); }
      H(`</ul>`);
    }
    if (f.models) { H(`<div class="k">Real Claude</div>`); for (const l of modelParagraph("consent")) H(`<p>${inline(l)}</p>`); }
    H(`<div class="k">Where in the code</div><ul>${[...f.where, ...codeLines(f)].map((w) => `<li>${inline(w)}</li>`).join("")}</ul>`);
    H(`<div class="k">How to fix it</div><ul>${f.fix.map((w) => `<li>${inline(w)}</li>`).join("")}</ul>`);
    if (f.prototype) H(`<p><strong>Prototype fix:</strong> <code>${f.prototype}</code> in <code>stress/patches/apply.mjs</code>. Run <code>npm run test:patched</code> to see the checks above change.</p>`);
    if (f.extra) H(`<p><strong>Note.</strong> ${inline(f.extra)}</p>`);
    H(`<p class="mute"><strong>Reproduce:</strong> <code>${f.reproFull ? esc(f.reproFull) : "cd stress &amp;&amp; npm install &amp;&amp; " + esc(f.repro.startsWith("npm") ? f.repro : "node run.mjs " + f.repro.replace(/^node run\.mjs /, ""))}</code></p></div>`);
  }
}
H(`<h2>What held up</h2><ul>${src.heldUp.filter((x) => !x.since || U).map((x) => `<li>${inline(x.text)} (<code>${x.test}</code>)</li>`).join("")}${modelParagraph().map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`);
H(`<h2>What we did not test</h2><ul>${src.notTested.map((n) => `<li>${inline(n)}</li>`).join("")}</ul>`);
H(`<h2>Reproduce everything</h2><p><code>stress/</code> is pinned to 0.3.0, the baseline. npm no longer serves that package, so <code>npm install</code> there needs the mirror address first: see the install note in <code>stress/README.md</code>.</p><pre>cd stress
npm install
npm test                 # ${Object.keys(S).length} checks against the stock package, about 70 seconds
npm run test:patched     # builds the patched copy and runs the same checks
npm run test:model       # real Claude (needs Claude Code signed in)
node run-new.mjs         # the checks for code that only exists in 0.4.0 (needs the 0.4.0 copy, see stress/README.md)
node code-locations.mjs <0.3.0 dist/index.js> <0.4.0 dist/index.js> results/code-locations-0.4.0.json
npm run build:findings   # rebuilds this page and FINDINGS.md from the saved results</pre>`);
if (U) H(`<h2>Words used in this report</h2><ul>${src.glossary.map((g) => `<li><strong>${esc(g.term)}.</strong> ${inline(g.means)}</li>`).join("")}</ul>`);
H(`</div></body></html>`);
fs.writeFileSync(path.join(root, "docs/findings.html"), h.join("\n"));
console.log(`Wrote FINDINGS.md (${md.length} lines) and docs/findings.html`);
