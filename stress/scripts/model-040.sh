#!/bin/bash
# Real Claude on 0.4.0, through headless `claude -p`. THIS SPENDS YOUR CLAUDE CODE USAGE (about 250 short runs for Haiku, about 120 for Sonnet).
# Usage: scripts/model-040.sh haiku   (or: sonnet)
# Needs stress/sdk-0.4.0 and, for Haiku's patched runs, stress/patched-sdk-040 (run deterministic-040.sh first).
# Compare versions only within the same day: the same 0.3.0 package gave 3 of 10 on 2026-11-18 and 23 of 30 on 2026-11-21.
set -euo pipefail
M="${1:?usage: model-040.sh haiku|sonnet}"
cd "$(dirname "$0")/.."
E="$PWD/sdk-0.4.0/dist/index.js"; P="$PWD/patched-sdk-040/dist/index.js"
run() { # tag, entry ("" = the 0.3.0 package in node_modules), scenarios, times
  if [ -n "$2" ]; then WITHIN_SDK_ENTRY="$2" STOCK_COPY=1 RESULT_TAG="$1" node model/run-model.mjs --model "$M" --only "$3" --times "$4"
  else RESULT_TAG="$1" node model/run-model.mjs --model "$M" --only "$3" --times "$4"; fi
}
echo "START $(date)"
echo "### trigger and consent, 0.4.0, 3 runs each";           run T-S-040 "$E" T1,T2,T3,T4,T5,S1,S2,S3,S4 3
echo "### comparison wording, 0.4.0, 10 runs each";           run X-040-stock "$E" X1,X2,X3 10
echo "### what the AI writes into report_void (V1, V2)";      run V-040 "$E" V1,V2 10
if [ "$M" = "haiku" ]; then
  for b in a b c; do
    echo "### W-20 sample $b: X1 x10 on 0.4.0, then the 0.3.0 control the same day"
    run X1-040-$b "$E" X1 10
    run X1-030-$b "" X1 10
  done
  echo "### wording patch P11 on patched 0.4.0 (3 batches; this one is NOT marked STOCK_COPY because it is patched)"
  for b in a b c; do WITHIN_SDK_ENTRY="$P" RESULT_TAG=X1-040P-$b node model/run-model.mjs --model haiku --only X1,X2 --times 10; done
  echo "### patched 0.4.0, wording scenarios (X1 to X3)"
  WITHIN_SDK_ENTRY="$P" RESULT_TAG=X-040-patched node model/run-model.mjs --model haiku --only X1,X2,X3 --times 10
else
  echo "### W-20 on $M: X1 x10 on 0.4.0, then 0.3.0 the same day"
  run X1-040-a "$E" X1 10
  run X1-030-a "" X1 10
fi
echo "### hubs on (H1, H2): does the AI repeat Within's invitation line?"
run H-040 "$E" H1,H2 10
echo "END $(date)"
