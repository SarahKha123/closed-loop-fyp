#!/usr/bin/env bash
# Download the UCI Condition Monitoring of Hydraulic Systems dataset into data/raw/.
#
#   Helwig, N., Pignanelli, E., & Schütze, A. (2015). Condition monitoring of
#   hydraulic systems [Dataset]. UCI Machine Learning Repository.
#   https://doi.org/10.24432/C5CW21  (CC BY 4.0)
#
# Safe to re-run: skips the download when the files are already there.
set -euo pipefail
cd "$(dirname "$0")/.."

URL="https://archive.ics.uci.edu/static/public/447/condition+monitoring+of+hydraulic+systems.zip"
RAW=data/raw
FILES=(PS1 PS2 PS3 PS4 PS5 PS6 EPS1 FS1 FS2 TS1 TS2 TS3 TS4 VS1 CE CP SE profile)

have_all() { for f in "${FILES[@]}"; do [ -s "$RAW/$f.txt" ] || return 1; done; }

if have_all; then
  echo "dataset already in $RAW"
  exit 0
fi

mkdir -p "$RAW"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "downloading $URL (~73 MB, can take several minutes)"
curl -fsSL --retry 3 -o "$tmp/hydraulic.zip" "$URL"
unzip -q -o "$tmp/hydraulic.zip" -d "$tmp/x"
# The archive has used both a flat layout and a nested folder; take the .txt files wherever they are.
find "$tmp/x" -name '*.txt' -exec mv {} "$RAW/" \;

have_all || { echo "download finished but files are missing in $RAW" >&2; exit 1; }
echo "dataset ready in $RAW ($(du -sh "$RAW" | cut -f1))"
