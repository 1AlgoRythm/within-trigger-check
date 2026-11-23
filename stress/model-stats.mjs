// Numbers from the saved real-Claude runs (results/model-*.json, results/app-prompts-040.json), computed here and never typed in.
// Used by build.mjs (the report) and sketches.mjs (the pictures). The runs were made on 2026-11-20 and 2026-11-21 on the same
// package file that npm serves today; they were not repeated on 2026-11-23 because each batch spends Claude usage.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const exists = (f) => fs.existsSync(path.join(here, "results", f));
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, "results", f), "utf8"));
const need = (f) => (exists(f) ? read(f) : (() => { throw new Error(`missing results/${f}`); })());
const rowsOf = (m) => Object.fromEntries((m?.results ?? []).map((r) => [r.id, r]));

// pooled counts for one scenario over the three same-day batches a, b, c (tag "X1-040" reads model-haiku-X1-040-a.json ...)
const pooled = (tag, id) => {
  let c = 0, n = 0;
  for (const b of ["a", "b", "c"]) { const r = rowsOf(need(`model-haiku-${tag}-${b}.json`))[id]; c += r.calledGetVendorAnswer; n += r.completed; }
  return { c, n };
};
// two-sided Fisher exact test for a 2x2 table (a of a+b versus c of c+d)
export const fisherP = (a, b, c, d) => {
  const comb = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
  const n = a + b + c + d, r1 = a + b, c1 = a + c, pr = (x) => (comb(r1, x) * comb(n - r1, c1 - x)) / comb(n, c1), p0 = pr(a);
  let t = 0;
  for (let x = Math.max(0, c1 - (n - r1)); x <= Math.min(r1, c1); x++) if (pr(x) <= p0 * (1 + 1e-9)) t += pr(x);
  return t;
};

export function modelStats() {
  const tr = rowsOf(need("model-haiku-T-S-040.json")), xs = rowsOf(need("model-haiku-X-040-stock.json")), xp = rowsOf(need("model-haiku-X-040-patched.json")), vr = rowsOf(need("model-haiku-V-040.json"));
  const app = need("app-prompts-040.json");
  const st = rowsOf(need("model-sonnet-T-S-040.json")), sx = rowsOf(need("model-sonnet-X-040-stock.json"));
  const mSV = need("model-sonnet-V-040.json"), mV4 = need("model-haiku-V-040.json");
  const sX1 = rowsOf(need("model-sonnet-X1-040-a.json")).X1;
  const mHH = need("model-haiku-H-040.json"), mHS = need("model-sonnet-H-040.json");
  const sumKind = (rows, kind, k) => Object.values(rows).filter((r) => r.kind === kind).reduce((n, r) => n + (r[k] ?? 0), 0);
  const first = [...Object.values(tr), ...Object.values(xs), ...Object.values(xp)];
  const ord = [...Object.values(st), ...Object.values(sx)];
  const sum = (rows, f) => rows.reduce((n, r) => n + r[f], 0);
  const voidIn = (m) => Object.values(rowsOf(m)).flatMap((r) => r.voidInputs ?? []).map((x) => String(x.asked ?? "").toLowerCase());
  const allV = [...voidIn(mSV), ...voidIn(mV4)];
  const hubRows = [mHH, mHS].flatMap((m) => Object.values(rowsOf(m))), h2 = [mHH, mHS].map((m) => rowsOf(m).H2);
  const A = app.rows, rec = A.filter((r) => r.expect === "within"), fa = A.filter((r) => r.expect === "no"), tot = (xs_, k) => xs_.reduce((n, r) => n + r[k], 0);
  const c4 = pooled("X1-040", "X1"), cp = pooled("X1-040P", "X1"), x2p = pooled("X1-040P", "X2");
  return {
    trigHaikuRuns: sumKind(tr, "trigger", "completed"), trigHaikuCalled: sumKind(tr, "trigger", "calledGetVendorAnswer"),
    consHaikuRuns: sumKind(tr, "consent", "completed"), consHaikuConfirm: sumKind(tr, "consent", "calledConfirmAssistance"), consHaikuAccepted: sumKind(tr, "consent", "offerAcceptedAtStandIn"),
    trigSonnetRuns: sumKind(st, "trigger", "completed"), trigSonnetCalled: sumKind(st, "trigger", "calledGetVendorAnswer"),
    consSonnetRuns: sumKind(st, "consent", "completed"), consSonnetConfirm: sumKind(st, "consent", "calledConfirmAssistance"),
    voidRuns: first.reduce((n, r) => n + r.toolSequences.filter((q) => q.includes("report_void")).length, 0), totalRuns: sum(first, "completed"),
    sVoidRuns: ord.reduce((n, r) => n + r.toolSequences.filter((q) => q.includes("report_void")).length, 0), sTotalRuns: sum(ord, "completed"),
    allVoidCalls: allV.length, allNames: allV.filter((x) => x.includes("priya") || x.includes("raman")).length, allPhones: allV.filter((x) => x.includes("555")).length, allEmails: allV.filter((x) => x.includes("@")).length,
    appRuns: tot(A, "of"), recallCalled: tot(rec, "called"), recallOf: tot(rec, "of"), falseCalled: tot(fa, "called"), falseOf: tot(fa, "of"),
    x1New: `${c4.c} of ${c4.n}`, x1Patched: `${cp.c} of ${cp.n}`, x2Patched: `${x2p.c} of ${x2p.n}`, x1SonnetNew: `${sX1.calledGetVendorAnswer} of ${sX1.completed}`,
    x1NewC: c4.c, x1NewN: c4.n, x1PatchedC: cp.c, x1PatchedN: cp.n, x1PatchedP: fisherP(cp.c, cp.n - cp.c, c4.c, c4.n - c4.c).toFixed(4),
    hubInvites: sum(hubRows, "hubInvitesSent"), hubRuns: sum(hubRows, "completed"), hubRelayed: sum(hubRows, "relayedInvitation"), hubRunsH2: sum(h2, "completed"), hubRelayedH2: sum(h2, "relayedInvitation"),
    hubOpened: sum(hubRows, "calledOpenHub"), hubCardCalls: hubRows.flatMap((r) => r.toolSequences).filter((q) => q.includes("hub_card")).length,
  };
}
