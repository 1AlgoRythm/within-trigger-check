#!/bin/bash
# Fetch @getwithin/sdk 0.4.0 from the npm registry, check its hash, and unpack it into stress/sdk-0.4.0.
# Stops if the hash differs. Safe to run again (it reuses an existing download and refuses to overwrite sdk-0.4.0).
# The hash is the one npm lists (and the public mirror, registry.npmmirror.com, lists the same one).
set -euo pipefail
cd "$(dirname "$0")/.."
URL="https://registry.npmjs.org/@getwithin/sdk/-/sdk-0.4.0.tgz"
WANT="sha512-Kle6l4ZAo0GRF136R4d/GfsNySc0By4nR+gKBHtSnb/MUMQaEOGoERRXfS1/Yk09mzwYLr/M9hn97E31rEJYYA=="
TGZ="${SDK_TGZ:-/tmp/sdk-0.4.0.tgz}"
[ -s "$TGZ" ] || curl -sfL -o "$TGZ" "$URL"
GOT="sha512-$(openssl dgst -sha512 -binary "$TGZ" | openssl base64 -A)"
if [ "$WANT" != "$GOT" ]; then echo "MISMATCH: got $GOT"; exit 1; fi
echo "MATCH $GOT"
if [ -e sdk-0.4.0 ]; then echo "stress/sdk-0.4.0 already exists, leaving it as is"; else
  mkdir sdk-0.4.0 && tar -xzf "$TGZ" -C sdk-0.4.0 --strip-components=1
  echo "unpacked into stress/sdk-0.4.0"
fi
shasum -a 256 sdk-0.4.0/dist/index.js   # expected 56be6b34c9d7851fa9defcd34f283205674daa0a7a7f13b323e223271009b455
