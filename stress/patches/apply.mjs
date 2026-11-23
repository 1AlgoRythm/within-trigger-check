// Builds ./patched-sdk/ : a copy of the stock @getwithin/sdk 0.3.0 with nine small PROTOTYPE patches,
// one per finding that can be fixed in a few lines. Each patch asserts it matched exactly once.
// Run the same tests against it with:  npm run test:patched   (sets WITHIN_SDK_ENTRY)
// These are proposals for Within's engineers to adopt or rewrite. Within's source repo is private, so
// they are written against the published dist/index.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// PATCH_SRC = another unpacked package (default: the 0.3.0 in node_modules). PATCH_REPORT=1 lists every patch that does not match, instead of stopping at the first.
const stock = path.resolve(here, process.env.PATCH_SRC ?? "../node_modules/@getwithin/sdk");
const REPORT = Boolean(process.env.PATCH_REPORT), notApplied = [];
const WORDING = process.env.WORDING ?? "v2"; // v2 = the wording fix we recommend; v1 = the first rewording we tried (it made things worse)
const out = path.resolve(here, process.env.PATCH_OUT ?? "../patched-sdk");
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(stock, out, { recursive: true });
const file = path.join(out, "dist/index.js");
let src = fs.readFileSync(file, "utf8");

const PATCHES = [
  {
    id: "P1", fixes: "W-02 (A3, A3b)", what: "When Within is unreachable, add the 'unreachable' line but leave the vendor's structured data alone.",
    from: `  const structuredContent = {
    ...source?.structuredContent && typeof source.structuredContent === "object" ? source.structuredContent : {},
    status: "service_unreachable"
  };
  return {
    ...source && typeof source === "object" ? source : {},
    content,
    structuredContent
  };`,
    to: `  return {
    ...source && typeof source === "object" ? source : {},
    content
  };`,
  },
  {
    id: "P2", fixes: "W-04 (B3)", what: "Only strip a 'context' argument if the SDK added that field; never one the vendor declared.",
    from: `    const appOnly = isAppOnlyTool(config);`,
    to: `    const declared = config?.inputSchema;
    const ownContext = Boolean(declared) && Object.prototype.hasOwnProperty.call(declared?.shape ?? declared, "context");
    const appOnly = isAppOnlyTool(config);`,
  },
  {
    id: "P2b", fixes: "W-04 (B3)", what: "(second half of P2)",
    from: `      const split = splitMcpContext(args);
      const invoke = () => ctx.mcpContext.run(split.context, () => handler(split.args, extra));`,
    to: `      const split = ownContext ? { args, context: "" } : splitMcpContext(args);
      const invoke = () => ctx.mcpContext.run(split.context, () => handler(split.args, extra));`,
  },
  {
    id: "P3", fixes: "W-05 (B4)", what: "Accept a goal text longer than 300 characters and cut it, instead of rejecting the whole tool call.",
    from: `  return z.string().max(300).optional().describe(MCP_CONTEXT_DESCRIPTION);`,
    to: `  return z.string().optional().describe(MCP_CONTEXT_DESCRIPTION);`,
  },
  {
    id: "P4", fixes: "W-06 (B2)", what: "Keep the vendor's own _meta keys when an offer is attached; drop only the card-mounting keys.",
    from: `  delete next._meta;
  return next;`,
    to: `  if (next._meta && typeof next._meta === "object") {
    const kept = Object.fromEntries(Object.entries(next._meta).filter(([k]) => k !== "ui" && !k.startsWith("openai/")));
    if (Object.keys(kept).length) next._meta = kept; else delete next._meta;
  }
  return next;`,
  },
  {
    id: "P5", fixes: "W-08 (C8)", what: "Cut text to 1,000 characters BEFORE the redaction patterns run (the output is cut to 200 anyway).",
    from: `    const cleaned = value.replace(EMAIL, "[redacted]").replace(SECRET_VALUE, "[redacted]").replace(CARD, redactCard);`,
    to: `    const cleaned = value.slice(0, 1000).replace(EMAIL, "[redacted]").replace(SECRET_VALUE, "[redacted]").replace(CARD, redactCard);`,
  },
  {
    id: "P6", fixes: "W-09 (C7)", what: "Do not report a tool the vendor did not wrap, unless the vendor opts in with reportUnwrappedTools: true.",
    from: `      if (fields.mcpIntent) {
        const identity = await ctx.callerIdentity(extra);`,
    to: `      if (fields.mcpIntent && ctx.options.reportUnwrappedTools === true) {
        const identity = await ctx.callerIdentity(extra);`,
  },
  {
    id: "P7", fixes: "W-15 (D1)", what: "Replace only the paragraphs that hold a banned phrase, as the docs say, and keep the rest first.",
    from: `  if (/next tool call|Do not call|Do not ask|Do not say|Do not mention/.test(current)) {
    target._instructions = SERVER_INSTRUCTIONS;
    return;
  }`,
    to: `  const BANNED = /next tool call|Do not call|Do not ask|Do not say|Do not mention/;
  if (BANNED.test(current)) {
    const kept = current.split(/\\n\\s*\\n/).filter((p) => !BANNED.test(p)).join("\\n\\n").trim();
    target._instructions = kept ? \`\${kept} \${SERVER_INSTRUCTIONS}\` : SERVER_INSTRUCTIONS;
    return;
  }`,
  },
  {
    id: "P8", fixes: "W-07 (A7)", what: "If the vendor's identify() throws, carry on without an identity instead of failing the tool call.",
    from: `  const provided = await identify(context ?? {}) ?? {};`,
    to: `  let provided = {};
  try { provided = await identify(context ?? {}) ?? {}; } catch { provided = {}; }`,
  },
  {
    id: "P9", fixes: "W-16 (A10)", what: "Treat a blank apiKey like a missing one.",
    from: `  if (!options?.apiKey) throw new Error("api_key_required");`,
    to: `  if (!String(options?.apiKey ?? "").trim()) throw new Error("api_key_required");`,
  },
  {
    id: "P11", fixes: "W-20 (X1)", count: 2, what: "Name what 'a competitive comparison' means, so a small model stops sending comparisons of the vendor's own records to Within.",
    from: "a competitive comparison,",
    to: WORDING === "v1" ? "a comparison of this product with a competitor's," : "a competitive comparison (this product against a competitor, not a comparison of records in this product's own data),",
  },
];

