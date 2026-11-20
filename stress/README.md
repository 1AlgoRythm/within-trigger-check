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

## Run it on another version

The default run tests the 0.3.0 package in `node_modules`. To test another published version without touching that, unpack it inside `stress/` (it needs to find this folder's `zod` and MCP SDK; git ignores `stress/sdk-*/`) and point the run at it. This is how `results/sdk-0.4.0.json` was made.

Version 0.4.0 was not on `registry.npmjs.org` when we tested (the registry returned 404 for the whole package), so this fetches the copy held by npmmirror.com and checks it against the hash that mirror lists. We could not compare it with npm's own hash.

```bash
curl -sL -o /tmp/sdk-0.4.0.tgz https://registry.npmmirror.com/@getwithin/sdk/-/sdk-0.4.0.tgz
want="sha512-Kle6l4ZAo0GRF136R4d/GfsNySc0By4nR+gKBHtSnb/MUMQaEOGoERRXfS1/Yk09mzwYLr/M9hn97E31rEJYYA=="
got="sha512-$(openssl dgst -sha512 -binary /tmp/sdk-0.4.0.tgz | openssl base64 -A)"; [ "$want" = "$got" ] && echo MATCH || echo MISMATCH   # stop if MISMATCH
mkdir sdk-0.4.0 && tar -xzf /tmp/sdk-0.4.0.tgz -C sdk-0.4.0 --strip-components=1     # run from this folder
WITHIN_SDK_ENTRY="$PWD/sdk-0.4.0/dist/index.js" STOCK_COPY=1 RESULTS_FILE=results/sdk-0.4.0.json \
  F2_SPEC=/tmp/sdk-0.4.0.tgz SDK_SOURCE="npmmirror.com copy of 0.4.0" node run.mjs
npm run build:findings     # adds the "In 0.4.0" column and the update section to the report
```

`STOCK_COPY=1` marks the entry as an unmodified published package, not a patched copy. `F2_SPEC` lets check F2 install that tarball on a fresh project with the newest Zod, instead of skipping. Read the package before running it: it is third-party code. The prototype patches in `patches/apply.mjs` were written for 0.3.0 and were not re-run on 0.4.0.

Timings in the results (milliseconds) depend on how busy the machine is, so compare orders of magnitude, not single numbers.
