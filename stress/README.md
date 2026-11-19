# Stress tests for `@getwithin/sdk` 0.3.0

These tests try to break Within's SDK on a laptop. They never contact Within's real service: every request goes to a small stand-in server on `127.0.0.1`.

The readable results are in [`../FINDINGS.md`](../FINDINGS.md). This folder holds what produces them.

```bash
npm install
npm test               # the checks against the stock package, writes results/latest.json (about 2 minutes)
npm run test:patched   # builds a patched copy with prototype fixes and runs the same checks
npm run test:model     # real Claude through headless Claude Code, writes results/model-*.json
npm run build:findings # rebuilds ../FINDINGS.md and ../docs/findings.html from findings.json and results/
node run.mjs A3 C8     # run only some checks
```

| Path | What |
|---|---|
| `lib/harness.mjs` | The stand-in for Within's API, and a helper that boots an MCP server with the SDK installed |
| `tests/` | The checks, in six files by topic. Each states what it expected, and why |
| `model/` | The real-Claude runs: trigger questions, consent and injection, and the comparison wording |
| `patches/apply.mjs` | Builds `patched-sdk/`: the stock package plus eleven small prototype patches, each one asserted to match exactly once |
| `findings.json` | The one source for the report. Numbers in its prose are placeholders filled from `results/` |
| `results/` | Saved output of every run. `latest.json` is the stock package, `patched.json` the patched copy |

Verdicts: **pass** (did what the docs or a reasonable vendor would expect), **fail** (contradicts the docs or breaks something reasonable), **gap** (a risk or an undocumented behaviour, a decision for Within's team), **info** (a measurement).

Pinned versions: `@getwithin/sdk` 0.3.0, `@modelcontextprotocol/sdk` 1.32.2, `zod` 3.25.76. The check that follows the docs' install line on a fresh project (`F2`) installs the newest MCP SDK and Zod from npm on purpose, and records the versions it got.

The comparison-wording table in the main README uses three SDK variants. The stock package is the original wording, `patched-sdk` is fix v2, and fix v1 is rebuilt with:

```bash
WORDING=v1 PATCH_OUT=../patched-sdk-v1 node patches/apply.mjs
RESULT_TAG=X-v1 WITHIN_SDK_ENTRY=$PWD/patched-sdk-v1/dist/index.js node model/run-model.mjs --model haiku --only X1,X2,X3 --times 10
```

Timings in the results (milliseconds) depend on how busy the machine is, so compare orders of magnitude, not single numbers.
