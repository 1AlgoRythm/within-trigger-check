// Draws the hand-drawn, animated sketches for @getwithin/sdk 0.4.0:
//   ../docs/diagrams/NN-... one sketch per finding (24)
//   ../docs/flow.svg         one tool call through the SDK, with every finding marked
// Every number on a sketch is read from results/sdk-0.4.0.json, results/new-in-040.json or the saved real-Claude runs, and the
// script stops if one is missing, if a sketch does not match a finding in findings.json, or if a line of text is wider than its box.
//   node sketches.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { modelStats } from "./model-stats.mjs";

const fail = (m) => { throw new Error(m); };
const tooWide = [];
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(here, p), "utf8"));
const src = rd("findings.json"), main = rd("results/sdk-0.4.0.json"), news = rd("results/new-in-040.json");
if (main.meta.sdk.version !== "0.4.0" || news.meta.sdk.version !== "0.4.0") fail("results are not for 0.4.0");
const R = Object.fromEntries([...main.results, ...news.results].map((r) => [r.id, r]));
const dig = (o, p) => p.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce((a, k) => (a == null ? undefined : a[k]), o);
const E = (id, p) => { const v = dig(R[id]?.evidence, p); if (v === undefined || v === null) fail(`missing evidence ${id}.${p}`); return v; };
const U = modelStats();
const fmt = (n) => n.toLocaleString("en-US");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const INK = "#1f2328", MUTE = "#59636e", ORG = "#f97316", BLU = "#3b82f6", RED = "#ef4444", GRN = "#10b981", PAPER = "#fffdf7";
const SEV = { High: RED, Medium: ORG, Low: BLU };
const HAND = "'Bradley Hand','Segoe Print','Marker Felt','Comic Sans MS',cursive", SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";

// ---- a small pen: every line is slightly wobbly, and the wobble is the same every time the script runs
class Pen {
  constructor(name) {
    let h = 2166136261; for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    let a = h >>> 0;
    this.r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.out = []; this.name = name;
  }
  j(n = 1.6) { return (this.r() - 0.5) * 2 * n; }
  add(s) { this.out.push(s); }
  rect(x, y, w, h, o = {}) {
    const f = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`, j = (n) => this.j(n);
    const p = [[x + j(2), y + j(2)], [x + w + j(2), y + j(2)], [x + w + j(2), y + h + j(2)], [x + j(2), y + h + j(2)]];
    let d = `M${f(p[0])}`;
    for (let i = 0; i < 4; i++) { const a = p[i], b = p[(i + 1) % 4]; d += ` Q${f([(a[0] + b[0]) / 2 + j(2.5), (a[1] + b[1]) / 2 + j(2.5)])} ${f(b)}`; }
    this.add(`<path d="${d}" fill="${o.fill ?? "#fff"}" stroke="${o.stroke ?? INK}" stroke-width="${o.sw ?? 2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""} stroke-linecap="round" stroke-linejoin="round"${o.cls ? ` class="${o.cls}"` : ""}${o.style ? ` style="${o.style}"` : ""}/>`);
  }
  line(x1, y1, x2, y2, o = {}) {
    const mx = (x1 + x2) / 2 + this.j(4) + (o.bend ?? 0), my = (y1 + y2) / 2 + this.j(4) + (o.bendY ?? 0);
    this.add(`<path d="M${x1} ${y1} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2} ${y2}" fill="none" stroke="${o.color ?? INK}" stroke-width="${o.sw ?? 2}" stroke-linecap="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}${o.cls ? ` class="${o.cls}"` : ""}/>`);
    if (o.arrow) {
      const ang = Math.atan2(y2 - my, x2 - mx), hl = 12, c = o.color ?? INK;
      const h1 = [x2 - hl * Math.cos(ang - 0.5), y2 - hl * Math.sin(ang - 0.5)], h2 = [x2 - hl * Math.cos(ang + 0.5), y2 - hl * Math.sin(ang + 0.5)];
      this.add(`<path d="M${h1[0].toFixed(1)} ${h1[1].toFixed(1)} L${x2} ${y2} L${h2[0].toFixed(1)} ${h2[1].toFixed(1)}" fill="none" stroke="${c}" stroke-width="${o.sw ?? 2}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  }
  // text: lines is a string or an array of strings. maxW makes the script stop when a line cannot fit.
  text(x, y, lines, o = {}) {
    const ls = Array.isArray(lines) ? lines : [lines], size = o.size ?? 14, k = o.hand ? 0.5 : 0.56;
    if (o.maxW) for (const l of ls) if (l.length * size * k > o.maxW) tooWide.push(`${this.name}: ${Math.round(l.length * size * k)}px > ${o.maxW}px: "${l}"`);
    const fam = o.hand ? HAND : SANS;
    this.add(`<text x="${x}" y="${y}" font-family="${fam}" font-size="${size}" fill="${o.color ?? INK}"${o.weight ? ` font-weight="${o.weight}"` : ""}${o.anchor ? ` text-anchor="${o.anchor}"` : ""}>${ls.map((l, i) => `<tspan x="${x}" dy="${i ? size * 1.32 : 0}">${esc(l)}</tspan>`).join("")}</text>`);
  }
  pill(x, y, label, color, o = {}) {
    const w = label.length * (o.size ?? 12) * 0.62 + 16, h = (o.size ?? 12) + 10;
    this.add(`<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="${h / 2}" fill="${color}"${o.cls ? ` class="${o.cls}"` : ""}/>`);
    this.add(`<text x="${(x + w / 2).toFixed(1)}" y="${y + h / 2 + (o.size ?? 12) * 0.36}" text-anchor="middle" font-family="${SANS}" font-size="${o.size ?? 12}" font-weight="700" fill="#fff">${esc(label)}</text>`);
    return w;
  }
  // a chip: text on a tinted label
  chip(x, y, label, color, o = {}) {
    const size = o.size ?? 12, w = label.length * size * 0.6 + 14;
    this.add(`<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${size + 8}" rx="6" fill="${color}22" stroke="${color}" stroke-width="1.5"${o.strike ? "" : ""}/>`);
    this.add(`<text x="${x + 7}" y="${y + size + 1}" font-family="${SANS}" font-size="${size}" fill="${INK}"${o.strike ? ' text-decoration="line-through"' : ""}>${esc(label)}</text>`);
    return w;
  }
  html() { return this.out.join("\n"); }
}

const CSS = `
.flow{stroke-dasharray:9 7;animation:dash 1.1s linear infinite}
.slow{stroke-dasharray:9 7;animation:dash 2.4s linear infinite}
@keyframes dash{to{stroke-dashoffset:-32}}
.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 1.7s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.08);opacity:.6}}
.grow{transform-box:fill-box;transform-origin:50% 100%;animation:grow 1.3s cubic-bezier(.2,.8,.2,1) both}
@keyframes grow{from{transform:scaleY(.02)}to{transform:scaleY(1)}}
.growx{transform-box:fill-box;transform-origin:0 50%;animation:growx 1.6s cubic-bezier(.2,.8,.2,1) both}
@keyframes growx{from{transform:scaleX(.02)}to{transform:scaleX(1)}}
.bob{animation:bob 2.2s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.blink{animation:blink 1.4s steps(2,start) infinite}
@keyframes blink{50%{opacity:.15}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

const FILTER = `<filter id="wob" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter>`;

// split a sentence into lines that fit a box; stops if it needs more than three lines
function wrap(text, px, size, name) {
  const words = text.split(" "), lines = []; let cur = "";
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (t.length * size * 0.56 > px && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  if (lines.length > 3) fail(`${name}: footer needs ${lines.length} lines: "${text}"`);
  return lines;
}

function frame(pen, o) {
  const head = [];
  head.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="${esc(o.alt)}">`);
  head.push(`<title>${esc(o.alt)}</title><defs>${FILTER}<style>${CSS}</style></defs>`);
  head.push(`<rect width="960" height="540" fill="${PAPER}"/>`);
  const t = new Pen(pen.name + "-frame");
  t.text(40, 52, o.title, { size: 27, hand: true, weight: 700, maxW: 760 });
  const w = t.pill(840, 30, o.sev ? `${o.id} · ${o.sev}` : o.id, o.sev ? SEV[o.sev] : MUTE);
  t.text(40, 80, o.sub, { size: 13, color: MUTE, maxW: 880 });
  const fo = new Pen(pen.name + "-foot");
  if (o.vendor) {
    fo.rect(40, 446, 430, 88, { fill: "#f3faf6", stroke: GRN, sw: 1.8 });
    fo.text(54, 465, "A vendor can do this today", { size: 12.5, weight: 700, color: GRN });
    fo.text(54, 482, wrap(o.vendor, 404, 12.5, pen.name), { size: 12.5 });
  }
  if (o.within) {
    const x0 = o.vendor ? 490 : 40, bw = o.vendor ? 430 : 880;
    fo.rect(x0, 446, bw, 88, { fill: "#f3f7fd", stroke: BLU, sw: 1.8 });
    fo.text(x0 + 14, 465, "What Within should change", { size: 12.5, weight: 700, color: BLU });
    fo.text(x0 + 14, 482, wrap(o.within, bw - 26, 12.5, pen.name), { size: 12.5 });
  }
  return [...head, `<g filter="url(#wob)">`, pen.html(), `</g>`, t.html(), `<g filter="url(#wob)">`, fo.html(), `</g>`, `</svg>`].join("\n");
}



