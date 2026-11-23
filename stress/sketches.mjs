// Draws the hand-drawn, animated sketches for within-sdk 1.0.4:
//   ../docs/diagrams/01-... to 10-...   one sketch per finding
//   ../docs/flow.svg                     the journey of one tool call, with every finding marked
// Every number on a sketch is read from results/sdk-1.0.4.json or results/patched-1.0.4.json, and the script stops if one
// is missing, if a sketch does not match a finding in findings.json, or if a line of text is wider than its box.
//   node sketches.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fail = (m) => { throw new Error(m); };
const tooWide = [];
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(here, p), "utf8"));
const stock = rd("results/sdk-1.0.4.json"), patched = rd("results/patched-1.0.4.json"), src = rd("findings.json");
if (stock.meta.sdk.version !== "1.0.4" || patched.meta.sdk.version !== "1.0.4") fail("results are not for 1.0.4");
const byId = (d) => Object.fromEntries(d.results.map((r) => [r.id, r]));
const RS = byId(stock), RP = byId(patched);
const dig = (o, p) => p.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce((a, k) => (a == null ? undefined : a[k]), o);
const get = (set, id, p) => { const v = dig(set[id]?.evidence, p); if (v === undefined || v === null) fail(`missing evidence ${id}.${p}`); return v; };
const S = (id, p) => get(RS, id, p), P = (id, p) => get(RP, id, p);
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
    fo.rect(490, 446, 430, 88, { fill: "#f3f7fd", stroke: BLU, sw: 1.8 });
    fo.text(504, 465, "What Within should change", { size: 12.5, weight: 700, color: BLU });
    fo.text(504, 482, wrap(o.within, 404, 12.5, pen.name), { size: 12.5 });
  }
  return [...head, `<g filter="url(#wob)">`, pen.html(), `</g>`, t.html(), `<g filter="url(#wob)">`, fo.html(), `</g>`, `</svg>`].join("\n");
}

const sketches = [];
const sketch = (n, slug, id, sev, title, sub, alt, vendor, within, draw) => { const pen = new Pen(slug); draw(pen); sketches.push({ file: `${String(n).padStart(2, "0")}-${slug}.svg`, id, title, svg: frame(pen, { id, sev, title, sub, alt, vendor, within }) }); };

// ============ 1 · W-01 the freeze
{
  const out = Array.from({ length: 6 }, (_, i) => S("C8", `out[${i}].maxEventLoopStallMs`)), call = S("C8", "out[3].callMs");
  const sizes = [10000, 25000, 50000, 100000];
  sketch(1, "freeze", "W-01", "High", "One long run of letters freezes the whole server",
    `The vendor's tool answered in about ${call} ms. The freeze comes after, while the event is cleaned.`,
    `A chart of how long the server froze for 10,000 to 100,000 unbroken letters, from ${fmt(out[0])} ms to ${fmt(out[3])} ms`,
    `Own redaction function that cuts to 2,000 characters first: ${fmt(S("M1", "stock.maxEventLoopStallMs"))} ms down to ${S("M1", "cut.maxEventLoopStallMs")} ms.`,
    `Cut the text before the email pattern runs (P1): ${P("C8", "out[3].maxEventLoopStallMs")} ms at 100,000 letters.`,
    (p) => {
      p.rect(40, 120, 250, 64, { fill: "#fff" }); p.text(56, 146, ["One argument:", "100,000 letters, no spaces"], { size: 14, maxW: 220 });
      p.line(165, 186, 165, 232, { arrow: true, color: MUTE, cls: "flow" });
      p.rect(40, 236, 250, 78, { fill: "#fff1f0", stroke: RED, sw: 2.4, cls: "pulse" });
      p.text(56, 262, ["The email pattern scans", "the whole text first"], { size: 14, weight: 600, maxW: 220 });
      p.text(56, 303, "then cuts it to the size limit", { size: 12, color: MUTE, maxW: 224 });
      p.line(165, 316, 165, 362, { arrow: true, color: RED, cls: "flow" });
      p.rect(40, 366, 250, 62, { fill: "#fff" }); p.text(56, 392, ["The whole process stops:", "no customer is answered"], { size: 14, maxW: 220 });
      // chart
      const base = 392, top = 150, max = out[3], bw = 74, xs = [380, 480, 580, 680];
      p.line(360, base, 930, base, { color: INK, sw: 2.2 });
      p.line(360, base, 360, top - 14, { color: INK, sw: 2.2 });
      p.text(366, top - 22, "How long the server froze (ms)", { size: 13, color: MUTE, maxW: 300 });
      xs.forEach((x, i) => {
        const h = Math.max(4, ((base - top) * out[i]) / max);
        p.rect(x, base - h, bw, h, { fill: i === 3 ? RED : ORG, stroke: INK, sw: 1.6, cls: "grow", style: `animation-delay:${i * 0.18}s` });
        p.text(x + bw / 2, base - h - 8, fmt(out[i]), { size: 15, anchor: "middle", weight: 700 });
        p.text(x + bw / 2, base + 20, fmt(sizes[i]), { size: 12.5, anchor: "middle", color: MUTE });
      });
      p.text(380, base + 38, "unbroken letters in one argument", { size: 12.5, color: MUTE });
      const wh = Math.max(4, ((base - top) * out[4]) / max);
      p.rect(800, base - wh, bw, wh, { fill: GRN, stroke: INK, sw: 1.6, cls: "grow", style: "animation-delay:.8s" });
      p.text(837, base - wh - 8, fmt(out[4]), { size: 15, anchor: "middle", weight: 700 });
      p.text(837, base + 20, "100,000", { size: 12.5, anchor: "middle", color: MUTE });
      p.text(837, base + 36, "ordinary words", { size: 12.5, anchor: "middle", color: MUTE });
      p.text(396, 196, "doubling the length", { size: 17, hand: true, color: RED });
      p.text(396, 218, "about quadruples the time", { size: 17, hand: true, color: RED });
    });
}

