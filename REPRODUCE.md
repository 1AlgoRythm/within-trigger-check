# Reproduce this: every step, with the result to expect

This is the one page that takes you from an empty folder to every number, finding, sketch and map page in this repo. Each step says what to run and what you should see. If you see something else, that is a result worth writing down.

Nothing here contacts Within's real service. Every request goes to a stand-in server on `127.0.0.1`. Steps 5 and 6 spend your Claude Code usage; the rest are free.

Last verified: 2026-11-21, macOS, Node 26, npm 11. Real-Claude numbers move from day to day (the same 0.3.0 package gave 3 of 10 on 2026-11-18 and 23 of 30 on 2026-11-21), so only compare runs made on the same day.

## 0. What you need

- Node and npm (we used Node v26.13.0), `curl`, `openssl`, `tar`, `python3`. We did not test older Node versions.
- For steps 5 and 6: Claude Code (`claude -p` must work). Steps 5 and 6 use Haiku and Sonnet.
- For step 8: the archify skill (`~/.claude/skills/archify`, version 2.17.0-dev.1) and Google Chrome.

```bash
git clone https://github.com/1AlgoRythm/within-trigger-check.git
cd within-trigger-check
```

## 1. Where the package comes from

On 2026-11-20 the npm catalogue (`registry.npmjs.org`) answered "not found" for the whole package, every version. The public mirror at `registry.npmmirror.com` still serves all eight versions (`0.0.0-stage`, `0.1.0` to `0.1.4`, `0.3.0`, `0.4.0`). Within's own docs still say "on npm" and "release 0.3.0". Why npm says 404 is not known from outside.