for (const p of PATCHES) {
  const n = src.split(p.from).length - 1;
  if (n !== (p.count ?? 1)) {
    if (REPORT) { notApplied.push(`${p.id} (${p.fixes}): expected ${p.count ?? 1} match(es), found ${n}`); continue; }
    throw new Error(`${p.id}: expected ${p.count ?? 1} match(es), found ${n}`);
  }
  src = src.split(p.from).join(p.to);
}
fs.writeFileSync(file, src);
// P10: zod becomes a peer dependency, as the docs already say (the same change as ../../fixes/apply.mjs, fix 1)
const pkgFile = path.join(out, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
if (!pkg.dependencies?.zod) {
  if (!REPORT) throw new Error("P10: zod is not under dependencies");
  notApplied.push("P10 (W-01 (F1)): not needed, zod is already a peer dependency in this version");
}
if (pkg.dependencies?.zod) { pkg.peerDependencies = { ...pkg.peerDependencies, zod: "^3.25.76 || ^4.0.0" };
delete pkg.dependencies.zod; }
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n");
if (!notApplied.some((x) => x.startsWith("P10"))) PATCHES.push({ id: "P10", fixes: "W-01 (F1)", what: "Move zod from dependencies to peerDependencies, as the docs already say (package.json)." });
console.log(`Built ${path.relative(process.cwd(), out) || out} with ${PATCHES.length} patches:`);
for (const p of PATCHES) console.log(`  ${p.id.padEnd(3)} ${p.fixes.padEnd(16)} ${p.what}`);
if (REPORT) { console.log(`\nPATCH REPORT against ${path.basename(stock)}: ${PATCHES.length} applied, ${notApplied.length} not applied`); for (const x of notApplied) console.log("  NOT APPLIED  " + x); }
