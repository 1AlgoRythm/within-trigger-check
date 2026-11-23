// Run a few prompts several times each and count how often Claude called get_vendor_answer.
// One run is one sample; this shows whether a result is stable.
//   node app/repeat.mjs --ids n09,b08 --times 5 --model haiku
import fs from "node:fs";
import { startRelay } from "../server/within-relay.mjs";
import { runPrompt } from "./runner.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const ids = arg("--ids", "n09,b08").split(",");
const times = Number(arg("--times", 5));
const model = arg("--model", "haiku");
const extra = arg("--extra", ""); // optional JSON file of extra prompts with the same shape as prompts.json

let prompts = JSON.parse(fs.readFileSync(new URL("../prompts.json", import.meta.url), "utf8"));
if (extra) prompts = prompts.concat(JSON.parse(fs.readFileSync(extra, "utf8")));
const chosen = prompts.filter((p) => ids.includes(p.id));

const relay = await startRelay({ port: 8788, mode: "stub" });
const out = {};
for (const p of chosen) {
  const jobs = Array.from({ length: times }, (_, k) =>
    runPrompt({ prompt: p.text, runId: `rep-${p.id}-${k}`, model, relayUrl: "http://127.0.0.1:8788", apiKey: "sb_local_stub" }));
  const rs = await Promise.all(jobs);
  const called = rs.filter((r) => r.ok && r.toolCalls.some((t) => t.name === "get_vendor_answer")).length;
  const topics = rs.flatMap((r) => r.toolCalls.filter((t) => t.name === "get_vendor_answer").map((t) => t.input?.topic));
  out[p.id] = { text: p.text, expect: p.expect, called, of: rs.filter((r) => r.ok).length, errors: rs.filter((r) => !r.ok).length, topics };
  console.log(JSON.stringify({ id: p.id, ...out[p.id] }));
}
relay.close();
process.exit(0);