// ============ 2 · W-02 details inside a sentence
{
  const cols = [["goal text", S("C2", "survivors")], ["a free-text argument", S("C5", "survivors")], ["an error message", S("C3", "survivors")], ["the tool's result", S("C4", "survivors")]];
  const hiddenGoal = (S("C2", "ctx").match(/\[redacted\]/g) ?? []).length;
  sketch(2, "details-inside-a-sentence", "W-02", "High", "Private details inside a sentence are not hidden",
    "One sentence held an email, phone, card, keys, addresses and a name. These kinds went out as written.",
    `Four columns showing which kinds of private detail went to Within as written: goal text ${cols[0][1].length}, argument ${cols[1][1].length}, error message ${cols[2][1].length}, tool result ${cols[3][1].length}`,
    `Own redaction function for digit runs, keys, web and IP addresses: ${S("M2", "survivors").join(" and ")} still go out.`,
    "Find phone, social security and card numbers inside text, not only as the whole value.",
    (p) => {
      p.rect(40, 100, 880, 52, { fill: "#fff" });
      p.text(56, 122, "\"Customer … email … phone … ssn … card … key … page … host … lives at …\"", { size: 14, hand: true, maxW: 840 });
      p.text(56, 142, "one customer sentence, sent through the vendor's tool", { size: 12, color: MUTE });
      cols.forEach(([name, kinds], c) => {
        const x = 40 + c * 224, w = 208;
        p.line(x + w / 2, 154, x + w / 2, 176, { arrow: true, color: MUTE });
        p.rect(x, 180, w, 44, { fill: "#fff1f0", stroke: RED, sw: 2 });
        p.text(x + 12, 200, name, { size: 14, weight: 700, maxW: w - 20 });
        p.text(x + 12, 216, `${kinds.length} kinds went out as written`, { size: 12, color: RED, maxW: w - 20 });
        kinds.forEach((k, i) => p.chip(x + 6, 230 + i * 20, k, RED, { size: 11 }));
        if (c === 1) { p.chip(x + 6, 230 + kinds.length * 20 + 8, "email, bearer: hidden", GRN, { size: 11 }); }
        if (c === 0) { p.chip(x + 6, 230 + kinds.length * 20 + 8, `${hiddenGoal} details hidden`, GRN, { size: 11 }); }
      });
    });
}

