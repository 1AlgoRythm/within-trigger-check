#!/bin/bash
# The checks that need no AI and spend nothing: the 43 checks on 0.4.0, the nine checks for the newer parts (N1 to N9),
# and the same 43 checks on a patched copy. Needs stress/sdk-0.4.0 (run fetch-040.sh first) and `npm install` in stress/.
# Nothing here contacts Within: every request goes to a stand-in on 127.0.0.1.
set -euo pipefail
cd "$(dirname "$0")/.."
TGZ="${SDK_TGZ:-/tmp/sdk-0.4.0.tgz}"
E="$PWD/sdk-0.4.0/dist/index.js"
echo "### 1/3 the 43 checks on 0.4.0 -> results/sdk-0.4.0.json (about 2 minutes)"
WITHIN_SDK_ENTRY="$E" STOCK_COPY=1 RESULTS_FILE=results/sdk-0.4.0.json F2_SPEC="$TGZ" SDK_SOURCE="registry.npmjs.org, @getwithin/sdk 0.4.0" node run.mjs
echo "### 2/3 the nine 0.4.0-only checks -> results/new-in-040.json"
WITHIN_SDK_ENTRY="$E" SDK_SOURCE="registry.npmjs.org, @getwithin/sdk 0.4.0" node run-new.mjs
echo "### 3/3 prototype patches on 0.4.0 (all match except P3), then the checks on the patched copy -> results/patched-0.4.0.json"
PATCH_SRC="$PWD/sdk-0.4.0" PATCH_REPORT=1 PATCH_OUT="$PWD/patched-sdk-040" node patches/apply.mjs
WITHIN_SDK_ENTRY="$PWD/patched-sdk-040/dist/index.js" RESULTS_FILE=results/patched-0.4.0.json node run.mjs
echo "done. Now: npm run build:all"
