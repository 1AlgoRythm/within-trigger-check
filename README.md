# Stress test of Within's SDK, `@getwithin/sdk` 0.4.0

Within sells a sales agent that sits inside a company's MCP server. A company installs one npm package, `@getwithin/sdk`, and its customers can then ask buying questions inside Claude or ChatGPT. This repo tries to break version 0.4.0 of that package, the latest on npm, on a laptop and without ever contacting Within, and writes down each problem with the evidence, the code location and a fix.

**Read the findings:** [the interactive map](https://satyaasudarshan.me/within-trigger-check/), [the web report](https://satyaasudarshan.me/within-trigger-check/findings.html), or [FINDINGS.md](FINDINGS.md). Every finding has a hand-drawn sketch.

<!-- summary:start -->

**24 findings on `@getwithin/sdk` 0.4.0: 6 High, 11 Medium, 7 Low.** 43 checks on the stock package (11 pass, 14 gap, 10 info, 8 fail) and 9 for the newer parts (2 pass, 5 gap, 1 info, 1 fail), run 2026-11-23 18:21 UTC on the file npm serves.

- **What Within does.** Companies now let customers talk to them through AI assistants such as Claude or ChatGPT. Within sells a small add-on that a company installs once, so that a Within sales representative can join those conversations at the right moment.
- **What we did.** We tested version 0.4.0 of that add-on, the latest published version, on a laptop, against a pretend copy of Within's service, so nothing touched Within's real systems. We ran 43 checks, 9 more for the newer parts of the add-on, and put real AI assistants (Claude) through it.
- **What we found, in three kinds.** The add-on can break the company's own product. It can send customer details to Within that the documents never mention. And the documents and the software sometimes disagree.
- **What we found.** 24 problems: 6 High, 11 Medium and 7 Low. The High ones are W-02, W-04, W-09, W-10, W-11, W-21.
- **If a company fixes only a few things.** Make sure an outage at Within can never break the company's own answers, stop customer details leaving without being listed in the documents, and keep login passes on the company's own server.

| ID | Severity | What | Prototype fix |
|---|---|---|---|
| [W-02](FINDINGS.md#w-02) | High | When Within is down, the vendor's own answers can be changed, or fail | P1 |
| [W-04](FINDINGS.md#w-04) | High | A vendor tool that already has an input called `context` silently loses it | P2 |
| [W-09](FINDINGS.md#w-09) | High | Tools the vendor chose NOT to wrap still report to Within | P6 |
| [W-10](FINDINGS.md#w-10) | High | The AI's goal summary goes to Within with private details in it, and the docs table does not list it | none |
| [W-11](FINDINGS.md#w-11) | High | The customer's full question goes to Within unredacted, and the docs do not say so | none |
| [W-21](FINDINGS.md#w-21) | High | With the new identity option on, the customer's login token is sent to Within on every tool call | none |
| [W-03](FINDINGS.md#w-03) | Medium | A hung Within adds 5 seconds to every successful wrapped tool call, every time | none |
| [W-05](FINDINGS.md#w-05) | Medium | If the AI writes a goal longer than 300 characters, the whole tool call is rejected | none |
| [W-08](FINDINGS.md#w-08) | Medium | With argument capture on, very long text without spaces can freeze the vendor's server for seconds | P5 |
| [W-12](FINDINGS.md#w-12) | Medium | Error messages carry private details to Within even when argument capture is off | none |
| [W-13](FINDINGS.md#w-13) | Medium | With argument capture on, tool results also leave, and several secrets slip through | none |
| [W-15](FINDINGS.md#w-15) | Medium | The docs say a banned phrase replaces one paragraph. The code replaces all of the vendor's instructions | P7 |
| [W-18](FINDINGS.md#w-18) | Medium | On the SDK side, consent rests on the AI, because the SDK itself does not check that the customer chose | none |
| [W-19](FINDINGS.md#w-19) | Medium | On servers that keep no sessions, a rep's offer cannot find the customer | none |
| [W-20](FINDINGS.md#w-20) | Medium | A small AI model sometimes treats "compare two companies" as a sales question | P11 |
| [W-22](FINDINGS.md#w-22) | Medium | A new tool, report_void, is on by default, and the customer's own words in it go to Within unredacted | none |
| [W-24](FINDINGS.md#w-24) | Medium | With the hubs feature on, text written on Within's side is added to the vendor's own tool results, and the AI repeats it to the customer | none |
| [W-06](FINDINGS.md#w-06) | Low | When a rep's offer is attached, the vendor's own `_meta` data is removed | P4 |
| [W-07](FINDINGS.md#w-07) | Low | If the vendor's customer-identity function throws, the customer's tool call fails | P8 |
| [W-16](FINDINGS.md#w-16) | Low | A wrong key or a missing URL fails silently | P9 |
| [W-17](FINDINGS.md#w-17) | Low | Two lists of private-network addresses are defined and never used | none |
| [W-23](FINDINGS.md#w-23) | Low | When the AI app does not report its name, the first 80 characters of its user-agent text are sent as the app name | none |
| [W-25](FINDINGS.md#w-25) | Low | The new doctor command passes a server whose own `context` input is being removed (W-04) | none |
| [W-26](FINDINGS.md#w-26) | Low | The app-only hub_card tool can be called directly by any MCP client; only the host's label keeps the AI away from it | none |

<!-- summary:end -->

## Run it

Nothing here contacts Within. Every request goes to a stand-in server on `127.0.0.1`. The first two steps are free; the model runs spend Claude Code usage.

```bash
cd stress
npm install
scripts/fetch-040.sh           # downloads 0.4.0 from npm, checks its hash, unpacks it into stress/sdk-0.4.0
scripts/deterministic-040.sh   # the checks, the newer-parts checks, and the checks on a patched copy
npm run build:all              # redraws the sketches and the map, then rebuilds the report and the README summary
```

Every step, with the result to expect, is in [REPRODUCE.md](REPRODUCE.md).

## What is here

| Path | What it is |
|---|---|
| `stress/tests/`, `stress/run.mjs` | The 43 checks, one file per theme. Each prints a verdict: pass, gap, fail or info |
| `stress/new/`, `stress/run-new.mjs` | Nine more checks (N1 to N9) for the newer parts: identity, hubs, `report_void`, the doctor command |
| `stress/patches/` | Prototype fixes, each asserted to match exactly once, and the checks re-run on the patched copy |
| `stress/model/`, `stress/scripts/model-040.sh` | Real Claude (Haiku and Sonnet) through headless Claude Code |
| `stress/findings.json` | The one source for the report. Every number in its prose is a placeholder filled from `stress/results/` |
| `stress/build.mjs` | Builds the report and stops if a claim no longer matches the saved results |
| `stress/sketches.mjs` | Draws the 24 sketches and the call picture; every number is read from the saved results |
| `stress/map.mjs`, `stress/map.template.html` | Builds the interactive map: five diagrams (made with the Archify skill) and the clickable wrapper |
| `stress/results/` | What was measured |
| `fixes/`, `app/`, `server/`, `prompts.json` | The repo's own small fixes (`npm run fix`) and its test page, with a demo vendor server |
| `docs/` | The live pages (GitHub Pages): the map, the report, the sketches |

## Limits, stated plainly

- One machine, Node 26 on macOS. Not a deployed server, and not claude.ai or ChatGPT.
- Within's hosted service was not tested, and its source is not public. Anything that depends on it is untested: what it stores, what it redacts, whether it checks the login token the SDK sends.
- The automatic checks were run again on 2026-11-23 on the file npm serves today. The real-Claude runs are from 2026-11-20 and 2026-11-21, on the same file, and were not repeated because each batch spends Claude usage.
- Timings depend on the machine. Compare verdicts, not milliseconds.
- The patches are proposals written against the published file, not Within's code.