// ============ 3 · W-03 sent by default
{
  const fields = S("C1", "fields"), n0 = S("Z2b", "n"), nboth = S("Z2", "n");
  sketch(3, "sent-by-default", "W-03", "Medium", "Arguments and results go to Within by default",
    "Every tool call is reported with what was asked and what the tool answered. The only off switch stops all reporting.",
    `One reported event with ${fields.length} fields, and two switches: tracing off sends ${n0} events, the other two switches off still send ${nboth}`,
    "Mask what leaves with `redactSensitiveInformation`, or set `enableTracing` to false (stops everything).",
    "Make argument and result capture opt-in, and say in the README what leaves by default.",
    (p) => {
      p.rect(40, 120, 190, 70, { fill: "#fff" }); p.text(54, 146, ["The vendor's tool", "search_companies"], { size: 14, maxW: 165 });
      p.text(54, 180, "query: \"acme corp\"", { size: 12, color: MUTE, maxW: 165 });
      p.line(232, 156, 330, 156, { arrow: true, color: ORG, cls: "flow" });
      p.rect(334, 108, 330, 236, { fill: "#fff", stroke: ORG, sw: 2.2 });
      p.text(348, 130, `One event: ${fields.length} fields`, { size: 14, weight: 700, maxW: 300 });
      let x = 346, y = 142;
      fields.forEach((f) => { const hot = ["parameters", "response", "userIntent"].includes(f), w = f.length * 7 + 14; if (x + w > 656) { x = 346; y += 28; } p.chip(x, y, f, hot ? RED : "#8b949e", { size: 12 }); x += w + 6; });
      p.text(348, 330, "red: what was asked and answered", { size: 12, color: RED, maxW: 306 });
      p.line(666, 216, 770, 216, { arrow: true, color: ORG, cls: "flow" });
      p.rect(774, 180, 146, 74, { fill: "#eef4fb", stroke: BLU, sw: 2 }); p.text(790, 212, "Within", { size: 18, weight: 700 }); p.text(790, 234, "gets all of it", { size: 12.5, color: MUTE });
      // switches
      p.rect(40, 360, 400, 78, { fill: "#fff" });
      p.text(54, 381, "enableTracing: false", { size: 15, weight: 700, maxW: 370 });
      p.text(54, 404, `events sent: ${n0}`, { size: 18, hand: true, color: GRN, maxW: 370 });
      p.text(54, 424, "everything stops, the analytics too", { size: 12.5, color: MUTE, maxW: 370 });
      p.rect(480, 360, 440, 78, { fill: "#fff" });
      p.text(494, 381, "the two context switches off", { size: 15, weight: 700, maxW: 410 });
      p.text(494, 404, `events sent: ${nboth}`, { size: 18, hand: true, color: RED, maxW: 410 });
      p.text(494, 424, "arguments and results still leave", { size: 12.5, color: MUTE, maxW: 410 });
    });
}

// ============ 4 · W-04 key names
{
  const kept = S("C6", "kept"), dropped = S("C6", "dropped"), keptP = P("C6", "kept");
  sketch(4, "argument-names", "W-04", "Medium", "Names like name, address and dob are sent as written",
    `We sent ${kept.length + dropped.length} differently named arguments. The package hides a value only when the name holds one of its 31 listed words.`,
    `${dropped.length} argument names were hidden and ${kept.length} were sent as written: ${kept.join(", ")}`,
    `The documented \`privacy.redactKeys\` option: with the six names listed, only ${S("M3", "kept").join(", ")} was still sent as written.`,
    `Add address, dob and birth to the list (P4): still sent as written, ${keptP.join(", ")}.`,
    (p) => {
      p.rect(40, 110, 420, 40, { fill: "#f3faf6", stroke: GRN, sw: 2 }); p.text(54, 136, `Hidden or removed: ${dropped.length}`, { size: 15, weight: 700, color: GRN });
      p.rect(500, 110, 420, 40, { fill: "#fff1f0", stroke: RED, sw: 2.4, cls: "pulse" }); p.text(514, 136, `Sent with the value as written: ${kept.length}`, { size: 15, weight: 700, color: RED });
      const place = (arr, x0, color, wide) => { let x = x0, y = 166; arr.forEach((k) => { const w = k.length * 7.2 + 18; if (x + w > x0 + wide) { x = x0; y += 36; } p.chip(x, y, k, color, { size: 14 }); x += w + 8; }); };
      place(dropped, 44, GRN, 410); place(kept, 504, RED, 410);
      p.text(500, 300, "The README says identity-like fields in parameters", { size: 15, hand: true, color: INK, maxW: 420 });
      p.text(500, 322, "are removed or redacted. These are identity-like:", { size: 15, hand: true, color: INK, maxW: 420 });
      p.text(500, 346, "name, address, dob, ip, customer", { size: 15, hand: true, color: RED, weight: 700, maxW: 420 });
      p.text(44, 300, "password, token, api_key, secret, email, ssn, phone …", { size: 13, color: MUTE, maxW: 420 });
      p.text(44, 320, "the words on the list: the value is replaced.", { size: 13, color: MUTE, maxW: 420 });
    });
}

