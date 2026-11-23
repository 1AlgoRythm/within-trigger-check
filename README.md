# Stress test of Within's public package, `within-sdk`

Within sells a recorder for AI tool calls. A company installs one npm package, `within-sdk`, and it watches every tool call on the company's MCP server and sends a copy to Within. This repo tries to break that package on a laptop, without ever contacting Within, and for each problem it finds it tests two things: **what a vendor can do today** with the package's own options, and **what Within would have to change**, shown on a patched copy.

**Read the findings:** [the web page](https://1algorythm.github.io/within-trigger-check/findings.html), [the one-screen summary](https://1algorythm.github.io/within-trigger-check/), or [FINDINGS.md](FINDINGS.md).

<!-- summary:start -->

**10 findings on `within-sdk` 1.0.4: 2 High, 6 Medium, 2 Low.** 48 checks on the stock package (23 pass, 14 gap, 10 info, 1 fail), tested 2026-11-23 17:42 UTC.

- **In short.** 48 checks ran on Within's public package, version 1.0.4 (23 pass, 14 gap, 10 info, 1 fail). We found 10 problems: 2 High, 6 Medium and 2 Low.
- **The most serious.** One long piece of unbroken text in a customer's request freezes the company's whole AI server for about 4.4 seconds at 100,000 characters. The package's own size limit does not stop it. A vendor can avoid it today with its own redaction function, and Within can fix it by changing the order of two steps.
- **Customer data.** The package sends what customers ask for, and what the company's tools answer, to Within by default. It hides only a short list of private details, and some only when they are the whole value.
- **What a vendor can do.** 8 of the 10 problems have a fix that works today with the package's own options. 6 have a small change that Within could make, and we tested each one on a patched copy: P1 for W-01, P4 for W-04, P2 for W-05, P3 for W-06, P6 for W-07, P5 for W-10.
- **What held up.** An outage at Within does not change or slow the company's own answers, a broken reply from Within does not hurt the company's tools, 40 customers at once do not mix their data, and the company's own instructions are left alone.

| ID | Severity | What | Vendor fix today | Within's fix, tested |
|---|---|---|---|---|
| [W-01](FINDINGS.md#w-01) | High | One long run of plain letters freezes the vendor's whole server for seconds | yes | yes (P1) |
| [W-02](FINDINGS.md#w-02) | High | Private details written inside a sentence are not hidden in the goal text, in arguments, in results or in error messages | yes | not patched |
| [W-03](FINDINGS.md#w-03) | Medium | Tool arguments and tool results go to Within by default, and the only off switch turns all reporting off | yes | not patched |
| [W-04](FINDINGS.md#w-04) | Medium | Argument names such as name, address, date of birth and IP address are not treated as private | yes | yes (P4) |
| [W-05](FINDINGS.md#w-05) | Medium | When Within stops answering, later reports stay stuck behind the stuck ones, even after Within recovers | yes | yes (P2) |
| [W-06](FINDINGS.md#w-06) | Medium | A server that loads the package ignores the first request to shut down | yes | yes (P3) |
| [W-07](FINDINGS.md#w-07) | Medium | A vendor's redaction function is handed the API key and the address events go to, and changing them stops delivery silently | no | yes (P6) |
| [W-08](FINDINGS.md#w-08) | Medium | Every tool call on the server is reported, and none can be left out | no | not patched |
| [W-09](FINDINGS.md#w-09) | Low | A missing or rejected key shows only in a log file in the home folder, and the file only grows | yes | not patched |
| [W-10](FINDINGS.md#w-10) | Low | Every vendor tool gets a required "context" input, and the model sees one extra tool | yes | yes (P5) |

<!-- summary:end -->

## Run it

Nothing here contacts Within. Every request goes to a stand-in server on `127.0.0.1` or to a stubbed `fetch`. Node 20 or later.

```bash
cd stress/v104
npm install --ignore-scripts          # within-sdk 1.0.4 from npm
node run-all.mjs                      # the checks on the stock package, about 6 minutes
node patches.mjs                      # builds patched-sdk with six small fixes (P1 to P6)
WITHIN_PKG_DIR=$PWD/patched-sdk OUT_DIR=$PWD/out-patched RESULTS_FILE=$PWD/../results/patched-1.0.4.json node run-all.mjs
cd .. && npm run build:findings       # rebuilds FINDINGS.md, docs/findings.html and docs/index.html
```

Every step, with the result to expect, is in [REPRODUCE.md](REPRODUCE.md).

## What is here

| Path | What it is |
|---|---|
| `stress/v104/checks.mjs` | The checks. Ids starting with M try what a vendor can do with the package's options. Each runs in its own process |
| `stress/v104/patches.mjs` | Builds the patched copy: six small fixes, each asserted to match exactly once |
| `stress/findings.json` | The one source for the report. Every number in its prose is a placeholder filled from `stress/results/` |
| `stress/build.mjs` | Builds the report and the pages, and stops if a claim no longer matches the saved results |
| `stress/results/sdk-1.0.4.json`, `patched-1.0.4.json` | What was measured, on the stock and the patched package |
| `docs/` | The live pages (GitHub Pages) |

## Earlier versions

The report and interactive map for `@getwithin/sdk` 0.3.0 and 0.4.0, a package npm does not serve, were removed on 2026-11-22. The sales agent, consent step and `get_vendor_answer` tool they covered are not in `within-sdk`. They are kept in the git tag [`archive-0.4.0`](https://github.com/1AlgoRythm/within-trigger-check/tree/archive-0.4.0).

## Limits, stated plainly

- One machine, Node 26 on macOS, and the in-memory MCP transport. Not a deployed server or a real MCP client.
- Within's hosted service was not tested. The package's README says Within applies a second redaction pass on its side; we cannot see it.
- Timings depend on the machine. Compare verdicts, not milliseconds: the freeze at 100,000 letters took between 5.5 and 6.3 seconds in different runs.
- The patches are proposals written against the published files, not Within's code.
