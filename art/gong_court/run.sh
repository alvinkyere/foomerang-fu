#!/bin/zsh
# The gong court pipeline (from the repository root): stones -> ground -> colours -> cards (against a wide render) -> render -> compare.
#   art/gong_court/run.sh [package]          (mosaic.py first, once: ~10 min; its output/ is local only)
PY=art/audio/output/venv/bin/python; B=/Applications/Blender.app/Contents/MacOS/Blender; T=${TMPDIR%/}/gong
$PY art/gong_court/fit_stones.py ${GROW:-0.08} >/dev/null || exit 1
for s in ground stone_colours tops; do $PY art/gong_court/$s.py >/dev/null || exit 1; done
$B -b --python art/gong_court/blender/build.py -- $T/wide render wide nocards 2>&1 | grep -E "Error|Traceback"
$PY art/gong_court/cards.py $T/wide/render.png >/dev/null || exit 1
$B -b --python art/gong_court/blender/build.py -- $T/frame render 2>&1 | grep -E "Error|Traceback"
$PY art/gong_court/compare.py $T/frame/render.png
if [[ "$1" == package ]]; then $PY art/gong_court/arena.py && $PY art/gong_court/package.py $T/frame/gong_court.glb; fi
npx prettier --write "art/gong_court/*.json" games/foomerang-fu/src/rules/gongCourtArena.ts apps/console/public/maps/gong_court/manifest.json >/dev/null 2>&1
