// Builds ./patched-sdk: a copy of within-sdk 1.0.4 with six small prototype fixes, each asserted to match exactly once.
// These are proposals for Within's engineers, written against the published files. Run the suite on it with:
//   WITHIN_PKG_DIR=$PWD/patched-sdk OUT_DIR=$PWD/out-patched RESULTS_FILE=$PWD/../results/patched-1.0.4.json node run-all.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "node_modules", "within-sdk"), dst = path.join(here, "patched-sdk");
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
const patch = (id, file, edits) => {
  const p = path.join(dst, "dist/modules", file); let s = fs.readFileSync(p, "utf8");
  for (const [from, to] of edits) {
    const n = s.split(from).length - 1;
    if (n !== 1) throw new Error(`${id}: expected exactly one match in ${file}, found ${n} for: ${from.slice(0, 80)}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(p, s); console.log(`${id}: ${file} patched`);
};
// P1 (the freeze): cut the text to the field limit BEFORE the patterns run, not after.
patch("P1", "privacy.js", [
  ["return truncateString(redactSensitiveString(value), options.maxFieldBytes);", "return redactSensitiveString(truncateString(value, options.maxFieldBytes));"],
  ["message: truncateString(redactSensitiveString(value.message), options.maxFieldBytes),", "message: redactSensitiveString(truncateString(value.message, options.maxFieldBytes)),"],
]);
// P2 (the stuck queue): a time limit on every request, so a hung one frees its slot and is retried.
patch("P2", "eventQueue.js", [["const res = await fetchImpl(`${base}/api/sdk/events`, {\n        method: \"POST\",", "const res = await fetchImpl(`${base}/api/sdk/events`, {\n        method: \"POST\",\n        signal: AbortSignal.timeout(5000),"]]);
// P3 (the swallowed SIGTERM): after the queue is flushed, send the same signal again, now that the handler is gone.
patch("P3", "eventQueue.js", [["        process.once(\"SIGINT\", shutdown);\n        process.once(\"SIGTERM\", shutdown);", "        for (const sig of [\"SIGINT\", \"SIGTERM\"])\n            process.once(sig, () => { void flushDiagnostics(); eventQueue.destroy().finally(() => process.kill(process.pid, sig)); });"]]);
// P4 (identity-like argument names): treat address, dob and birth as secret words, and name, ip and customer as secret when they are the whole name.
patch("P4", "privacy.js", [
  ["const DEFAULT_SECRET_KEY_PATTERNS = [", "const EXACT_SECRET_KEYS = new Set([\"name\", \"ip\", \"customer\"]);\nconst DEFAULT_SECRET_KEY_PATTERNS = ["],
  ["    \"cvv\",\n];", "    \"cvv\",\n    \"address\",\n    \"dob\",\n    \"birth\",\n];"],
  ["return patterns.some((pattern) => normalized.includes(pattern));", "return patterns.some((pattern) => normalized.includes(pattern)) || EXACT_SECRET_KEYS.has(normalized);"],
]);
// P5 (the required context input): leave it optional, because the server does not enforce it.
patch("P5", "context-parameters.js", [["    // Add context to required array\n    if (Array.isArray(modifiedTool.inputSchema.required)) {\n        if (!modifiedTool.inputSchema.required.includes(\"context\")) {\n            modifiedTool.inputSchema.required.push(\"context\");\n        }\n    }\n    else {\n        modifiedTool.inputSchema.required = [\"context\"];\n    }", "    // context stays optional: the server does not enforce it"]]);
// P6 (the vendor's redaction function sees the API key and the address): protect those event fields.
patch("P6", "redaction.js", [["    \"properties\",\n]);", "    \"properties\",\n    \"apiKey\",\n    \"ingestBaseUrl\",\n    \"vendorSlug\",\n]);"]]);
console.log("done: " + dst);