// ---- findings by id, so a sketch can never disagree with the report about severity or the fix
const FIND = Object.fromEntries(src.findings.map((f) => [f.id, f]));
const sketches = [];
const S = (n, slug, id, title, sub, alt, draw) => {
  const f = FIND[id] ?? fail(`no finding ${id}`);
  const pen = new Pen(slug); draw(pen);
  sketches.push({ file: `${String(n).padStart(2, "0")}-${slug}.svg`, id, title, svg: frame(pen, { id, sev: f.severity, title, sub, alt, vendor: null, within: f.fix[0] }) });
};
const bx = (p, x, y, w, h, title, lines = [], o = {}) => {
  p.rect(x, y, w, h, { fill: o.fill ?? "#fff", stroke: o.stroke ?? INK, sw: o.sw ?? 2, cls: o.cls });
  p.text(x + 14, y + 24, title, { size: o.size ?? 14.5, weight: 700, color: o.color ?? INK, maxW: w - 24 });
  (Array.isArray(lines) ? lines : [lines]).forEach((l, i) => p.text(x + 14, y + 46 + i * 19, l, { size: 12.5, color: o.sub ?? MUTE, maxW: w - 24 }));
};
const arr = (p, x1, y1, x2, y2, color = ORG, cls = "flow") => p.line(x1, y1, x2, y2, { arrow: true, color, cls });
const stat = (p, x, y, text, color) => p.text(x, y, text, { size: 21, hand: true, weight: 700, color });
const note = (p, x, y, lines, color = MUTE, size = 13) => p.text(x, y, lines, { size, color });
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// ============ Breaks the vendor's own product
S(1, "outage-changes-the-answer", "W-02", "An outage at Within changes the vendor's answer",
  "If Within cannot be reached, the vendor's text still comes back, but the SDK also writes its own status into the data.",
  "A tool whose output format allows only shipped or pending fails when Within is down, because the SDK writes service_unreachable",
  (p) => {
    bx(p, 40, 120, 250, 96, "Within is up", ["the vendor's tool returns", `status: shipped or pending`], { stroke: GRN, fill: "#f3faf6" });
    arr(p, 292, 168, 400, 168, GRN);
    bx(p, 404, 120, 250, 96, "Call result", [], { stroke: GRN, fill: "#f3faf6" }); stat(p, 418, 192, E("A3b", "within_up_ok") ? "ok" : "error", GRN);
    bx(p, 40, 250, 250, 110, "Within is down", ["the SDK writes", "status: \"service_unreachable\"", "into the vendor's data"], { stroke: RED, fill: "#fff1f0", cls: "pulse" });
    arr(p, 292, 305, 400, 305, RED);
    bx(p, 404, 250, 516, 110, "The tool declares status as shipped or pending", ["Check A3b: " + (E("A3b", "within_down_ok") ? "ok" : "the call fails with an output validation error"), `\"${trunc(E("A3b", "within_down_message").replace(/^MCP error -32602: /, ""), 62)}\"`], { stroke: RED, fill: "#fff1f0" });
    note(p, 40, 392, `The extra line of text does arrive (check A2, ${E("A2", "tookMs")} ms). The harm is in the vendor's structured data.`, MUTE, 13.5);
  });