// ============ 5 · W-05 stuck queue
{
  const hung = S("A1c", "hungPosts"), waiting = S("A1c", "waiting"), ok = S("A1c", "okPosts"), mit = S("M5", "got"), pat = P("A1c", "okPosts");
  sketch(5, "stuck-queue", "W-05", "Medium", "A hung Within blocks every later report",
    "One queue, five requests at a time, and no time limit on a request. We watched 15 seconds after Within recovered.",
    `${hung} stuck requests fill the queue, ${waiting} later reports wait, and ${ok} requests reach Within in the next 15 seconds; with a 1.5 second limit ${mit} do`,
    `A \`fetch\` option with a 1.5-second limit: ${mit} requests got through after Within recovered.`,
    `A 5-second limit on every request inside the package (P2): ${pat} requests got through.`,
    (p) => {
      p.text(40, 118, "The queue: five lanes, no time limit", { size: 15, weight: 700 });
      for (let i = 0; i < hung; i++) { p.rect(40, 130 + i * 40, 330, 32, { fill: "#fff1f0", stroke: RED, sw: 1.8 }); p.text(54, 151 + i * 40, `request ${i + 1}: Within never answers`, { size: 13, maxW: 300 }); p.line(300, 146 + i * 40, 360, 146 + i * 40, { color: RED, cls: "slow", sw: 2 }); }
      p.text(40, 346, `${waiting} later reports wait behind them`, { size: 15, weight: 700, color: ORG });
      for (let i = 0; i < waiting; i++) p.rect(40 + i * 74, 358, 64, 34, { fill: "#fff7ed", stroke: ORG, sw: 1.8, cls: "bob", style: `animation-delay:${i * 0.3}s` });
      p.text(40, 414, "report", { size: 12, color: MUTE }); p.text(114, 414, "report", { size: 12, color: MUTE }); p.text(188, 414, "report", { size: 12, color: MUTE });
      // timeline right
      p.line(430, 150, 920, 150, { color: INK, sw: 2.2, arrow: true });
      p.text(430, 138, "time", { size: 13, color: MUTE });
      p.rect(430, 164, 130, 40, { fill: "#fff1f0", stroke: RED, sw: 1.8 }); p.text(442, 189, "Within hangs", { size: 13.5, weight: 600 });
      p.rect(600, 164, 150, 40, { fill: "#f3faf6", stroke: GRN, sw: 1.8 }); p.text(612, 189, "Within recovers", { size: 13.5, weight: 600 });
      p.text(600, 232, "the next 15 seconds:", { size: 13.5, color: MUTE });
      p.rect(430, 250, 490, 56, { fill: "#fff" }); p.text(446, 274, `requests that reach Within: ${ok}`, { size: 22, hand: true, color: RED, weight: 700 }); p.text(446, 296, `${waiting} later reports were waiting; the stuck ones are never abandoned`, { size: 12.5, color: MUTE, maxW: 460 });
      p.rect(430, 322, 490, 44, { fill: "#f3faf6", stroke: GRN, sw: 1.8 }); p.text(446, 350, `with a time limit on each request: ${mit} reach Within`, { size: 17, hand: true, color: GRN, weight: 700, maxW: 460 });
      p.text(430, 394, "The vendor's own calls stay fast the whole time.", { size: 13, color: MUTE });
    });
}

