// Applies (or with --revert, removes) two small fixes to the installed @getwithin/sdk 0.3.0.
//   Fix 1, Zod: zod moves from "dependencies" to "peerDependencies", as Within's docs already say
//          ("it is a peer dependency"). The SDK then shares the project's Zod, so the docs
//          quickstart stops crashing with "Mixed Zod versions detected" on a fresh Zod 4 install.
//   Fix 2, redaction: phone numbers are redacted in the model-written `context` text (mcpIntent)
//          and in captured strings, next to the existing email / key / card rules.
// It patches node_modules only, refuses any other SDK version, and checks every edit landed.
import fs from "node:fs";
import path from "node:path";

const SDK = path.resolve("node_modules/@getwithin/sdk");
const PKG = path.join(SDK, "package.json");
const DIST = path.join(SDK, "dist/index.js");
const NESTED = path.join(SDK, "node_modules/zod");
const PARKED = path.join(SDK, ".zod-nested-parked");
const revert = process.argv.includes("--revert");

const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
if (pkg.version !== "0.3.0") throw new Error(`These fixes are written for @getwithin/sdk 0.3.0, found ${pkg.version}`);

// ---- Fix 1: zod as a peer dependency
if (!revert) {
  if (pkg.dependencies?.zod) {
    pkg.peerDependencies = { ...pkg.peerDependencies, zod: "^3.25.76 || ^4.0.0" };
    delete pkg.dependencies.zod;
    fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + "\n");
  }
  if (fs.existsSync(NESTED)) fs.renameSync(NESTED, PARKED); // let Node resolve the project's zod
} else {
  if (pkg.peerDependencies?.zod) {
    pkg.dependencies = { ...pkg.dependencies, zod: "^3.25.76" };
    delete pkg.peerDependencies.zod;
    fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + "\n");
  }
  if (fs.existsSync(PARKED)) fs.renameSync(PARKED, NESTED);
}

// ---- Fix 2: phone redaction
const MARK = "/* within-trigger-check: phone redaction */";
const ANCHOR_DEFS = "var GROUPED_CARD =";
const DEFS = `${MARK}
var PHONE = /\\+?(?:\\(\\d{1,4}\\)[\\s.-]?)?\\d[\\d\\s.-]{5,}\\d/g;
function redactPhone(match) {
  const digits = match.replace(/\\D/g, "").length;
  return digits >= 10 && digits <= 15 ? "[redacted]" : match;
}
`;
const EDITS = [
  // redactMcpIntent: the model-written goal text sent on every call
  [".replace(CARD, redactCard).trim().slice(0, 300);", ".replace(CARD, redactCard).replace(PHONE, redactPhone).trim().slice(0, 300);"],
  // redact: captured argument strings (only when captureArguments is on)
  ['const cleaned = value.replace(EMAIL, "[redacted]").replace(SECRET_VALUE, "[redacted]").replace(CARD, redactCard);',
   'const cleaned = value.replace(EMAIL, "[redacted]").replace(SECRET_VALUE, "[redacted]").replace(CARD, redactCard).replace(PHONE, redactPhone);'],
];

let src = fs.readFileSync(DIST, "utf8");
if (!revert && !src.includes(MARK)) {
  if (!src.includes(ANCHOR_DEFS)) throw new Error("anchor not found: " + ANCHOR_DEFS);
  src = src.replace(ANCHOR_DEFS, DEFS + ANCHOR_DEFS);
  for (const [from, to] of EDITS) {
    if (src.split(from).length !== 2) throw new Error("expected exactly one match for: " + from);
    src = src.replace(from, to);
  }
  fs.writeFileSync(DIST, src);
} else if (revert && src.includes(MARK)) {
  src = src.replace(DEFS, "");
  for (const [from, to] of EDITS) src = src.replace(to, from);
  fs.writeFileSync(DIST, src);
}

// ---- Fix 3 (opt-in, --wording): narrow the "competitive comparison" trigger.
// Trigger check found Claude calling get_vendor_answer for "Compare Ledgerly and Paywise", two
// companies in the vendor's own data. The trigger list says "a competitive comparison", which a
// model can read as "any comparison". The new wording names what is meant.
const WORD_FROM = "a competitive comparison,";
const WORD_TO = "a competitive comparison (this product against a competitor, not a comparison of records in this product's own data),";
src = fs.readFileSync(DIST, "utf8");
if (!revert && process.argv.includes("--wording") && src.includes(WORD_FROM)) {
  if (src.split(WORD_FROM).length !== 3) throw new Error("expected exactly two matches for the wording fix");
  fs.writeFileSync(DIST, src.split(WORD_FROM).join(WORD_TO));
} else if (revert && src.includes(WORD_TO)) {
  fs.writeFileSync(DIST, src.split(WORD_TO).join(WORD_FROM));
}

const now = JSON.parse(fs.readFileSync(PKG, "utf8"));
const final = fs.readFileSync(DIST, "utf8");
console.log(JSON.stringify({
  zod_fix: Boolean(now.peerDependencies?.zod) && !fs.existsSync(NESTED),
  phone_redaction_fix: final.includes(MARK),
  wording_fix: final.includes(WORD_TO),
}));