S(2, "every-call-waits", "W-03", "A hung Within adds five seconds to every call",
  "After a wrapped tool call, the SDK waits up to five seconds for Within's reply. Every call pays that.",
  `Three calls with Within hanging took ${E("A1b", "timesMs").join(", ")} ms each`,
  (p) => {
    const t = E("A1b", "timesMs"), max = Math.max(...t), base = 384, top = 176, bw = 110;
    p.line(100, base, 640, base, { color: INK, sw: 2.2 }); p.line(100, base, 100, top - 10, { color: INK, sw: 2.2 });
    p.text(106, 128, "How long the vendor's tool call took (ms), Within not answering", { size: 13, color: MUTE, maxW: 520 });
    t.forEach((v, i) => { const h = ((base - top) * v) / max, x = 150 + i * 160; p.rect(x, base - h, bw, h, { fill: RED, stroke: INK, sw: 1.6, cls: "grow", style: `animation-delay:${i * 0.2}s` }); p.text(x + bw / 2, base - h - 8, fmt(v), { size: 15, anchor: "middle", weight: 700 }); p.text(x + bw / 2, base + 20, `call ${i + 1}`, { size: 12.5, anchor: "middle", color: MUTE }); });
    bx(p, 690, 140, 230, 112, "With Within up", [`${E("A8b", "wrapped_0ms")} ms of extra wait`], { stroke: GRN, fill: "#f3faf6" });
    bx(p, 690, 272, 230, 112, "Within slow by 300 ms", [`wrapped: ${E("A8b", "wrapped_300ms")} ms`, `unwrapped: ${E("A8b", "unwrapped_300ms")} ms`], { stroke: BLU, fill: "#eef4fb" });
  });
S(3, "context-input-lost", "W-04", "A vendor tool's own context input is swallowed",
  "If a vendor tool has its own input called context, the SDK takes it. The vendor's code never sees the value.",
  "The vendor tool's own context value never reaches its handler and goes to Within as the goal text",
  (p) => {
    bx(p, 40, 120, 270, 100, "The model's call", ["question: How do refunds work?", "context: Customer Priya Raman, …"], { size: 14 });
    arr(p, 312, 170, 420, 170, ORG);
    bx(p, 424, 100, 250, 140, "The SDK", ["takes context away", "from the vendor's input"], { stroke: ORG, fill: "#fff7ed", cls: "pulse" });
    arr(p, 676, 140, 770, 120, ORG); arr(p, 676, 200, 770, 232, RED);
    bx(p, 774, 90, 146, 70, "Vendor's code", ["gets question"], { size: 13.5 });
    bx(p, 774, 200, 146, 70, "Within", ["gets it as goal"], { size: 13.5, stroke: RED, fill: "#fff1f0" });
    p.rect(40, 300, 880, 70, { fill: "#fff" });
    p.text(56, 326, `The vendor's handler received: ${JSON.stringify(E("B3", "handlerArgs"))}`, { size: 13.5, maxW: 840 });
    p.text(56, 350, `Within received: "${E("B3", "mcpIntentSentToWithin")}"`, { size: 13.5, color: RED, maxW: 840 });
  });
S(4, "goal-longer-than-300", "W-05", "A goal longer than 300 characters rejects the call",
  "The SDK adds a context input limited to 300 characters. A longer text from the model fails the whole call.",
  `A 300-character goal worked: ${E("B4", "at300")}. A 375-character goal was rejected: ${!E("B4", "at375")}`,
  (p) => {
    bx(p, 40, 130, 400, 120, "A 300-character goal", ["the tool call goes through"], { stroke: GRN, fill: "#f3faf6" }); stat(p, 56, 230, E("B4", "at300") ? "accepted" : "rejected", GRN);
    bx(p, 520, 130, 400, 120, "A 375-character goal", ["the whole tool call is rejected"], { stroke: RED, fill: "#fff1f0", cls: "pulse" }); stat(p, 536, 230, E("B4", "at375") ? "accepted" : "rejected", RED);
    p.rect(40, 290, 880, 90, { fill: "#fff" });
    p.text(56, 318, "The error the model gets:", { size: 13.5, weight: 700 });
    p.text(56, 344, trunc(E("B4", "message"), 110), { size: 13, color: RED, maxW: 840 });
    note(p, 56, 366, "The SDK already cuts the goal to 300 characters itself, so the limit on the input is not needed.", MUTE, 12.5);
  });
S(5, "meta-removed", "W-06", "The vendor's own _meta data is removed",
  "When a rep's offer is attached to a tool result, the vendor's own _meta field is replaced by null.",
  `With an offer attached, the vendor's _meta came back as ${String(R.B2.evidence._meta)}`,
  (p) => {
    bx(p, 40, 130, 380, 110, "The vendor's result", ["content: the answer", "_meta: the vendor's own data"], { stroke: GRN, fill: "#f3faf6" });
    arr(p, 422, 185, 520, 185, ORG);
    bx(p, 524, 130, 396, 110, "With a rep's offer attached", ["content: the answer + the offer", `_meta: ${String(R.B2.evidence._meta)}`], { stroke: RED, fill: "#fff1f0", cls: "pulse" });
    p.rect(40, 290, 880, 70, { fill: "#fff" }); p.text(56, 318, `Check B2: assistance attached = ${E("B2", "assistanceAttached")}, _meta = ${String(R.B2.evidence._meta)}.`, { size: 14, maxW: 840 });
    note(p, 56, 346, "We do not know why Within removes _meta. It may be to stop a second card from appearing.", MUTE, 12.5);
  });
