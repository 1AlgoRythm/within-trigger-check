#!/bin/bash
# The 20 labelled Trigger check prompts through real Claude (Haiku), 3 runs each, with 0.4.0 installed in the repo's top folder.
# THIS SPENDS YOUR CLAUDE CODE USAGE. Run from a clone where `npm install` has run (the top folder installs 0.4.0 from the mirror).
# Writes results/app-prompts-040.json (a summary line is printed).
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="$(mktemp -t app-prompts.XXXXXX)"
node app/repeat.mjs --ids b01,b02,b03,b04,b05,b06,b07,b08,b09,b10,n01,n02,n03,n04,n05,n06,n07,n08,n09,n10 --times 3 --model haiku > "$OUT"
python3 -I stress/scripts/aggregate_app.py "$OUT" stress/results/app-prompts-040.json "$(git rev-parse --short HEAD)"
