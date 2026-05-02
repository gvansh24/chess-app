#!/usr/bin/env bash
# Download all frontend dependencies (JS libs + chess piece PNGs) into ./frontend/.
# These files are NOT in git on purpose. Run this once after cloning, or whenever
# library versions change.
#
# Usage:  cd frontend && bash setup-libs.sh

set -euo pipefail

cd "$(dirname "$0")"

echo "==> JS / CSS libraries"
curl -fsSL -o jquery.min.js       "https://code.jquery.com/jquery-3.7.1.min.js"
curl -fsSL -o chess.min.js        "https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"
curl -fsSL -o chessboard.min.js   "https://cdn.jsdelivr.net/npm/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.js"
curl -fsSL -o chessboard.min.css  "https://cdn.jsdelivr.net/npm/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.css"

echo "==> Chess piece PNGs (Wikipedia theme)"
mkdir -p img/chesspieces
BASE="https://raw.githubusercontent.com/oakmac/chessboardjs/master/website/img/chesspieces/wikipedia"
for color in w b; do
    for piece in K Q R B N P; do
        name="${color}${piece}.png"
        curl -fsSL -o "img/chesspieces/${name}" "${BASE}/${name}"
    done
done

echo
echo "==> Done. File sizes:"
ls -lh jquery.min.js chess.min.js chessboard.min.js chessboard.min.css
ls -lh img/chesspieces/
echo
echo "Expected sizes (rough): jquery ~86K, chess ~15K, chessboard.js ~14K, chessboard.css ~1K, each piece ~3-7K"