S(6, "identify-throws", "W-07", "A throwing identity function fails the customer's call",
  "The SDK asks the vendor's own function who the customer is. If it throws, the customer's call suffers.",
  `The identity function threw "${E("A7", "message")}" and the vendor's handler ran: ${E("A7", "vendorHandlerRan")}`,
  (p) => {
    bx(p, 40, 130, 270, 100, "The vendor's function", ["who is this customer?"], { size: 14 });
    arr(p, 312, 180, 420, 180, RED);
    bx(p, 424, 130, 250, 100, "It throws", [`\"${E("A7", "message")}\"`], { stroke: RED, fill: "#fff1f0", cls: "pulse" });
    arr(p, 676, 180, 770, 180, RED);
    bx(p, 774, 130, 146, 100, "The call", ["is affected"], { stroke: RED, fill: "#fff1f0" });
    p.rect(40, 270, 880, 80, { fill: "#fff" });
    p.text(56, 298, `Check A7 (${R.A7.verdict}): vendor handler ran = ${E("A7", "vendorHandlerRan")}.`, { size: 14, maxW: 840 });
    note(p, 56, 324, "A failure in the vendor's own helper should not become the customer's failure.", MUTE, 13);
  });
S(7, "long-text-freeze", "W-08", "Very long text without spaces freezes the server",
  "The email pattern in the privacy filter slows down fast on unbroken text. While it runs, nobody is answered.",
  `Letters: ${fmt(E("C8", "rows[0].medianMs"))} ms at 20,000, ${fmt(E("C8", "rows[1].medianMs"))} ms at 40,000, ${fmt(E("C8", "rows[2].medianMs"))} ms at 80,000`,
  (p) => {
    const rows = [0, 1, 2].map((i) => E("C8", `rows[${i}]`)), max = rows[2].medianMs, base = 384, top = 176, bw = 90, xs = [150, 280, 410];
    p.line(110, base, 600, base, { color: INK, sw: 2.2 }); p.line(110, base, 110, top - 10, { color: INK, sw: 2.2 });
    p.text(116, 128, "How long the server froze (ms, median of three runs)", { size: 13, color: MUTE, maxW: 480 });
    rows.forEach((r, i) => { const h = ((base - top) * r.medianMs) / max; p.rect(xs[i], base - h, bw, h, { fill: i === 2 ? RED : ORG, stroke: INK, sw: 1.6, cls: "grow", style: `animation-delay:${i * 0.2}s` }); p.text(xs[i] + bw / 2, base - h - 8, fmt(r.medianMs), { size: 15, weight: 700, anchor: "middle" }); p.text(xs[i] + bw / 2, base + 20, fmt(r.size), { size: 12.5, anchor: "middle", color: MUTE }); });
    p.text(150, base + 38, "unbroken letters in one argument", { size: 12.5, color: MUTE });
    bx(p, 650, 130, 270, 96, "Digits and spaces, 80,000", [`${E("C8", "rows[4].medianMs")} ms`], { stroke: GRN, fill: "#f3faf6" });
    bx(p, 650, 244, 270, 112, "An error, default settings", [`${fmt(E("C8", "rows[5].medianMs"))} ms at 20,000 letters`, `${fmt(E("C8", "rows[6].medianMs"))} ms at 40,000`], { stroke: ORG, fill: "#fff7ed" });
  });
S(8, "hub-text-in-result", "W-24", "Within's text is added to the vendor's tool result",
  "With the hubs option on, a sentence written on Within's side is added to the vendor's own result, and the AI repeats it.",
  `Real Claude repeated the sentence in ${U.hubRelayed} of ${U.hubRuns} runs and opened the hub ${U.hubOpened} times`,
  (p) => {
    const on = E("N8", "on.content");
    bx(p, 40, 120, 400, 110, "Hubs off", [`the result: "${E("N8", "off.content[0]")}"`], { stroke: GRN, fill: "#f3faf6" });
    bx(p, 480, 120, 440, 130, "Hubs on", [`"${on[0]}"`, `"${on[1]}"`], { stroke: RED, fill: "#fff1f0", cls: "pulse" });
    p.text(498, 224, "← written on Within's side", { size: 15, hand: true, color: RED, weight: 700 });
    p.rect(40, 290, 880, 96, { fill: "#fff" });
    p.text(56, 318, `Real Claude (Haiku and Sonnet), hubs on, ${U.hubRuns} runs:`, { size: 14, weight: 700 });
    p.text(56, 344, `repeated the sentence to the customer: ${U.hubRelayed} of ${U.hubRuns}, including ${U.hubRelayedH2} of ${U.hubRunsH2} where told not to`, { size: 13.5, maxW: 840 });
    p.text(56, 368, `opened the hub by itself: ${U.hubOpened} of ${U.hubRuns}. These runs were made on 2026-11-21.`, { size: 13.5, maxW: 840 });
  });

// ============ What leaves the vendor's server
S(9, "unwrapped-tool-reports", "W-09", "A tool the vendor did not wrap still reports",
  "The docs say to wrap the tools Within should see. The SDK hooks every tool and reports one when a goal is filled in.",
  `Without a goal text ${E("C7", "reportsWithoutGoal")} reports left; with a goal text ${E("C7", "reportsWithGoal")} did`,
  (p) => {
    bx(p, 40, 120, 380, 100, "An unwrapped tool", ["the vendor did not wrap it, as the docs allow"], { size: 14.5 });
    arr(p, 150, 222, 150, 280, GRN); arr(p, 310, 222, 400, 280, RED);
    bx(p, 40, 284, 250, 90, "No goal text", [`${E("C7", "reportsWithoutGoal")} reports to Within`], { stroke: GRN, fill: "#f3faf6" });
    bx(p, 330, 284, 280, 90, "A model-written goal text", [`${E("C7", "reportsWithGoal")} report to Within`], { stroke: RED, fill: "#fff1f0", cls: "pulse" });
    bx(p, 650, 120, 270, 254, "What can go with it", [`argument preview:`, `"${trunc(E("C7", "argumentPreviewForUnwrapped"), 30)}"`, "(with argument capture on)"], { stroke: RED, fill: "#fff1f0", size: 14 });
  });