// ============ 6 · W-06 shutdown
{
  const plain = S("Z3", "plain.ms"), one = S("Z3", "one.ms"), two = S("Z3", "two.ms"), vend = S("M6", "ms"), pat = P("Z3", "one.ms");
  const sec = Math.round(one / 1000);
  sketch(6, "first-shutdown-ignored", "W-06", "Medium", "The first request to shut down is ignored",
    "A hosting system stops a program with the signal SIGTERM. Plain Node exits at once; with the package it does not.",
    `Plain Node exits after ${plain} ms, a server with the package was still running after ${sec} seconds, and a second signal ended it after ${fmt(two)} ms`,
    `Own handler, \`process.on('SIGTERM', () => process.exit(0))\`: the first signal ended it in ${vend} ms.`,
    `After the queue is flushed, send the signal again (P3): the first SIGTERM ended it in ${pat} ms.`,
    (p) => {
      const x0 = 200, scale = (920 - x0) / 12;
      const row = (y, label, w, color, note, noteColor) => { p.text(40, y + 22, label, { size: 14, weight: 600, maxW: 150 }); p.rect(x0, y, Math.max(8, w), 34, { fill: `${color}33`, stroke: color, sw: 2, cls: "growx" }); const nx = x0 + Math.max(8, w) + 10, inside = nx > 640; p.text(inside ? x0 + 12 : nx, y + 23, note, { size: 15, hand: true, color: noteColor, weight: 700, maxW: 700 }); };
      p.line(x0, 130, 920, 130, { color: MUTE, sw: 1.6, arrow: true }); p.text(x0, 120, "seconds after SIGTERM", { size: 12.5, color: MUTE });
      [0, 3, 6, 9, 12].forEach((s) => { p.line(x0 + s * scale, 126, x0 + s * scale, 136, { color: MUTE, sw: 1.4 }); p.text(x0 + s * scale, 152, String(s), { size: 12, color: MUTE, anchor: "middle" }); });
      row(172, "Plain Node", plain * scale / 1000, GRN, `exits after ${plain} ms`, GRN);
      row(232, "With the package", one * scale / 1000, RED, `still running after ${sec} seconds, force-killed`, RED);
      row(292, "A second signal", two * scale / 1000, ORG, `sent at 3 seconds: ends after ${fmt(two)} ms`, ORG);
      p.rect(40, 352, 880, 74, { fill: "#fff" });
      p.text(56, 378, "The package's own handler catches the first SIGTERM, waits for its queue to empty,", { size: 14.5, maxW: 840 });
      p.text(56, 400, "and does not end the program. Every update of the company's server waits for a second signal.", { size: 14.5, maxW: 840 });
    });
}

// ============ 7 · W-07 redaction function gets the key
{
  const sawKey = S("M8", "sawKey"), sawUrl = S("M8", "sawUrl"), d1 = S("M8", "delivered1"), d2 = S("M8", "delivered2"), pd = P("M8", "delivered2");
  sketch(7, "redaction-function-gets-the-key", "W-07", "Medium", "The hiding function is handed the API key and address",
    "The redaction function runs on every string except a short protected list. The key and address are not on it.",
    `The function saw the API key: ${sawKey}, and the address: ${sawUrl}. A function that replaces digit runs changed the address and ${d2} events arrived, against ${d1}`,
    "No clean vendor fix: this is the hazard of the fixes for W-01 to W-04.",
    `Protect \`apiKey\`, \`ingestBaseUrl\` and \`vendorSlug\` (P6): with a digit-replacing function, ${pd} events arrived.`,
    (p) => {
      p.rect(40, 120, 250, 150, { fill: "#fff" }); p.text(54, 144, "One event, before sending", { size: 14, weight: 700 });
      p.chip(54, 156, "apiKey", RED, { size: 13 }); p.chip(54, 186, "address events go to", RED, { size: 13 }); p.chip(54, 216, "the customer's text", "#8b949e", { size: 13 });
      p.text(54, 256, "neither red one is on the list", { size: 12, color: MUTE, maxW: 224 });
      p.line(292, 195, 372, 195, { arrow: true, color: ORG, cls: "flow" });
      p.rect(376, 130, 250, 130, { fill: "#fff7ed", stroke: ORG, sw: 2.2 }); p.text(392, 156, "The vendor's hiding", { size: 14.5, weight: 700 }); p.text(392, 176, "function", { size: 14.5, weight: 700 });
      p.text(392, 204, "replaces every digit run", { size: 13, color: MUTE }); p.text(392, 224, "(a natural way to hide phones)", { size: 13, color: MUTE });
      p.line(628, 195, 700, 195, { arrow: true, color: RED, cls: "flow" });
      p.rect(704, 120, 216, 150, { fill: "#fff1f0", stroke: RED, sw: 2.2 }); p.text(718, 146, "The address becomes", { size: 13, weight: 600 }); p.text(718, 170, "http://127.0.0.1:PORT", { size: 12.5, color: MUTE, maxW: 190 }); p.text(718, 192, "→ http://N.N.N.N:N", { size: 14, color: RED, weight: 700, maxW: 190 }); p.text(718, 226, "every send fails", { size: 17, hand: true, color: RED, weight: 700 }); p.text(718, 250, "and nobody is told", { size: 14, color: MUTE });
      p.rect(40, 296, 420, 120, { fill: "#fff" }); p.text(54, 322, "A function that changes nothing", { size: 14.5, weight: 700 }); p.text(54, 364, `${d1} events arrive`, { size: 24, hand: true, color: GRN, weight: 700 });
      p.rect(500, 296, 420, 120, { fill: "#fff" }); p.text(514, 322, "A function that replaces digit runs", { size: 14.5, weight: 700 }); p.text(514, 364, `${d2} events arrive`, { size: 24, hand: true, color: RED, weight: 700 });
      p.text(514, 396, "the failure shows only in a log file", { size: 12.5, color: MUTE });
    });
}

