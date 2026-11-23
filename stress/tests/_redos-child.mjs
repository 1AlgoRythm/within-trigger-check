// Child process for test C7: time one wrapped call whose free-text argument is `size` characters.
// Runs in its own process so a very slow case can be stopped from outside.
import { boot, searchTool, performance } from "../lib/harness.mjs";
const [kind, size] = [process.argv[2], Number(process.argv[3])];
const errorMode = kind.startsWith("error-");
const payload = kind.includes("letters") ? "a".repeat(size) : kind === "digits-spaces" ? "1 ".repeat(size / 2) : "x".repeat(size);
// error-* kinds: captureArguments stays OFF (the default) and the vendor's tool throws an error whose message holds the text.
const s = await boot({
  installOpts: errorMode ? {} : { privacy: { captureArguments: true } },
  setup: ({ server, support }) => searchTool(support, server, errorMode ? { handler: async () => { throw new Error("bad input: " + payload); } } : {}),
});
const t0 = performance.now();
await s.call("search", { query: errorMode ? "x" : payload }).catch(() => {});
const took = performance.now() - t0;
await s.close();
console.log(JSON.stringify({ kind, size, ms: Math.round(took) }));
process.exit(0);
