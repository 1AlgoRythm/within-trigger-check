# Stress tests for `@getwithin/sdk` 0.3.0 (and 0.4.0)

These tests try to break Within's SDK on a laptop. They never contact Within's real service: every request goes to a small stand-in server on `127.0.0.1`.

The readable results are in [`../FINDINGS.md`](../FINDINGS.md). This folder holds what produces them.

**Install note (2026-11-20).** npm's catalogue returns "not found" for `@getwithin/sdk`, so `npm install` in this folder fails with a 404 on a machine without a cached copy (tested with an empty cache). Install the 0.3.0 file from the public mirror instead; its hash is identical to the one npm gave us. This installs everything else too, and rewrites the dependency in your local `package.json`:

```bash
npm install https://registry.npmmirror.com/@getwithin/sdk/-/sdk-0.3.0.tgz
```

Check F2 installs the package from npm into a temporary project, so on 0.3.0 it needs the same address: `F2_SPEC=https://registry.npmmirror.com/@getwithin/sdk/-/sdk-0.3.0.tgz npm test`. Without it, F2 reports `ERROR` ("npm could not install the package") instead of a verdict, because that is a problem with npm, not a finding about the SDK.

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
| `new/040-only.mjs`, `run-new.mjs` | Five checks (N1 to N5) for behaviour that exists only in 0.4.0, found by reading its code. They run separately, so the 43 checks and their saved 0.3.0 results do not change |
| `code-locations.mjs` | Finds every function a finding points at, in two versions, and compares the exact text. It reads files as text and never runs the SDK |
| `lib/harness.mjs` | The stand-in for Within's API, and a helper that boots an MCP server with the SDK installed |
| `tests/` | The checks, in six files by topic. Each states what it expected, and why |
| `model/` | The real-Claude runs: trigger questions, consent and injection, and the comparison wording |
| `patches/apply.mjs` | Builds `patched-sdk/`: the stock package plus eleven small prototype patches, each one asserted to match exactly once |
| `findings.json` | The one source for the report. Numbers in its prose are placeholders filled from `results/` |
| `results/` | Saved output of every run. The real-Claude files for 0.4.0 are `model-haiku-T-S-040.json`, `model-haiku-X-040-*.json`, `model-haiku-V-040.json`, `model-haiku-X1-*.json` (three same-day batches each, 0.4.0, a 0.3.0 control and the wording patch) and `app-prompts-040.json`. `latest.json` is the stock package (0.3.0), `patched.json` the patched copy, `sdk-0.4.0.json` the same 43 checks on 0.4.0, `new-in-040.json` the five 0.4.0-only checks, `code-locations-0.4.0.json` the code comparison |

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
WITHIN_SDK_ENTRY="$PWD/sdk-0.4.0/dist/index.js" SDK_SOURCE="npmmirror.com copy of 0.4.0" node run-new.mjs   # the five 0.4.0-only checks, writes results/new-in-040.json
node code-locations.mjs node_modules/@getwithin/sdk/dist/index.js sdk-0.4.0/dist/index.js results/code-locations-0.4.0.json
npm run build:findings     # adds the "In 0.4.0" column, the three new findings and the update section to the report
```

`STOCK_COPY=1` marks the entry as an unmodified published package, not a patched copy. `F2_SPEC` lets check F2 install that tarball on a fresh project with the newest Zod, instead of skipping. Read the package before running it: it is third-party code. 

The prototype patches can be tried on another package too. `PATCH_REPORT=1` lists every patch that no longer matches instead of stopping at the first:

```bash
PATCH_SRC="$PWD/sdk-0.4.0" PATCH_REPORT=1 PATCH_OUT="$PWD/patched-sdk-040" node patches/apply.mjs
WITHIN_SDK_ENTRY="$PWD/patched-sdk-040/dist/index.js" RESULTS_FILE=results/patched-0.4.0.json node run.mjs   # writes results/patched-0.4.0.json
```

On 0.4.0 every patch matches except P3 (the code around it changed), and P10 is not needed because Zod is now a peer dependency.

### Real Claude on another version

The model runs read the same `WITHIN_SDK_ENTRY`, plus `STOCK_COPY=1` for an unmodified package and `RESULT_TAG` for the output name. Scenarios V1 and V2 put personal details in the question, to see whether the AI copies them into 0.4.0's `report_void` (it saves what it wrote as `voidInputs`).

```bash
E="$PWD/sdk-0.4.0/dist/index.js"
WITHIN_SDK_ENTRY="$E" STOCK_COPY=1 RESULT_TAG=T-S-040 node model/run-model.mjs --model haiku --only T1,T2,T3,T4,T5,S1,S2,S3,S4 --times 3
WITHIN_SDK_ENTRY="$E" STOCK_COPY=1 RESULT_TAG=V-040 node model/run-model.mjs --model haiku --only V1,V2 --times 10
WITHIN_SDK_ENTRY="$E" STOCK_COPY=1 RESULT_TAG=X1-040-a node model/run-model.mjs --model haiku --only X1 --times 10   # repeat as -b, -c
RESULT_TAG=X1-030-a node model/run-model.mjs --model haiku --only X1 --times 10                                  # the 0.3.0 control, taken in turn
```

Compare versions only within the same day: the same 0.3.0 package gave 3 of 10 on 2026-11-18 and 23 of 30 on 2026-11-21. The 20 labelled Trigger check prompts need a scratch clone of the repo with the version installed from its tarball (`npm install <tarball>`), then `node app/repeat.mjs --ids b01,...,n10 --times 3 --model haiku`. These runs spend Claude Code usage.

Timings in the results (milliseconds) depend on how busy the machine is, so compare orders of magnitude, not single numbers.
