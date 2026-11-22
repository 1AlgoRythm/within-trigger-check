// How does the call time grow with argument size? Each (shape, size) runs in its own child with a 20 s limit.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
if (process.argv[2] === "child") {
  process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "w104s-"));
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const { z } = await import("zod"); const { track } = await import(process.env.WITHIN_PKG_DIR ? "file://" + path.join(path.resolve(process.env.WITHIN_PKG_DIR), "dist/index.js") : "within-sdk");
  const [shape, n] = [process.argv[3], Number(process.argv[4])];
  const gen = { letters: (n) => "a".repeat(n), digits: (n) => "1234 ".repeat(n / 5), ats: (n) => "x@".repeat(n / 2), dots: (n) => "a.".repeat(n / 2), spaces: (n) => " ".repeat(n), words: (n) => "hello world ".repeat(n / 12) }[shape](n);
  const s = new McpServer({ name: "a", version: "1" }); s.tool("t", { q: z.string() }, async () => ({ content: [{ type: "text", text: "ok" }] }));
  const opts = { apiKey: "k", apiBaseUrl: "http://127.0.0.1:9" };
  if (process.env.SCALE_TRUNCATE) opts.redactSensitiveInformation = (str) => str.slice(0, Number(process.env.SCALE_TRUNCATE));
  if (process.env.SCALE_MAXFIELD) opts.privacy = { maxFieldBytes: Number(process.env.SCALE_MAXFIELD) };
  track(s, "acme", opts);
  const [a, b] = InMemoryTransport.createLinkedPair(); const c = new Client({ name: "c", version: "1" }); await Promise.all([s.connect(a), c.connect(b)]);
  // time the event loop stall, not only the call: a timer that should fire every 10 ms
  let maxGap = 0, last = Date.now(); const iv = setInterval(() => { const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 10);
  const t0 = Date.now(); await c.callTool({ name: "t", arguments: { q: gen, context: "x".repeat(20) } }); const callMs = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 4000)); clearInterval(iv);
  console.log(JSON.stringify({ shape, n, callMs, maxEventLoopStallMs: maxGap })); process.exit(0);
}
const shapes = ["letters", "digits", "ats", "dots", "spaces", "words"], sizes = [10_000, 50_000, 100_000, 200_000];
for (const sh of shapes) for (const n of sizes) {
  const r = spawnSync("node", [new URL(import.meta.url).pathname, "child", sh, String(n)], { timeout: 20000, encoding: "utf8", cwd: new URL("./", import.meta.url).pathname });
  console.log(r.error?.code === "ETIMEDOUT" ? JSON.stringify({ shape: sh, n, STUCK_OVER_MS: 20000 }) : r.stdout.trim() || r.stderr.trim().slice(0, 150));
}