S(10, "goal-text-gap", "W-10", "The goal text goes out with private details in it",
  "The goal text the model writes goes to Within by default. The filter hides some details and lets the rest through.",
  `${R.C2.evidence.table.filter((t) => t.survived).length} of ${R.C2.evidence.table.length} kinds of detail went out unredacted`,
  (p) => {
    const t = E("C2", "table"), kept = t.filter((x) => !x.survived), out = t.filter((x) => x.survived);
    p.rect(40, 106, 880, 46, { fill: "#fff" }); p.text(56, 126, `By default the goal text is sent: "${trunc(E("C1", "mcpIntent"), 60)}"`, { size: 14, maxW: 840 }); p.text(56, 144, `We put ${t.length} kinds of private detail into one goal text and read what arrived.`, { size: 12, color: MUTE });
    p.text(40, 182, `Hidden (${kept.length})`, { size: 14.5, weight: 700, color: GRN }); p.text(480, 182, `Went out unredacted (${out.length})`, { size: 14.5, weight: 700, color: RED });
    let x = 40, y = 196; kept.forEach((k) => { const w = k.kind.length * 6.8 + 16; if (x + w > 450) { x = 40; y += 26; } p.chip(x, y, k.kind, GRN, { size: 12 }); x += w + 8; });
    x = 480; y = 196; out.forEach((k) => { const w = k.kind.length * 6.8 + 16; if (x + w > 920) { x = 480; y += 26; } p.chip(x, y, k.kind, RED, { size: 12 }); x += w + 8; });
    note(p, 40, 400, "The docs table lists what the filter hides; the goal text itself is not listed as something that leaves.", MUTE, 12.5);
  });
S(11, "whole-question-sent", "W-11", "The customer's whole question goes to Within",
  "When the customer asks Within a question, the full text is sent. The filter that hides emails elsewhere does not run.",
  `A question with a name, phone number, email and card: all four reached Within as typed`,
  (p) => {
    p.rect(40, 110, 880, 70, { fill: "#fff" }); p.text(56, 136, `"${trunc(E("C10", "question"), 100)}"`, { size: 13.5, hand: true, maxW: 840 }); p.text(56, 160, `fields in the request to Within: ${E("C10", "keys").join(", ")}`, { size: 12.5, color: MUTE, maxW: 840 });
    arr(p, 480, 182, 480, 232, RED);
    const ks = [["name", "nameSurvived"], ["phone", "phoneSurvived"], ["email", "emailSurvived"], ["card", "cardSurvived"]];
    ks.forEach(([n, k], i) => bx(p, 40 + i * 224, 238, 208, 90, n, [E("C10", k) ? "arrived as typed" : "hidden"], { stroke: E("C10", k) ? RED : GRN, fill: E("C10", k) ? "#fff1f0" : "#f3faf6" }));
    note(p, 40, 362, "Check C10. The question is sent so a rep can answer it; the docs do not say it is sent unredacted.", MUTE, 13);
  });
S(12, "errors-carry-details", "W-12", "Error messages carry private details to Within",
  "With default settings, the text of an error the vendor's tool throws or returns is reported. Only the email is hidden.",
  `In the thrown and in the returned error, the phone number and the name arrived; the email was hidden`,
  (p) => {
    [["A thrown error", "thrown"], ["A returned error (isError)", "returned"]].forEach(([title, k], i) => {
      const e = E("C3", k), x = 40 + i * 450;
      bx(p, x, 120, 430, 230, title, [`sent as: "${trunc(e.error, 44)}"`], { size: 14.5 });
      p.chip(x + 14, 200, "phone: " + (e.phone ? "arrived" : "hidden"), e.phone ? RED : GRN, { size: 13 }); p.chip(x + 14, 232, "name: " + (e.name ? "arrived" : "hidden"), e.name ? RED : GRN, { size: 13 }); p.chip(x + 14, 264, "email: " + (e.email ? "arrived" : "hidden"), e.email ? RED : GRN, { size: 13 });
    });
    note(p, 40, 392, `Check C3, with argument capture ${E("C3", "captureArguments") ? "on" : "off"}.`, MUTE, 13);
  });
S(13, "results-and-secrets", "W-13", "Tool results leave too, and some secrets slip through",
  "With argument capture on, tool results go to Within, and the filter's list of secret argument names misses several.",
  `${E("C6", "leaked").length} of ${E("C6", "tested").length} secret-looking argument names reached Within`,
  (p) => {
    bx(p, 40, 120, 420, 120, "The tool's result is reported", [`"${trunc(E("C4", "resultText"), 48)}"`, `argument preview: "${trunc(E("C4", "argumentPreview"), 40)}"`], { stroke: RED, fill: "#fff1f0", size: 14 });
    p.text(500, 140, `Argument names tested: ${E("C6", "tested").length}`, { size: 14.5, weight: 700 });
    p.text(500, 162, `Values that reached Within (${E("C6", "leaked").length}):`, { size: 13.5, color: RED, weight: 700 });
    let x = 500, y = 174; E("C6", "leaked").forEach((k) => { const w = k.length * 7.2 + 16; if (x + w > 920) { x = 500; y += 26; } p.chip(x, y, k, RED, { size: 12.5 }); x += w + 8; });
    note(p, 40, 300, "Checks C4 and C6, with argument capture on. Names like password and token were hidden; these were not.", MUTE, 13);
  });
S(14, "login-token-sent", "W-21", "The customer's login token is sent to Within",
  "With the new identity option on, the signed login token of the customer travels to Within with every tool call.",
  `With the option on the token was sent: ${E("N1", "withIdentity.authTokenSent")}. By default: ${E("N1", "byDefault.authTokenSent")}`,
  (p) => {
    bx(p, 40, 120, 250, 100, "The customer's call", ["carries a signed login token"], { size: 14 });
    arr(p, 292, 170, 400, 170, ORG);
    bx(p, 404, 100, 270, 140, "identity option on", [`fields sent: ${E("N1", "withIdentity.fieldsSent").length}`, `authToken: ${E("N1", "withIdentity.authTokenSent") ? "yes, as received" : "no"}`], { stroke: RED, fill: "#fff1f0", cls: "pulse" });
    arr(p, 676, 170, 770, 170, RED);
    bx(p, 774, 130, 146, 80, "Within", ["holds a token"], { size: 14 });
    bx(p, 404, 270, 270, 90, "identity option off", [`authToken sent: ${E("N1", "byDefault.authTokenSent")}`], { stroke: GRN, fill: "#f3faf6" });
    note(p, 40, 392, "Within's docs list the raw bearer token under what stays on the vendor's server. Whether Within's server verifies it is not visible.", MUTE, 12.5);
  });
