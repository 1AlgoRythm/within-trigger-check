# Stress tests for `@getwithin/sdk` 0.4.0

These tests try to break Within's SDK on a laptop. They never contact Within's real service: every request goes to a small stand-in server on `127.0.0.1`.

The readable results are in [`../FINDINGS.md`](../FINDINGS.md). This folder holds what produces them. Every step, with the result to expect, is in [`../REPRODUCE.md`](../REPRODUCE.md).

```bash
npm install
scripts/fetch-040.sh           # download 0.4.0 from npm, check its hash, unpack into sdk-0.4.0
scripts/deterministic-040.sh   # the checks, the newer-parts checks N1 to N9, and the patched copy
npm run build:all              # sketches, map, report
node run.mjs A3 C8             # run only some checks (set WITHIN_SDK_ENTRY to the package file)
```
