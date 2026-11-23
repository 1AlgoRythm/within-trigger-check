// Builds the interactive map for within-sdk 1.0.4:
//   ../docs/explorer/src/*.architecture.json   the three Archify diagrams, written from the saved results
//   ../docs/explorer/*.html                    the diagrams, built with the Archify skill (skipped if it is not installed)
//   ../docs/map.html                           the clickable wrapper, from map.template.html
// Run `node sketches.mjs` first: the map opens a sketch for every finding.
//   node map.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fail = (m) => { throw new Error(m); };
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(here, p), "utf8"));
const src = rd("findings.json"), stock = rd("results/sdk-1.0.4.json"), sketches = rd("sketches.json");
const RS = Object.fromEntries(stock.results.map((r) => [r.id, r]));
if (stock.meta.sdk.version !== "1.0.4") fail("results are not for 1.0.4");
const fields = RS.C1.evidence.fields.length, version = stock.meta.sdk.version;
const F = Object.fromEntries(src.findings.map((f) => [f.id, f]));
const need = (id) => F[id] ?? fail(`no finding ${id}`);
const w = (...ids) => ids.map((id) => need(id).id).join(" · ");

const SRC = path.join(root, "docs", "explorer", "src");
fs.mkdirSync(SRC, { recursive: true });
for (const f of fs.readdirSync(SRC)) if (f.endsWith(".json")) fs.unlinkSync(path.join(SRC, f));
const node = (id, type, label, sublabel, x, y, wd = 170, h = 64) => ({ id, type, label, sublabel, pos: [x, y], size: [wd, h] });
const edge = (id, from, to, label, extra = {}) => ({ id, from, to, label, ...extra });
const write = (name, type, d) => fs.writeFileSync(path.join(SRC, `${name}.${type}.json`), JSON.stringify({ schema_version: 1, diagram_type: type, ...d }, null, 2) + "\n");

// ---- screen 1: the whole system
write("l1-within-end-to-end", "architecture", {
  meta: {
    title: "within-sdk, end to end", output: "l1-within-end-to-end.html", quality_profile: "showcase",
    views: [
      { id: "a-call", label: "A tool call", focus: ["customer", "host", "server", "sdk", "api"], note: "The customer asks, the model calls the vendor's tool, and within-sdk copies the call to Within." },
      { id: "what-leaves", label: "What leaves", focus: ["sdk", "api", "log"], note: "Only within-sdk talks to Within. It sends each tool call, arguments and result included, and writes a log file at home." },
      { id: "findings", label: "Findings", focus: ["sdk", "hosting", "log"], note: `All ${F ? Object.keys(F).length : 0} findings sit in or around the package. Open the SDK box to see where.` },
    ],
  },
  components: [
    node("customer", "external", "Customer", "asks inside chat", 30, 175, 120),
    node("host", "external", "Claude / ChatGPT", "the model and its MCP client", 250, 175, 160),
    node("server", "backend", "Vendor's MCP server", "the vendor's own tools", 500, 175),
    node("sdk", "backend", "within-sdk", `version ${version} · ${Object.keys(F).length} findings`, 500, 40),
    node("api", "cloud", "Within's service", "closed, not tested", 780, 40),
    node("log", "database", "~/within-sdk.log", `only grows · ${w("W-09")}`, 780, 175),
    node("hosting", "external", "Hosting system", `sends SIGTERM · ${w("W-06")}`, 500, 310),
  ],
  boundaries: [{ kind: "region", label: "One process, the vendor's", wraps: ["server", "sdk"] }],
  connections: [
    edge("c1", "customer", "host", "asks"),
    edge("c2", "host", "server", "calls a tool", { variant: "emphasis" }),
    edge("c3", "sdk", "server", "wraps every tool", { fromSide: "bottom", toSide: "top", labelAt: [585, 138] }),
    edge("c4", "sdk", "api", "reports each call", { variant: "emphasis" }),
    edge("c5", "server", "log", "writes lines"),
    edge("c6", "hosting", "server", "asks it to stop"),
  ],
  cards: [
    { dot: "cyan", title: "What the package does", items: ["Loaded once with track(server)", "Adds a required context input and a get_more_tools tool", "Copies every tool call, arguments and result, into an event", "Sends the event to Within through a queue"] },
    { dot: "amber", title: "What we could not see", items: ["Within's own server: what it stores or redacts after the text arrives", "The source repository, which is not public"] },
  ],
});