S(15, "report-void-default", "W-22", "report_void is on and sends the customer's words",
  "Every install adds a tool, report_void, for the AI to use when it cannot help. What the AI writes goes out unredacted.",
  `In our test the phone, name and email all arrived; real Claude wrote ${U.allNames} names, ${U.allPhones} phones and ${U.allEmails} emails in ${U.allVoidCalls} calls`,
  (p) => {
    bx(p, 40, 120, 270, 110, "report_void", [`listed to the AI by default: ${E("N5", "toolListedByDefault")}`], { stroke: ORG, fill: "#fff7ed" });
    arr(p, 312, 175, 420, 175, RED);
    bx(p, 424, 100, 496, 150, "In the check (N5), what the AI wrote", [`"${trunc(E("N5", "voidAsked"), 62)}"`, `phone: ${E("N5", "leaked.phone") ? "arrived" : "hidden"}   name: ${E("N5", "leaked.name") ? "arrived" : "hidden"}   email: ${E("N5", "leaked.email") ? "arrived" : "hidden"}`], { stroke: RED, fill: "#fff1f0" });
    p.rect(40, 290, 880, 86, { fill: "#fff" });
    p.text(56, 318, "Real Claude (Haiku and Sonnet), questions that held a name, a phone number and an email:", { size: 13.5, weight: 700, maxW: 840 });
    p.text(56, 344, `${U.allVoidCalls} calls; the name appeared in ${U.allNames}, the phone in ${U.allPhones}, the email in ${U.allEmails}. Every phrase was a short topic.`, { size: 13.5, maxW: 840 });
    p.text(56, 366, `The tool was used in ${U.voidRuns} of ${U.totalRuns} ordinary Haiku runs and ${U.sVoidRuns} of ${U.sTotalRuns} Sonnet runs.`, { size: 13, color: MUTE, maxW: 840 });
  });
S(16, "app-name-fallback", "W-23", "A browser's user-agent text is sent as the app name",
  "If the AI app does not report its name, the SDK sends the first 80 characters of the user-agent text as its name.",
  `The app named itself "${E("N4", "viaInit.hostName")}" in one run; in the other, ${E("N4", "viaUa.hostName").length} characters of user-agent text were sent`,
  (p) => {
    bx(p, 40, 120, 420, 120, "The app reports itself", [`hostName: "${E("N4", "viaInit.hostName")}"`, `detected by: ${E("N4", "viaInit.hostDetectedBy")}`], { stroke: GRN, fill: "#f3faf6" });
    bx(p, 500, 120, 420, 150, "Only a browser's user-agent text", [`hostName: "${trunc(E("N4", "viaUa.hostName"), 38)}"`, `${E("N4", "viaUa.hostName").length} characters, copied from the header`], { stroke: RED, fill: "#fff1f0", cls: "pulse" });
    note(p, 40, 320, "Check N4. The user-agent text can carry the visitor's operating system and browser version.", MUTE, 13);
  });

// ============ Docs say one thing, the package does another
S(17, "instructions-replaced", "W-15", "A banned phrase replaces all the vendor's instructions",
  "The docs say a banned phrase replaces one paragraph. The code replaces all of the vendor's instructions.",
  `Both vendor paragraphs were gone; the result equals Within's ${fmt(E("D1", "length"))}-character text`,
  (p) => {
    bx(p, 40, 120, 250, 100, "The vendor's instructions", ["paragraph 1", "paragraph 2 (banned phrase)"], { size: 14 });
    arr(p, 292, 170, 400, 170, RED);
    bx(p, 404, 110, 516, 120, "What the model sees", [`paragraph 1 kept: ${E("D1", "paragraph1Kept")}`, `paragraph 2 kept: ${E("D1", "paragraph2Kept")}`, `equals Within's text (${fmt(E("D1", "length"))} characters): ${E("D1", "equalsWithinText")}`], { stroke: RED, fill: "#fff1f0", cls: "pulse" });
    p.text(40, 270, "Phrases that trigger the replacement, all confirmed:", { size: 13.5, weight: 700 });
    let x = 40; E("D2", "rows").forEach((r) => { const w = r.phrase.length * 6.6 + 16; p.chip(x, 282, r.phrase, r.replaced ? RED : GRN, { size: 11.5 }); x += w + 6; });
    note(p, 40, 340, "Checks D1 to D3. Normal vendor instructions stay first when no banned phrase is present.", MUTE, 13);
  });
S(18, "silent-failures", "W-16", "A wrong key or a missing address fails silently",
  "With a rejected key or a blank setting, the server runs and nothing tells the vendor that Within gets nothing.",
  `A wrong key left ${E("A4", "logLines").length} log lines; a key of only spaces was accepted`,
  (p) => {
    bx(p, 40, 120, 280, 110, "A wrong key", [`requests made: ${E("A4", "requests")}`, `log lines written: ${E("A4", "logLines").length}`], { stroke: RED, fill: "#fff1f0" });
    bx(p, 340, 120, 280, 110, "No key, or an empty key", [`missing: ${E("A10", "missing").replace("threw ", "threw ")}`, `empty: ${E("A10", "empty")}`], { stroke: GRN, fill: "#f3faf6" });
    bx(p, 640, 120, 280, 110, "A key of only spaces", [E("A10", "spaces")], { stroke: RED, fill: "#fff1f0", cls: "pulse" });
    bx(p, 40, 262, 880, 90, "Which addresses the SDK contacted", [E("A9", "urlsContacted").join("   "), `log lines: ${E("A9", "logLines")}`], { size: 14, stroke: INK });
    note(p, 40, 384, "Checks A4, A9 and A10. A missing key stops start-up with an error; the other cases do not.", MUTE, 13);
  });