// ============ 8 · W-08 every tool reported
{
  const reported = S("B7", "reported");
  sketch(8, "every-tool-reported", "W-08", "Medium", "Every tool call is reported, and none can be left out",
    "track() wraps the whole server. A tool registered after track() was reported too, and no option leaves a tool out.",
    `Example: a server with three tools, one registered late. The test had one late tool, and its ${reported} call was reported to Within`,
    "No vendor option leaves one tool out. A vendor can only strip what leaves (W-02, W-03).",
    "Offer an option to leave named tools out, and say in the README that every tool is reported.",
    (p) => {
      p.rect(40, 116, 560, 300, { fill: "#eef4fb", stroke: BLU, sw: 2, dash: "8 6" }); p.text(56, 140, "The vendor's server (an example with three tools)", { size: 14.5, weight: 700, color: BLU, maxW: 530 });
      const tools = [["search_companies", "before track()"], ["get_company", "before track()"], ["export_report", "registered after track()"]];
      tools.forEach(([n, w], i) => {
        const y = 156 + i * 80;
        p.rect(60, y, 250, 62, { fill: "#fff" }); p.text(74, y + 26, n, { size: 14.5, weight: 600 }); p.text(74, y + 48, w, { size: 12, color: MUTE });
        p.line(312, y + 31, 420, y + 31, { arrow: true, color: ORG, cls: "flow" });
        p.rect(424, y + 8, 160, 46, { fill: "#fff7ed", stroke: ORG, sw: 1.8 }); p.text(438, y + 36, "reported", { size: 15, hand: true, color: ORG, weight: 700 });
      });
      p.line(602, 266, 700, 266, { arrow: true, color: ORG, cls: "flow" });
      p.rect(704, 216, 216, 100, { fill: "#eef4fb", stroke: BLU, sw: 2 }); p.text(722, 252, "Within", { size: 20, weight: 700 }); p.text(722, 278, "gets all three", { size: 13, color: MUTE });
      p.rect(640, 340, 280, 76, { fill: "#fff1f0", stroke: RED, sw: 1.8 }); p.text(654, 366, "an option to leave one out?", { size: 13.5, weight: 600, maxW: 250 }); p.text(654, 392, "none in the code or the types", { size: 15, hand: true, color: RED, weight: 700, maxW: 250 });
    });
}

