# Reproduce this: every step, with the result to expect

This page takes you from an empty folder to every number, finding and page in this repo. Nothing here contacts Within: every request goes to a stand-in on `127.0.0.1` or to a stubbed `fetch`, and the package's log file goes to a throwaway home folder. Nothing here spends model usage.

Last verified: 2026-11-22, macOS, Node 26, npm 11. Timings depend on the machine, so compare verdicts, not milliseconds.

## 0. What you need

Node 20 or later, npm, `curl`. Check `F6` reads Within's public docs page and asks npm about two package names; check `F2` runs `npm install` on a fresh project.

```bash
git clone https://github.com/1AlgoRythm/within-trigger-check.git
cd within-trigger-check/stress/v104
npm install --ignore-scripts
```

**Expect:** `node -p "require('./node_modules/within-sdk/package.json').version"` prints `1.0.4`. Read the package before running it: it is third-party code.

## 1. The checks on the stock package

```bash
node run-all.mjs        # about 6 minutes
```

Every check runs in its own process, because the package keeps one process-wide event queue: a check that hangs the stand-in would otherwise block every later check. To run only some: `node run-all.mjs C8 Z3` (it merges them with the saved output of the others).

**Expect** (`stress/results/sdk-1.0.4.json`): `FAIL` on `C8` (the freeze) and on no other check; gaps on `A1c`, `A10`, `B5`, `C1` to `C6`, `C12`, `C13`, `M8` and `Z3`; passes on `M1` to `M7` (what a vendor can do today). `F6` reads Within's public docs page, so it can change if Within edits it.

## 2. The patched copy

```bash
node patches.mjs        # builds ./patched-sdk; stops if any patch no longer matches exactly once
WITHIN_PKG_DIR=$PWD/patched-sdk OUT_DIR=$PWD/out-patched RESULTS_FILE=$PWD/../results/patched-1.0.4.json node run-all.mjs
```

**Expect:** `C8`, `A1c`, `Z3`, `C6`, `B5` and `M8` no longer fail or gap. `F2` and `F6` are skipped, because they test the published package.

## 3. The report and the pages

```bash
cd .. && npm run build:all
```

It redraws the ten sketches and the call-journey picture (`docs/diagrams/`, `docs/flow.svg`), rebuilds the interactive map (`docs/map.html`, `docs/explorer/`; the three diagrams need the Archify skill, set `ARCHIFY_DIR` if it is not in `~/.claude/skills/archify`), and then rewrites `FINDINGS.md`, `docs/findings.html`, `docs/index.html` and the summary block in `README.md` from `stress/findings.json` and the two results files. It stops if a placeholder cannot be resolved, if a finding has no failing check behind it, if a vendor-side fix does not pass, or if a patch does not turn its checks green.

## 4. What you cannot reproduce from here

- Within's hosted service, and what it does with what it receives.
- A real MCP host (Claude, ChatGPT) and a real deployment.
- How long Node's own network code waits before it gives up a stuck request (finding W-05): we watched for 15 seconds.