S(19, "unused-address-lists", "W-17", "Two lists of private addresses are never used",
  "The SDK builds lists of private-network addresses, as if to refuse them, and then never checks an address against them.",
  `Lists defined: ${E("F5", "defined")}; lists used: ${E("F5", "used")}`,
  (p) => {
    bx(p, 40, 130, 400, 120, "Defined in the code", [`${E("F5", "defined")} lists of private-network addresses`], { stroke: BLU, fill: "#eef4fb" }); stat(p, 56, 232, `${E("F5", "defined")} defined`, BLU);
    bx(p, 520, 130, 400, 120, "Checked against", ["the address of any request"], { stroke: RED, fill: "#fff1f0" }); stat(p, 536, 232, `${E("F5", "used")} used`, RED);
    note(p, 40, 300, "Check F5. A list that is built and never read gives a reader the wrong idea about what is blocked.", MUTE, 13.5);
  });

// ============ Design questions for Within's team
S(20, "consent-rests-on-the-ai", "W-18", "Consent rests on the AI, not on the SDK",
  "The SDK forwards an accept without checking that the customer chose it, so everything depends on what the model decides.",
  `An accept with only a session id was ${E("E1", "status")}; an offer never shown was still forwarded`,
  (p) => {
    bx(p, 40, 120, 280, 120, "An accept call", [`body: ${Object.keys(E("E1", "acceptBody")).join(", ")}`, `status: ${E("E1", "status")}`], { stroke: RED, fill: "#fff1f0" });
    bx(p, 340, 120, 280, 120, "confirm_assistance", [`listed to the AI: ${E("E2", "confirm_assistance.listedToModel")}`], { stroke: ORG, fill: "#fff7ed" });
    bx(p, 640, 120, 280, 120, "An offer never shown", [`forwarded: ${E("E3", "forwarded")}`, trunc(E("E3", "path"), 36)], { stroke: RED, fill: "#fff1f0" });
    p.rect(40, 270, 880, 100, { fill: "#fff" });
    p.text(56, 296, `Real Claude, ${U.consHaikuRuns + U.consSonnetRuns} runs with an offer waiting: the accept tool was called ${U.consHaikuConfirm + U.consSonnetConfirm} times.`, { size: 14, weight: 700, maxW: 840 });
    p.text(56, 322, "So in practice the model declined. The SDK itself does not stop it from accepting.", { size: 13.5, maxW: 840 });
    note(p, 56, 348, "Checks E1 to E3, and real-Claude runs from 2026-11-21.", MUTE, 12.5);
  });
S(21, "no-session-no-offer", "W-19", "Without sessions, an offer cannot find the customer",
  "The SDK keeps one id per connection. A server that opens a new one per request cannot be found again by a rep.",
  `Inside one connection the id stayed the same: ${E("C9", "sameInsideConnection")}; across connections it was different ${E("C9", "distinctAcrossConnections")} times`,
  (p) => {
    bx(p, 40, 120, 400, 120, "Inside one connection", [`same id every call: ${E("C9", "sameInsideConnection")}`], { stroke: GRN, fill: "#f3faf6" });
    bx(p, 480, 120, 440, 120, "Three separate connections", [`${E("C9", "distinctAcrossConnections")} different ids`], { stroke: RED, fill: "#fff1f0", cls: "pulse" });
    for (let i = 0; i < 3; i++) p.chip(500 + i * 130, 198, `id ${i + 1}`, RED, { size: 13 });
    note(p, 40, 290, "Check C9. A stateless server, which opens a connection for each request, gets a new id each time.", MUTE, 13.5);
  });
S(22, "doctor-misses-w04", "W-25", "The doctor command misses a removed context input",
  "The doctor command says the tools carry the context field, even when the SDK removed the vendor's own context input.",
  `The doctor exited with ${E("N7", "exit")} and printed that Within is installed`,
  (p) => {
    bx(p, 40, 110, 880, 150, "What the doctor command printed", E("N7", "output").split("\n").filter((l) => l.trim()).slice(0, 5).map((l) => trunc(l, 108)), { size: 14, stroke: ORG, fill: "#fff7ed" });
    bx(p, 40, 290, 880, 80, "What it does not check", ["whether a tool's own context input was removed by the SDK (finding W-04)"], { stroke: RED, fill: "#fff1f0" });
  });
S(23, "hub-card-app-only", "W-26", "hub_card is app-only by label, not by lock",
  "The hub_card tool is hidden from the AI only by a label. Any client that sends a call to it directly gets through.",
  `hub_card visibility: ${E("N9", "hubCardVisibility").join(", ")}; a direct call reached the send route: ${E("N9", "sendReached")}`,
  (p) => {
    bx(p, 40, 120, 400, 120, "hub_card", [`visibility: ${E("N9", "hubCardVisibility").join(", ")}`, "meant for the app, not the AI"], { stroke: BLU, fill: "#eef4fb" });
    bx(p, 480, 120, 440, 120, "open_hub", [`visibility: ${E("N9", "openHubVisibility").join(", ")}`], { stroke: GRN, fill: "#f3faf6" });
    bx(p, 40, 270, 880, 90, "A direct call to hub_card", [`reached the send route: ${E("N9", "sendReached")}; body fields: ${E("N9", "sendBodyFields").join(", ")}`, `Real Claude called hub_card ${U.hubCardCalls} times in ${U.hubRuns} runs.`], { stroke: RED, fill: "#fff1f0", size: 14 });
  });