// ============ 9 · W-09 silent key failure and growing log
{
  const count = S("A4", "count"), bytes = S("C12", "bytes"), lines = S("M4", "lines"), grew = S("M4", "grew");
  sketch(9, "silent-key-and-growing-log", "W-09", "Low", "A bad key shows only in a log file that only grows",
    "With no key, track() writes one warning to a file in the home folder. A rejected key gives the vendor's code no signal.",
    `A wrong key left ${count} lines in the log file and nothing in the vendor's code; the file only appends, ${fmt(bytes)} bytes from one connection and one call`,
    `The \`log\` option takes a callback: ${lines} lines went to the vendor's own code and ${grew} bytes were added to the file.`,
    "Fail loudly at start-up when no key and no exporter are set, or log to the console.",
    (p) => {
      p.rect(40, 120, 200, 72, { fill: "#fff" }); p.text(54, 146, "The vendor's code", { size: 14.5, weight: 700 }); p.text(54, 170, "result: ok, no error", { size: 13, color: GRN });
      p.rect(40, 250, 200, 72, { fill: "#fff1f0", stroke: RED, sw: 2 }); p.text(54, 276, "A wrong key", { size: 14.5, weight: 700 }); p.text(54, 300, "Within answers HTTP 401", { size: 13, color: RED });
      p.line(242, 286, 340, 250, { arrow: true, color: RED, cls: "flow" });
      p.line(142, 194, 142, 246, { color: MUTE, dash: "5 6" }); p.text(150, 224, "nothing comes back", { size: 13, hand: true, color: MUTE });
      p.rect(344, 130, 576, 190, { fill: "#fff", stroke: INK, sw: 2 }); p.text(360, 154, "~/within-sdk.log", { size: 15, weight: 700 });
      for (let i = 0; i < 6; i++) p.rect(360, 168 + i * 24, 540 - (i % 3) * 60, 16, { fill: i < count ? "#fecaca" : "#e5e7eb", stroke: "none", sw: 0, cls: "growx", style: `animation-delay:${i * 0.15}s` });
      p.text(360, 336, `${count} lines about the failed send`, { size: 14, color: RED, weight: 600 });
      p.rect(40, 360, 430, 64, { fill: "#fff" }); p.text(54, 386, "No key at all", { size: 14.5, weight: 700 }); p.text(54, 408, "one warning, the server starts and sends nothing", { size: 12.5, color: MUTE, maxW: 400 });
      p.rect(490, 360, 430, 64, { fill: "#fff7ed", stroke: ORG, sw: 1.8 }); p.text(504, 386, "The file is never rotated or capped", { size: 14.5, weight: 700 }); p.text(504, 408, `${fmt(bytes)} bytes from one connection and one call`, { size: 12.5, color: MUTE, maxW: 400 });
    });
}

// ============ 10 · W-10 required context input
{
  const req = S("B5", "required"), reqP = P("B5", "required");
  sketch(10, "required-context-input", "W-10", "Low", "Every tool gets a required context input, plus one tool",
    "After track(), each tool gains a required text, context, that asks the model for 15 to 25 words. One more tool appears.",
    `A tool's required inputs go from query to ${req.join(" and ")}; the model also sees get_more_tools; a call without context still worked`,
    "Two documented switches, `enableToolCallContext` and `enableReportMissing`, set to false leave the tool list as written.",
    `Do not mark context as required, because the server does not enforce it (P5): required becomes ${reqP.join(", ")}.`,
    (p) => {
      p.rect(40, 120, 400, 150, { fill: "#fff" }); p.text(54, 146, "The vendor's tool, as written", { size: 14.5, weight: 700 }); p.text(54, 176, "search_companies", { size: 15, weight: 600 }); p.chip(54, 192, "query  (required)", GRN, { size: 13.5 });
      p.line(442, 195, 520, 195, { arrow: true, color: ORG, cls: "flow" });
      p.rect(524, 120, 396, 150, { fill: "#fff7ed", stroke: ORG, sw: 2.2 }); p.text(538, 146, "After track()", { size: 14.5, weight: 700 }); p.text(538, 176, "search_companies", { size: 15, weight: 600 }); p.chip(538, 192, "query  (required)", GRN, { size: 13.5 }); p.chip(538, 222, "context  (required, 15 to 25 words)", RED, { size: 13.5 });
      p.rect(40, 296, 400, 120, { fill: "#fff" }); p.text(54, 322, "The model also sees one more tool", { size: 14.5, weight: 700 }); p.text(54, 350, "get_more_tools", { size: 15, weight: 600 }); p.text(54, 374, "\"check for additional tools whenever your", { size: 12.5, color: MUTE, maxW: 370 }); p.text(54, 392, "task might benefit from specialized capabilities\"", { size: 12.5, color: MUTE, maxW: 370 });
      p.rect(480, 296, 440, 120, { fill: "#fff" }); p.text(494, 322, "A call without context", { size: 14.5, weight: 700 }); p.text(494, 366, "still worked", { size: 26, hand: true, color: ORG, weight: 700 }); p.text(494, 392, "so \"required\" asks for more than the server enforces", { size: 12.5, color: MUTE, maxW: 410 });
    });
}