| Version | Mirror address | Integrity (sha512, as the mirror lists it) |
|---|---|---|
| 0.3.0 | `https://registry.npmmirror.com/@getwithin/sdk/-/sdk-0.3.0.tgz` | `sha512-RRMa1nSvtHFR455nNRPFlUu1Jz+deWANTq/PE1aQypHKcBcIwSTJTv5+bpB/6Wy8w30drJ7KkoZERAyEVLrecQ==` (the same hash npm gave us before the 404) |
| 0.4.0 | `https://registry.npmmirror.com/@getwithin/sdk/-/sdk-0.4.0.tgz` | `sha512-Kle6l4ZAo0GRF136R4d/GfsNySc0By4nR+gKBHtSnb/MUMQaEOGoERRXfS1/Yk09mzwYLr/M9hn97E31rEJYYA==` (not comparable with npm's own hash: there is none) |

Read the package before running it. It is third-party code.

## 2. Install

The top folder uses 0.4.0 (its `package.json` points at the mirror file), so this works as is:

```bash
npm install
```

The `stress/` folder is pinned to 0.3.0, the version the original 43 checks were measured on. Its lockfile points at the dead npm address, so install from the mirror (this rewrites `stress/package.json` in your copy; run `git checkout stress/package.json stress/package-lock.json` afterwards if you want it back):

```bash
cd stress
npm install https://registry.npmmirror.com/@getwithin/sdk/-/sdk-0.3.0.tgz
```

**Expect:** both installs finish without a 404. `node -p "require('./node_modules/@getwithin/sdk/package.json').version"` prints `0.3.0` in `stress/` and `0.4.0` in the top folder.

## 3. The 0.3.0 baseline (the original 43 checks)

```bash
cd stress && npm test          # about 2 minutes. 0.3.0's F2 needs the address, see below
```

Check `F2` installs the package into a temporary project, so give it the address too: `F2_SPEC=https://registry.npmmirror.com/@getwithin/sdk/-/sdk-0.3.0.tgz npm test`.

**Expect** (`results/latest.json`): pass 8, gap 14, fail 11, info 10.

## 4. Version 0.4.0, without any AI

```bash
cd stress
scripts/fetch-040.sh           # downloads, checks the hash (stops on MISMATCH), unpacks into stress/sdk-0.4.0
scripts/deterministic-040.sh   # the 43 checks, the nine new checks, the code comparison, the patched copy
```

**Expect:**

| File written | Result |
|---|---|
| `results/sdk-0.4.0.json` | pass 11, gap 14, fail 8, info 10 (W-01 and W-14 now pass; nothing else flips) |
| `results/new-in-040.json` | the nine checks N1 to N9: fail 1 (N1, the login token), pass 2 (N2, N6), info 1 (N3), gap 5 (N4, N5, N7, N8, N9) |
| `results/code-locations-0.4.0.json` | 26 functions that findings point at: 18 identical, 8 changed. Same verdict does not mean same code |
| `results/patched-0.4.0.json` | pass 19, gap 12, info 11, fail 1. Every prototype patch matches except P3; P10 is not needed. 9 of the 11 checks the patches fixed on 0.3.0 still flip to pass |

`fetch-040.sh` also prints the SHA-256 of `dist/index.js`: `56be6b34c9d7851fa9defcd34f283205674daa0a7a7f13b323e223271009b455`.

Timings in the result files depend on how busy the machine is. Compare verdicts, not milliseconds.

## 5. Version 0.4.0 with real Claude (spends usage)

```bash
cd stress
scripts/model-040.sh haiku     # about 250 short headless runs
scripts/model-040.sh sonnet    # about 120
```

This writes `results/model-<model>-T-S-040.json` (trigger and consent), `-X-040-stock.json` (comparison wording), `-V-040.json` (what the AI writes into `report_void`), `-X1-040-*`/`-X1-030-*` (W-20 against a same-day 0.3.0 control), `-X1-040P-*` (the wording patch) and `-H-040.json` (hubs on).

**Expect, on 2026-11-21** (yours will differ a little; the pattern is what matters):

| Question | Haiku | Sonnet |
|---|---|---|
| Buying questions that reached Within (5 trigger scenarios x 3) | 15 of 15 | 15 of 15 |
| Accept tool called in the 4 consent scenarios | 0 of 12 | 0 of 12 |
| Comparison question sent to Within (W-20), 0.4.0 against 0.3.0 the same day | 11 of 30 against 23 of 30 (p = 0.004) | 0 of 10 against 0 of 10 |
| Wording patch P11, comparison question | 0 of 30 (real competitor questions: 30 of 30) | not run |
| `report_void` used in ordinary runs | 24 of 87 | 28 of 57 |
| Name, phone or email copied into `report_void` (V1, V2) | 0 of 37 calls (both models together) | |
| Hubs on: AI repeated Within's line to the customer | 40 of 40 runs, both models together, including 20 of 20 where told not to | |
| Hubs on: AI opened the hub, or called `hub_card` | 0 of 40, and 0 of 40 | |

## 5b. Version 1.0.4, the public package (no AI, free)

On 2026-11-22 Within said the public package is `within-sdk` 1.0.4, on npm itself. It is different code from `@getwithin/sdk`, so it has its own folder, `stress/v104/`, with the checks that still make sense ported from `stress/tests/` (ids kept where the question carries over; Z1 to Z3, S1, C8b and C11 to C13 are new). Nothing contacts Within: every request goes to a stand-in on `127.0.0.1` or to a stubbed `fetch`, and the SDK's log file goes to a throwaway home folder.

```bash
cd stress/v104
npm install --ignore-scripts     # within-sdk 1.0.4 from npm, MCP SDK 1.32.2, Zod 3.25.76 and 4.6.7
node run-all.mjs                 # about 5 minutes; every check runs in its own process
node run-all.mjs C8 Z3           # only these, merged with the saved output of the others
cd .. && npm run build:findings  # rebuilds FINDINGS.md, FINDINGS-1.0.4.md and both web pages
```

**Expect** (`results/sdk-1.0.4.json`): 39 checks, pass 15, gap 12, info 11, fail 1 (`C8`, the freeze). The build stops if the saved results and `findings-1.0.4.json` disagree. Check `F2` runs `npm install` on a fresh project, so it needs the network. Compare verdicts, not milliseconds: on one machine the freeze at 100,000 letters took between 5.5 and 6.3 seconds in different runs.

**Why each check has its own process:** the package keeps one process-wide event queue. A first full run in a single process was invalid for that reason: after `A1` hung Within, every later check saw no events. That is also how W-27 was found.

## 6. The 20 labelled Trigger check prompts (spends usage)

```bash
stress/scripts/app-prompts-040.sh   # run it from the repo root, where 0.4.0 is installed
```

**Expect** (`stress/results/app-prompts-040.json`, Haiku, 3 runs each): recall 30 of 30, false alarms 1 of 30 (the prompt "Compare Ledgerly and Paywise").

## 7. The report

```bash
cd stress
npm run build:findings         # rebuilds ../FINDINGS.md and ../docs/findings.html
git diff --stat ../FINDINGS.md ../docs/findings.html    # expect no change if you did not rerun anything that changes results
```

The builder refuses to finish if a finding has no 0.4.0 check, if founder text contains jargon, or if prose says a finding is fixed when the check says otherwise. **Expect:** 26 findings (20 from 0.3.0, 6 new), of which 2 fixed, 1 reduced, 17 unchanged.

## 8. The map and the sketches

The map (`docs/index.html`) wraps five architecture pages and 21 hand-drawn sketches.

```bash
docs/explorer/rebuild.sh       # rebuilds the five pages from docs/explorer/src/*.json with archify and compares
```

**Expect:** `SAME` for all five (byte-identical with archify 2.17.0-dev.1). A different archify version may give `DIFFERENT` without anything being wrong; check the receipt printed at the end.

The sketches `docs/diagrams/01` to `21` are hand-written animated SVG (no build step). To look at one: `open docs/diagrams/16-login-token-sent.svg`. To see the map the way a visitor does, serve the folder over HTTP (the orange drill badges only appear over HTTP, not from `file://`):

```bash
python3 -m http.server 8765 --directory docs   # then open http://127.0.0.1:8765/
```

## 9. What you cannot reproduce from here

- What Within's server does with what it receives (for example the login token in W-21, or the text in W-22). It is private and nothing here reaches it.
- Why npm answers 404. Only Within can say.
- The real-Claude numbers to the digit. Models and days change them; the checks in steps 3 and 4 are the repeatable part.
