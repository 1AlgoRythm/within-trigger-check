// For every named function or constant that a finding points at (the backticked names in each finding's "where"
// list in findings.json), find it in two versions of the SDK and compare its exact text.
//   node code-locations.mjs <old dist/index.js> <new dist/index.js> [out.json]
//   node code-locations.mjs node_modules/@getwithin/sdk/dist/index.js sdk-0.4.0/dist/index.js results/code-locations-0.4.0.json
// This only READS the two files as text. It never runs the SDK.
//
// Why it exists: a check keeping the same verdict does not prove the code behind it is the same. Here, "identical" means
// the unit's source text is byte for byte the same in both versions, so the behaviour a finding describes cannot have
// changed through that unit. "changed" means the text differs, so the finding needs a human look.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [oldFile, newFile, outFile = "results/code-locations.json"] = process.argv.slice(2);
if (!oldFile || !newFile) { console.error("usage: node code-locations.mjs <old dist/index.js> <new dist/index.js> [out.json]"); process.exit(1); }

// ---- a small scanner: finds where a bracket group or a statement ends, skipping strings, comments and regex literals
const KEYWORD_BEFORE_REGEX = /(?:return|typeof|case|in|of|delete|void|throw|new|else|do)\s*$/;
function skipString(src, i, q) { for (i++; i < src.length; i++) { if (src[i] === "\\") { i++; continue; } if (src[i] === q) return i; } return -1; }
function skipRegex(src, i) {
  let inClass = false;
  for (i++; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") { i++; continue; }
    if (c === "[") inClass = true; else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) return i;
    else if (c === "\n") return -1;
  }
  return -1;
}
function skipTemplate(src, i) {
  for (i++; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") { i++; continue; }
    if (c === "`") return i;
    if (c === "$" && src[i + 1] === "{") { const end = scan(src, i + 1, "close"); if (end < 0) return -1; i = end; }
  }
  return -1;
}
// mode "close": src[start] opens a bracket; return the index of its matching close.
// mode "stmt":  return the index of the ";" that ends the statement starting at start (depth 0), or the end of the last bracket.
function scan(src, start, mode) {
  let depth = 0, prev = "";
  for (let i = start; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === "/" && n === "/") { i = src.indexOf("\n", i); if (i < 0) return -1; continue; }
    if (c === "/" && n === "*") { i = src.indexOf("*/", i + 2); if (i < 0) return -1; i++; continue; }
    if (c === '"' || c === "'") { i = skipString(src, i, c); if (i < 0) return -1; prev = c; continue; }
    if (c === "`") { i = skipTemplate(src, i); if (i < 0) return -1; prev = "`"; continue; }
    if (c === "/") {
      const regexOk = prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev) || KEYWORD_BEFORE_REGEX.test(src.slice(Math.max(0, i - 12), i));
      if (regexOk) { const j = skipRegex(src, i); if (j >= 0) { i = j; prev = "/"; continue; } }
    }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") { depth--; if (mode === "close" && depth === 0) return i; if (depth < 0) return i - 1; }
    else if (c === ";" && depth === 0 && mode === "stmt") return i;
    if (!/\s/.test(c)) prev = c;
  }
  return -1;
}

// ---- find every definition of a name and return its exact text
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function definitions(src, name) {
  const n = esc(name);
  const patterns = [
    { kind: "function", re: new RegExp(`^[ \\t]*(?:export\\s+)?(?:async\\s+)?function\\s*\\*?\\s*${n}\\s*\\(`, "gm") },
    { kind: "constant", re: new RegExp(`^[ \\t]*(?:export\\s+)?(?:const|let|var)\\s+${n}\\s*=`, "gm") },
    { kind: "method", re: new RegExp(`^[ \\t]*(?:async\\s+)?(?:get\\s+|set\\s+|static\\s+)?${n}\\s*\\([^)\\n]*\\)\\s*\\{`, "gm") },
  ];
  const out = [];
  for (const { kind, re } of patterns) {
    let m;
    while ((m = re.exec(src))) {
      const start = m.index + m[0].match(/^[ \t]*/)[0].length;
      let end;
      if (kind === "constant") end = scan(src, m.index + m[0].length, "stmt");
      else {
        const paren = src.indexOf("(", m.index + m[0].indexOf(name));
        const closeParen = scan(src, paren, "close");
        const brace = closeParen < 0 ? -1 : src.indexOf("{", closeParen);
        end = brace < 0 ? -1 : scan(src, brace, "close");
      }
      if (end < 0) { out.push({ kind, line: src.slice(0, start).split("\n").length, text: null }); continue; }
      out.push({ kind, line: src.slice(0, start).split("\n").length, text: src.slice(start, end + 1) });
    }
    if (out.length) break; // the first pattern that matches wins, so a method is not re-found inside a function
  }
  return out;
}

const read = (p) => fs.readFileSync(path.resolve(p), "utf8");
const oldSrc = read(oldFile), newSrc = read(newFile);
const findings = JSON.parse(fs.readFileSync(path.join(here, "findings.json"), "utf8")).findings;

const GENERIC = new Set(["context", "question", "dependencies", "zod", "status"]);
const rows = [];
for (const f of findings) {
  if (f.since) continue; // findings first made in a later version have no older code to compare
  const names = [...new Set(f.where.flatMap((w) => [...w.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1])))];
  const units = [];
  for (const name of names) {
    if (GENERIC.has(name)) continue; // ordinary words that also name local variables, so a text match would say nothing
    const a = definitions(oldSrc, name);
    if (!a.length) continue; // not a named code unit in the old version (a field name, a package name, a word)
    const b = definitions(newSrc, name);
    let verdict;
    if (a.some((x) => x.text === null) || b.some((x) => x.text === null)) verdict = "could not read";
    else if (!b.length) verdict = "missing in new version";
    // identical = every old definition still exists with exactly the same text (the new version may add others elsewhere)
    else if (a.every((x) => b.some((y) => y.text === x.text))) verdict = "identical";
    else verdict = "changed";
    // DUMP_DIR=<dir> writes the old and new text of every changed unit, so `diff -u <dir>/x.old.js <dir>/x.new.js` shows what moved
    if (process.env.DUMP_DIR && verdict === "changed") {
      fs.mkdirSync(process.env.DUMP_DIR, { recursive: true });
      const join = (xs) => xs.map((x) => x.text ?? "").join("\n/* ---- next definition ---- */\n");
      fs.writeFileSync(path.join(process.env.DUMP_DIR, `${name}.old.js`), join(a) + "\n");
      fs.writeFileSync(path.join(process.env.DUMP_DIR, `${name}.new.js`), join(b) + "\n");
    }
    units.push({ name, kind: a[0].kind, definitionsOld: a.length, definitionsNew: b.length, lineOld: a[0].line, lineNew: b[0]?.line ?? null, lengthOld: a[0].text?.length ?? null, lengthNew: b[0]?.text?.length ?? null, verdict });
  }
  rows.push({ id: f.id, units });
}
const out = { oldFile: path.basename(path.dirname(path.dirname(path.resolve(oldFile)))), newFile: path.basename(path.dirname(path.dirname(path.resolve(newFile)))), comparedAt: new Date().toISOString(), findings: rows };
fs.writeFileSync(path.join(here, outFile), JSON.stringify(out, null, 2));
for (const r of rows) console.log(r.id.padEnd(5), r.units.length ? r.units.map((u) => `${u.name}:${u.verdict}${u.definitionsOld > 1 ? `(x${u.definitionsOld})` : ""}`).join("  ") : "(no named code unit)");
console.log("Wrote", outFile);