// ---- screen 2: inside the package
write("l2-inside-the-sdk", "architecture", {
  meta: {
    title: "Inside within-sdk", output: "l2-inside-the-sdk.html", quality_profile: "showcase",
    views: [
      { id: "start", label: "At start-up", focus: ["setup", "toollist"], note: "track(server) runs once and changes the tool list the model sees." },
      { id: "each-call", label: "On every tool call", focus: ["reporter", "redact", "privacy", "queue", "api"], note: "Five steps turn one tool call into one event sent to Within." },
      { id: "defects", label: "Where the findings sit", focus: ["toollist", "reporter", "redact", "privacy", "queue", "log", "shutdown"], note: "Each box with a W-number opens a hand-drawn sketch." },
    ],
  },
  components: [
    node("setup", "backend", "track(server)", "called once at start-up", 30, 40),
    node("toollist", "backend", "1  Tool list", `context input + get_more_tools · ${w("W-10")}`, 270, 40, 190),
    node("reporter", "backend", "2  Reporter", `copies each call · ${w("W-03", "W-08")}`, 520, 40, 190),
    node("redact", "backend", "3  Vendor's function", `handed every string · ${w("W-07")}`, 770, 40, 190),
    node("privacy", "backend", "4  Privacy filter", `${w("W-04", "W-02", "W-01")}`, 770, 175, 190),
    node("queue", "backend", "5  Queue", `5 at a time, no time limit · ${w("W-05")}`, 520, 175, 190),
    node("api", "cloud", "Within's service", "receives the event", 270, 175, 190),
    node("log", "database", "Log file", `~/within-sdk.log · ${w("W-09")}`, 520, 310, 190),
    node("shutdown", "backend", "Shutdown handler", `swallows the first SIGTERM · ${w("W-06")}`, 770, 310, 190),
  ],
  boundaries: [
    { kind: "region", label: "Once, at start-up", wraps: ["setup", "toollist"] },
    { kind: "region", label: "On every tool call", wraps: ["reporter", "redact", "privacy", "queue"] },
  ],
  connections: [
    edge("s1", "setup", "toollist", "adds fields", { variant: "emphasis", labelAt: [235, 118] }),
    edge("s2", "toollist", "reporter", "tools are wrapped", { labelAt: [490, 118] }),
    edge("s3", "reporter", "redact", "event", { variant: "emphasis" }),
    edge("s4", "redact", "privacy", "strings", { fromSide: "bottom", toSide: "top", labelAt: [865, 138] }),
    edge("s5", "privacy", "queue", "event", { variant: "emphasis" }),
    edge("s6", "queue", "api", "sends", { variant: "emphasis" }),
    edge("s7", "queue", "log", "writes lines", { fromSide: "bottom", toSide: "top", labelAt: [615, 275] }),
  ],
  cards: [
    { dot: "cyan", title: "The five steps", items: ["1  The tool list gains a required context text and one extra tool", "2  Every tool call is copied into an event, with arguments and result", "3  The vendor's own redaction function, if any, runs on every string", "4  The package's filter hides some values, by name or by pattern", "5  A queue sends the events, five requests at a time"] },
    { dot: "amber", title: "Why step 4 matters most", items: [`The email pattern runs on the whole text before it is cut to the size limit. ${w("W-01")} is the freeze.`] },
  ],
});

// ---- screen 3: what leaves the vendor's server
write("l2-what-leaves", "architecture", {
  meta: {
    title: "What leaves the vendor's server", output: "l2-what-leaves.html", quality_profile: "showcase",
    views: [
      { id: "event", label: "One event", focus: ["tool", "model", "user", "event", "api"], note: `One event has ${fields} fields. Arguments and result are among them, by default.` },
      { id: "hiding", label: "What is hidden", focus: ["vfn", "privacy", "event"], note: "The package hides values by name and by pattern. Names and addresses inside a sentence go through." },
    ],
  },
  components: [
    node("model", "external", "The model's context text", `15 to 25 words it writes · ${w("W-10")}`, 300, 40, 180),
    node("tool", "backend", "The vendor's tool call", `arguments, result, error text · ${w("W-03")}`, 30, 175, 190),
    node("user", "external", "User id and name", "turned into a hashed subject", 300, 310, 180),
    node("vfn", "backend", "Vendor's function", `optional, runs first · ${w("W-07")}`, 300, 175, 180),
    node("privacy", "backend", "Privacy filter", `${w("W-02", "W-04")}`, 550, 175, 170),
    node("event", "backend", "One event", `${fields} fields · ${w("W-03")}`, 780, 175, 170),
    node("api", "cloud", "Within's service", "stores the event", 780, 40, 170),
  ],
  boundaries: [],
  connections: [
    edge("l1", "model", "vfn", "goal text", { fromSide: "bottom", toSide: "top", labelAt: [392, 138] }),
    edge("l2", "tool", "vfn", "arguments, result", { variant: "emphasis", labelAt: [260, 171] }),
    edge("l3", "user", "vfn", "id", { fromSide: "top", toSide: "bottom", labelAt: [392, 275] }),
    edge("l4", "vfn", "privacy", "every string", { variant: "emphasis" }),
    edge("l5", "privacy", "event", "filtered", { variant: "emphasis" }),
    edge("l6", "event", "api", "sent"),
  ],
  cards: [
    { dot: "amber", title: "What the filter misses", items: ["Phone, social security and card numbers inside a sentence", "Keys, web and IP addresses inside a sentence", "Names and street addresses, which no pattern finds"] },
    { dot: "cyan", title: "What it does well", items: ["The raw user id and name are replaced by a hashed subject", "Email addresses and bearer tokens inside text are hidden"] },
  ],
});

