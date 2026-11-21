#!/bin/bash
# The checks that need no AI and spend nothing: the 43 original checks on 0.4.0, the nine 0.4.0-only checks (N1 to N9),
# the code comparison, and the same 43 checks on a patched copy. Needs stress/sdk-0.4.0 (run fetch-040.sh first) and `npm install` in stress/ (0.3.0 baseline).
# Nothing here contacts Within: every request goes to a stand-in on 127.0.0.1.
set -euo pipefail
cd "$(dirname "$0")/.."
TGZ="${SDK_TGZ:-/tmp/sdk-0.4.0.tgz}"
E="$PWD/sdk-0.4.0/dist/index.js"
echo "### 1/4 the 43 checks on 0.4.0 -> results/sdk-0.4.0.json (about 2 minutes)"
WITHIN_SDK_ENTRY="$E" STOCK_COPY=1 RESULTS_FILE=results/sdk-0.4.0.json F2_SPEC="$TGZ" SDK_SOURCE="npmmirror.com copy of 0.4.0" node run.mjs
echo "### 2/4 the nine 0.4.0-only checks -> results/new-in-040.json"
WITHIN_SDK_ENTRY="$E" SDK_SOURCE="npmmirror.com copy of 0.4.0" node run-new.mjs
echo "### 3/4 the code comparison, 0.3.0 against 0.4.0 -> results/code-locations-0.4.0.json"
node code-locations.mjs node_modules/@getwithin/sdk/dist/index.js sdk-0.4.0/dist/index.js results/code-locations-0.4.0.json
echo "### 4/4 prototype patches on 0.4.0 (all match except P3), then the checks on the patched copy -> results/patched-0.4.0.json"
PATCH_SRC="$PWD/sdk-0.4.0" PATCH_REPORT=1 PATCH_OUT="$PWD/patched-sdk-040" node patches/apply.mjs
WITHIN_SDK_ENTRY="$PWD/patched-sdk-040/dist/index.js" RESULTS_FILE=results/patched-0.4.0.json node run.mjs
echo "done. Now: npm run build:findings"