// ============ How the AI behaves
S(24, "comparison-false-alarm", "W-20", "A small model treats a comparison as a sales question",
  `The trigger list says "a competitive comparison". Asked to compare two of its records, Haiku sometimes called Within.`,
  `Haiku sent the comparison to Within in ${U.x1New} runs; with one clarifying phrase, ${U.x1Patched}; Sonnet, ${U.x1SonnetNew}`,
  (p) => {
    const w = 360, n = U.x1NewC / U.x1NewN, q = U.x1PatchedC / U.x1PatchedN;
    p.text(40, 128, "How often Haiku sent \"Compare Ledgerly and Paywise\" to Within", { size: 14.5, weight: 700 });
    p.rect(40, 150, w + 2, 36, { fill: "#fff" }); p.rect(41, 151, Math.max(3, w * n), 34, { fill: RED, stroke: "none", sw: 0, cls: "growx" }); p.text(40 + w + 14, 175, `unpatched wording: ${U.x1New}`, { size: 15, hand: true, weight: 700, color: RED });
    p.rect(40, 200, w + 2, 36, { fill: "#fff" }); p.rect(41, 201, Math.max(3, w * q), 34, { fill: GRN, stroke: "none", sw: 0, cls: "growx" }); p.text(40 + w + 14, 225, `with the clarifying phrase (P11): ${U.x1Patched}`, { size: 15, hand: true, weight: 700, color: GRN });
    p.text(40, 266, `Real competitor questions with the phrase added: ${U.x2Patched} still went to Within. Sonnet, unpatched: ${U.x1SonnetNew}.`, { size: 13.5, maxW: 880 });
    p.rect(40, 296, 880, 70, { fill: "#fff" }); p.text(56, 322, `Fisher exact p = ${U.x1PatchedP} for patched against unpatched. Three same-day batches of 10 runs.`, { size: 13.5, maxW: 840 });
    p.text(56, 346, "Haiku and Sonnet runs from 2026-11-20 and 2026-11-21, on the file npm serves today.", { size: 12.5, color: MUTE, maxW: 840 });
  });

// ============ one tool call through the SDK, with every finding marked
{
  const pen = new Pen("flow");
  const sevOf = Object.fromEntries(src.findings.map((f) => [f.id, f.severity]));
  const mark = (x, y, id) => pen.pill(x, y, id, SEV[sevOf[id] ?? fail(`unknown finding ${id}`)], { size: 11 });
  const step = (y, n, title, line, ids) => { pen.rect(404, y, 420, 62, { fill: "#fff" }); pen.text(416, y + 24, `${n}  ${title}`, { size: 14, weight: 700, maxW: 250 }); pen.text(416, y + 46, line, { size: 12, color: MUTE, maxW: 396 }); ids.forEach((id, i) => mark(744 - i * 64, y + 8, id)); };
  pen.rect(24, 150, 150, 70, { fill: "#fff" }); pen.text(36, 180, ["Customer's AI", "assistant"], { size: 14, weight: 600 });
  pen.rect(214, 150, 150, 70, { fill: "#fff" }); pen.text(226, 180, ["Vendor's MCP", "server and tool"], { size: 14, weight: 600 });
  pen.line(176, 185, 212, 185, { arrow: true, color: MUTE });
  pen.rect(392, 40, 444, 478, { fill: "#eef4fb", stroke: BLU, sw: 2, dash: "8 6" }); pen.text(408, 64, "@getwithin/sdk 0.4.0, loaded inside the vendor's server", { size: 14, weight: 700, color: BLU });
  step(78, "1", "Start-up", "instructions, tools, report_void, hubs, patched tools", ["W-15", "W-22", "W-04"]);
  step(152, "2", "The call", "the vendor's tool runs; unwrapped tools still report", ["W-05", "W-09"]);
  step(226, "3", "The report", "goal text, arguments, results, identity, host name", ["W-10", "W-21", "W-23"]);
  step(300, "4", "The filter", "name list, whole-value patterns, email pattern", ["W-13", "W-12", "W-08"]);
  step(374, "5", "Within's reply", "waits up to 5 s; adds offer, text, status to the result", ["W-24", "W-03", "W-02"]);
  pen.rect(404, 450, 200, 54, { fill: "#fff" }); pen.text(414, 472, "Offers and consent", { size: 13, weight: 700 }); pen.text(414, 490, "accept, confirm, hub_card", { size: 11, color: MUTE, maxW: 184 }); mark(530, 456, "W-18");
  pen.rect(620, 450, 204, 54, { fill: "#fff" }); pen.text(630, 472, "Start-up checks", { size: 13, weight: 700 }); pen.text(630, 490, "keys, address, doctor", { size: 11, color: MUTE, maxW: 186 }); mark(760, 456, "W-16");
  pen.rect(870, 180, 80, 110, { fill: "#fff", stroke: BLU, sw: 2 }); pen.text(910, 228, "Within's", { size: 13, anchor: "middle", weight: 700 }); pen.text(910, 246, "service", { size: 13, anchor: "middle", weight: 700 });
  pen.line(826, 411, 910, 411, { arrow: true, color: ORG, cls: "flow" }); pen.line(910, 408, 910, 294, { arrow: true, color: ORG, cls: "flow" });
  pen.text(24, 300, ["Ten more findings sit", "elsewhere: see the map", "and the report."], { size: 13, hand: true, color: RED });
  pen.text(24, 470, "Colour of a W-number = severity:", { size: 12, color: MUTE });
  [["High", RED], ["Medium", ORG], ["Low", BLU]].forEach(([n, c], i) => pen.pill(24 + i * 78, 482, n, c, { size: 11 }));
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 980 540" role="img" aria-label="One tool call through the Within SDK, with some findings marked">`,
    `<title>One tool call through the Within SDK, with some findings marked</title><defs>${FILTER}<style>${CSS}</style></defs>`,
    `<rect width="980" height="540" fill="${PAPER}"/>`, `<g filter="url(#wob)">`, pen.html(), `</g>`, `</svg>`].join("\n");
  fs.writeFileSync(path.join(root, "docs", "flow.svg"), svg);
}

if (tooWide.length) fail(`text wider than its box:\n${tooWide.join("\n")}`);
const ids = src.findings.map((f) => f.id).sort(), got = sketches.map((s) => s.id).sort();
if (JSON.stringify(ids) !== JSON.stringify(got)) fail(`sketches ${got.join(",")} do not match findings ${ids.join(",")}`);
const dir = path.join(root, "docs", "diagrams");
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (f.endsWith(".svg")) fs.unlinkSync(path.join(dir, f));
for (const s of sketches) fs.writeFileSync(path.join(dir, s.file), s.svg);
fs.writeFileSync(path.join(here, "sketches.json"), JSON.stringify(Object.fromEntries(sketches.map((s) => [s.id, { file: `diagrams/${s.file}`, title: s.title }])), null, 1) + "\n");
console.log(`drew ${sketches.length} sketches and flow.svg`);