// ---- Archify builds the three pages
const ARCHIFY = process.env.ARCHIFY_DIR ?? path.join(process.env.HOME, ".claude/skills/archify");
const pages = ["l1-within-end-to-end", "l2-inside-the-sdk", "l2-what-leaves"];
const exp = path.join(root, "docs", "explorer");
for (const f of fs.readdirSync(exp)) if (f.endsWith(".html") || f.endsWith(".png") || f.endsWith(".json")) fs.unlinkSync(path.join(exp, f));
if (fs.existsSync(path.join(ARCHIFY, "bin/archify.mjs"))) {
  for (const n of pages) {
    const r = spawnSync("node", [path.join(ARCHIFY, "bin/archify.mjs"), "deliver", "architecture", path.join(SRC, `${n}.architecture.json`), path.join(exp, `${n}.html`), "--quality", "showcase", "--json"], { encoding: "utf8" });
    if (r.status !== 0) fail(`archify failed on ${n}:\n${(r.stdout + r.stderr).slice(-1500)}`);
    console.log(`archify ok: ${n}`);
  }
} else fail(`Archify not found at ${ARCHIFY}; set ARCHIFY_DIR`);

// ---- the screens table
const S = {};
const leaf = (id) => {
  const f = need(id), sk = sketches[id] ?? fail(`no sketch for ${id}`), file = sk.file;
  const checks = f.tests.map((t) => `<code>${t}</code>`).join(", ");
  return { title: `${f.id} · ${sk.title}`, file, kind: "leaf", note: ["measured", `${f.tests.length > 1 ? "Checks" : "Check"} ${checks}. <a href="findings.html#${f.id.toLowerCase()}">Read ${f.id} on the findings page</a>.`] };
};
for (const f of src.findings) S[`f-${f.id.toLowerCase().replace("-", "")}`] = leaf(f.id);
const fid = (id) => `f-${id.toLowerCase().replace("-", "")}`;
S.l1 = { title: "within-sdk, end to end", file: "explorer/l1-within-end-to-end.html", kind: "arch", note: ["read", "Read from the package's README and files. The boxes with W-numbers open the finding."], drill: { sdk: "l2-sdk", api: "l2-leaves", log: fid("W-09"), hosting: fid("W-06") }, extra: ["leaf-flow"] };
S["l2-sdk"] = { title: "Inside within-sdk", file: "explorer/l2-inside-the-sdk.html", kind: "arch", note: ["read", "Read from the published package's files. Each box with a W-number opens a hand-drawn sketch of that finding."], drill: { toollist: fid("W-10"), reporter: fid("W-08"), redact: fid("W-07"), privacy: fid("W-01"), queue: fid("W-05"), log: fid("W-09"), shutdown: fid("W-06") }, extra: [fid("W-02"), fid("W-03"), fid("W-04"), "l2-leaves"] };
S["l2-leaves"] = { title: "What leaves the vendor's server", file: "explorer/l2-what-leaves.html", kind: "arch", note: ["measured", "Checks C1 to C6 and C11 send test values through the package to a stand-in server and read what arrives."], drill: { model: fid("W-10"), tool: fid("W-03"), vfn: fid("W-07"), privacy: fid("W-02"), event: fid("W-03") }, extra: [fid("W-04"), fid("W-01")] };
S["leaf-flow"] = { title: "One tool call, step by step", file: "flow.svg", kind: "leaf", note: ["read", "Read from the package's files. Each W-number is a finding in the report."] };
for (const [k, s] of Object.entries(S)) for (const t of [...Object.values(s.drill ?? {}), ...(s.extra ?? [])]) if (!S[t]) fail(`${k} points at unknown screen ${t}`);
for (const f of src.findings) if (!Object.values(S).some((s) => Object.values(s.drill ?? {}).includes(fid(f.id)) || (s.extra ?? []).includes(fid(f.id)))) fail(`no screen opens ${f.id}`);

let html = fs.readFileSync(path.join(here, "map.template.html"), "utf8");
if (!html.includes("/*S*/")) fail("template has no /*S*/");
html = html.replace("/*S*/", JSON.stringify(S, null, 2)).replaceAll("{{VERSION}}", version);
fs.writeFileSync(path.join(root, "docs", "map.html"), html);
console.log(`map built: ${Object.keys(S).length} screens, ${pages.length} diagrams`);
