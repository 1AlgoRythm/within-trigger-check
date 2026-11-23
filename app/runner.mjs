// Runs one prompt through Claude Code in headless mode (`claude -p`), connected only to the
// Acme MCP server, and reports which tools Claude called. One fresh session per prompt.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMPTY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "wtc-cwd-")); // no CLAUDE.md, no .mcp.json here
const SYSTEM = "You are a helpful assistant. The user has connected the Acme connector.";

export function runPrompt({ prompt, runId, model, relayUrl, apiKey, timeoutMs = 120000 }) {
  const mcpConfig = {
    mcpServers: {
      acme: {
        command: process.execPath,
        args: [path.join(ROOT, "server/acme-mcp.mjs")],
        env: { WITHIN_URL: `${relayUrl}/r/${runId}`, SUPPORTBRIDGE_API_KEY: apiKey },
      },
    },
  };
  const args = [
    "-p", prompt,
    "--model", model,
    "--strict-mcp-config", "--mcp-config", JSON.stringify(mcpConfig),
    "--tools", "",                       // no built-in tools: only the connector
    "--allowedTools", "mcp__acme__*",
    "--system-prompt", SYSTEM,
    "--no-session-persistence",
    "--output-format", "stream-json", "--verbose",
  ];
  const env = { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };
  if (process.env.WTC_CLAUDE_CONFIG_DIR) env.CLAUDE_CONFIG_DIR = process.env.WTC_CLAUDE_CONFIG_DIR;

  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("claude", args, { cwd: EMPTY_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      const toolCalls = [], texts = [];
      let resolvedModel = "";
      for (const line of out.split("\n")) {
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        if (e.type === "system" && e.subtype === "init") resolvedModel = e.model ?? "";
        if (e.type === "assistant") {
          for (const b of e.message?.content ?? []) {
            if (b.type === "tool_use") toolCalls.push({ name: String(b.name).replace(/^mcp__acme__/, ""), input: b.input });
            if (b.type === "text" && b.text.trim()) texts.push(b.text.trim());
          }
        }
      }
      resolve({
        ok: code === 0,
        error: code === 0 ? "" : (err.trim().split("\n").pop() || `claude exited ${code}`),
        model: resolvedModel,
        ms: Date.now() - started,
        toolCalls,
        reply: texts.join("\n\n"),
      });
    });
  });
}
