#!/bin/zsh
# The whole temple court pipeline (from the repository root): layout -> floor -> arena -> Blender -> package.
#   art/temple_court/run.sh [package]
# (slow, their json committed: mosaic.py ~10 min (local output/ only), fit_planters.py, fit_big_planters.py, hexfields.py --fit ~4 min)
PY=art/audio/output/venv/bin/python; T=${TMPDIR%/}/temple
for s in layout fit_crowns tree_mass floor hexfields shadow_mass ground_field joints arena; do $PY art/temple_court/$s.py >/dev/null || exit 1; done
/Applications/Blender.app/Contents/MacOS/Blender -b --python art/temple_court/blender/build.py -- $T render plants 2>&1 | grep -E "Error|Traceback|court built"
cp $T/render.png art/temple_court/output/render.png
if [[ "$1" == package ]]; then
  /Applications/Blender.app/Contents/MacOS/Blender -b --python art/temple_court/blender/build.py -- $T 2>&1 | grep -E "Error|Traceback"
  $PY art/temple_court/package.py $T/court.glb
fi
npx prettier --write games/foomerang-fu/src/rules/templeCourtArena.ts "art/temple_court/*.json" apps/console/public/maps/temple_court/manifest.json >/dev/null
