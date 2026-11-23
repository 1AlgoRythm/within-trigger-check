# Reproduce this: every step, with the result to expect

This takes you from an empty folder to every number, finding, sketch and map page in this repo. Nothing here contacts Within's real service: every request goes to a stand-in server on `127.0.0.1`. Steps 1 to 3 are free. Step 4 spends your Claude Code usage.

Last verified: 2026-11-23, macOS, Node 26, npm 11. Timings depend on the machine, so compare verdicts, not milliseconds.

## 0. What you need

- Node and npm (we used Node v26.13.0), `curl`, `openssl`, `tar`, `python3`.
- For step 4: Claude Code (`claude -p` must work). It uses Haiku and Sonnet.
- For step 5: the Archify skill (`~/.claude/skills/archify`, version 2.17.0-dev.1) and Google Chrome.

```bash
git clone https://github.com/1AlgoRythm/within-trigger-check.git
cd within-trigger-check/stress
npm install
```

## 1. The package

`@getwithin/sdk` 0.4.0 is on npm (checked 2026-11-23). The script downloads the file, checks its hash, and unpacks it into `stress/sdk-0.4.0`.

```bash
scripts/fetch-040.sh
```

**Expect:** `MATCH sha512-Kle6l4ZAo0GRF136R4d/GfsNySc0By4nR+gKBHtSnb/MUMQaEOGoERRXfS1/Yk09mzwYLr/M9hn97E31rEJYYA==`, then the SHA-256 of `dist/index.js`: `56be6b34c9d7851fa9defcd34f283205674daa0a7a7f13b323e223271009b455`. The script stops on a mismatch. Read the package before running it: it is third-party code.

## 2. The checks, without any AI

```bash
scripts/deterministic-040.sh
```

**Expect:**

| File written | Result |
|---|---|
| `results/sdk-0.4.0.json` | the 43 checks: pass 11, gap 14, fail 8, info 10 |
| `results/new-in-040.json` | the nine checks N1 to N9: fail 1 (N1, the login token), pass 2 (N2, N6), info 1 (N3), gap 5 (N4, N5, N7, N8, N9) |
| `results/patched-0.4.0.json` | the same 43 checks on a patched copy: pass 19, gap 12, info 11, fail 1. Every prototype patch matches except P3 |

## 3. The report, the sketches and the map

```bash
npm run build:all
```

It redraws the 24 sketches and the call picture (`docs/diagrams/`, `docs/flow.svg`), rebuilds the interactive map (`docs/index.html`, `docs/explorer/`; the five diagrams need the Archify skill, set `ARCHIFY_DIR` if it is not in `~/.claude/skills/archify`), and rewrites `FINDINGS.md`, `docs/findings.html` and the summary block in `README.md` from `stress/findings.json` and the saved results. It stops if a placeholder cannot be resolved, if a finding has no check that is a gap or a fail (one finding is allowed an info check, and says why), if a sketch is missing, or if founder-level text uses jargon.

## 4. Real Claude (spends usage)

```bash
scripts/model-040.sh haiku     # about 250 short headless runs
scripts/model-040.sh sonnet    # about 120
```

This writes `results/model-<model>-*.json`. The saved runs in this repo are from 2026-11-20 and 2026-11-21, on the same package file. Real-Claude numbers move from day to day, so compare only runs made on the same day.

**Expect, on 2026-11-21** (yours will differ a little; the pattern is what matters):

| Question | Haiku | Sonnet |
|---|---|---|
| Buying questions that reached Within (5 scenarios x 3) | 15 of 15 | 15 of 15 |
| Accept tool called in the 4 consent scenarios | 0 of 12 | 0 of 12 |
| Comparison question sent to Within (W-20) | 11 of 30 | 0 of 10 |
| Wording patch P11, comparison question | 0 of 30 (real competitor questions: 30 of 30) | not run |
| `report_void` used in ordinary runs | 24 of 87 | 28 of 57 |
| Name, phone or email copied into `report_void` | 0 of 37 calls (both models together) | |
| Hubs on: the AI repeated Within's line to the customer | 40 of 40 runs, both models together, including 20 of 20 where told not to | |
| Hubs on: the AI opened the hub, or called `hub_card` | 0 of 40, and 0 of 40 | |

## 5. What you cannot reproduce from here

- Within's hosted service, and what it does with what it receives.
- A real MCP host (Claude, ChatGPT) and a real deployment.
