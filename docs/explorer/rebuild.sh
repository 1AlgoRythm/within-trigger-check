#!/bin/bash
# Rebuild the five explorer pages from the JSON in src/ with the archify skill, and check each is byte-identical to the committed HTML.
# Built with archify 2.17.0-dev.1 (skill-release.json). Set ARCHIFY_DIR if the skill lives somewhere else.
# Output goes to a temporary folder; nothing in docs/explorer is overwritten unless you pass --write.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
A="${ARCHIFY_DIR:-$HOME/.claude/skills/archify}"
OUT="$(mktemp -d)"
for pair in architecture:l1-within-end-to-end architecture:l2-inside-the-sdk architecture:l2-within-side architecture:l2-new-in-040 sequence:l2-the-decision; do
  type="${pair%%:*}"; name="${pair##*:}"
  node "$A/bin/archify.mjs" deliver "$type" "$HERE/src/$name.$type.json" "$OUT/$name.html" --quality showcase --json > "$OUT/$name.receipt.json"
  if cmp -s "$OUT/$name.html" "$HERE/$name.html"; then echo "SAME       $name"; else echo "DIFFERENT  $name"; fi
  if [ "${1:-}" = "--write" ]; then cp "$OUT/$name.html" "$HERE/$name.html"; fi
done
echo "receipts and rebuilt pages: $OUT"