// ============ the journey of one tool call, with every finding marked
{
  const pen = new Pen("flow");
  const sevOf = Object.fromEntries(src.findings.map((f) => [f.id, f.severity]));
  const mark = (x, y, id) => { pen.pill(x, y, id, SEV[sevOf[id] ?? fail(`unknown finding ${id}`)], { size: 11 }); };
  const step = (y, n, title, line, ids) => {
    pen.rect(404, y, 420, 62, { fill: "#fff" }); pen.text(416, y + 24, `${n}  ${title}`, { size: 14, weight: 700, maxW: 260 }); pen.text(416, y + 46, line, { size: 12, color: MUTE, maxW: 396 });
    ids.forEach((id, i) => mark(744 - i * 64, y + 8, id));
  };
  pen.rect(24, 150, 150, 70, { fill: "#fff" }); pen.text(36, 180, ["Customer's AI", "assistant"], { size: 14, weight: 600 });
  pen.rect(214, 150, 150, 70, { fill: "#fff" }); pen.text(226, 180, ["Vendor's MCP", "server and tool"], { size: 14, weight: 600 });
  pen.line(176, 185, 212, 185, { arrow: true, color: MUTE });
  pen.rect(392, 40, 444, 478, { fill: "#eef4fb", stroke: BLU, sw: 2, dash: "8 6" }); pen.text(408, 64, "within-sdk, loaded inside the vendor's server", { size: 14, weight: 700, color: BLU });
  step(78, "1", "Tool list", "adds a required context input and a get_more_tools tool", ["W-10"]);
  step(152, "2", "Reporter", "copies each tool call, arguments and result, into an event", ["W-08", "W-03"]);
  step(226, "3", "Vendor's redaction function", "is handed every string, even the API key and the address", ["W-07"]);
  step(300, "4", "Privacy filter", "name list, whole-value patterns, email pattern on all text", ["W-04", "W-02", "W-01"]);
  step(374, "5", "Queue", "5 requests at a time, no time limit on a request", ["W-05"]);
  pen.rect(404, 450, 200, 54, { fill: "#fff" }); pen.text(414, 472, "Log file", { size: 13, weight: 700 }); pen.text(414, 490, "~/within-sdk.log, only grows", { size: 11, color: MUTE, maxW: 184 }); mark(540, 456, "W-09");
  pen.rect(620, 450, 204, 54, { fill: "#fff" }); pen.text(630, 472, "Shutdown handler", { size: 13, weight: 700 }); pen.text(630, 490, "swallows the first SIGTERM", { size: 11, color: MUTE, maxW: 186 }); mark(760, 456, "W-06");
  pen.rect(870, 180, 80, 110, { fill: "#fff", stroke: BLU, sw: 2 }); pen.text(910, 228, "Within's", { size: 13, anchor: "middle", weight: 700 }); pen.text(910, 246, "service", { size: 13, anchor: "middle", weight: 700 });
  pen.line(826, 411, 910, 411, { arrow: true, color: ORG, cls: "flow" }); pen.line(910, 408, 910, 294, { arrow: true, color: ORG, cls: "flow" });
  pen.text(24, 300, ["The vendor's tool still", "answers at once while step 4", "freezes the process: the", "freeze comes after, when", "the event is cleaned."], { size: 13, hand: true, color: RED });
  pen.text(24, 470, "Colour of a W-number = severity:", { size: 12, color: MUTE });
  [["High", RED], ["Medium", ORG], ["Low", BLU]].forEach(([n, c], i) => pen.pill(24 + i * 78, 482, n, c, { size: 11 }));
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 980 540" role="img" aria-label="A tool call's journey through within-sdk, with the ten findings marked">`,
    `<title>A tool call's journey through within-sdk, with the ten findings marked</title><defs>${FILTER}<style>${CSS}</style></defs>`,
    `<rect width="980" height="540" fill="${PAPER}"/>`, `<g filter="url(#wob)">`, pen.html(), `</g>`, `</svg>`].join("\n");
  fs.writeFileSync(path.join(root, "docs", "flow.svg"), svg);
}

if (tooWide.length) fail(`text wider than its box:\n${tooWide.join("\n")}`);
// ---- guards: one sketch per finding, in order
const ids = src.findings.map((f) => f.id).sort();
const got = sketches.map((s) => s.id).sort();
if (JSON.stringify(ids) !== JSON.stringify(got)) fail(`sketches ${got.join(",")} do not match findings ${ids.join(",")}`);
const dir = path.join(root, "docs", "diagrams");
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (f.endsWith(".svg")) fs.unlinkSync(path.join(dir, f));
for (const s of sketches) fs.writeFileSync(path.join(dir, s.file), s.svg);
fs.writeFileSync(path.join(here, "sketches.json"), JSON.stringify(Object.fromEntries(sketches.map((s) => [s.id, { file: `diagrams/${s.file}`, title: s.title }])), null, 1) + "\n");
console.log(`drew ${sketches.length} sketches and flow.svg`);
