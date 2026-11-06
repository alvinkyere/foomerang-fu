#!/bin/zsh
# The whole meadow pipeline (from the repository root): masks -> layout -> props -> pads -> masses -> arena -> Blender -> package.
#   art/hex_meadow/run.sh [package]      (then npx prettier --write games/foomerang-fu/src/rules/hexMeadowArena.ts "art/hex_meadow/*.json" apps/console/public/maps/hex_meadow/manifest.json)
# (slow fits, their json committed: fit_lattice.py, fit_rocks.py, fit_trees.py)
PY=art/audio/output/venv/bin/python; T=${TMPDIR%/}/meadow
for s in hud_mask layout props pads ground_field rock_mass canopy_mass shadow_mass leaf_mass bamboo arena; do $PY art/hex_meadow/$s.py >/dev/null || exit 1; done
/Applications/Blender.app/Contents/MacOS/Blender -b --python art/hex_meadow/blender/build.py -- $T render plants 2>&1 | grep -E "Error|Traceback|meadow built"
cp $T/render.png art/hex_meadow/output/render.png
[[ "$1" == package ]] && /Applications/Blender.app/Contents/MacOS/Blender -b --python art/hex_meadow/blender/build.py -- $T 2>&1 | grep -E "Error|Traceback" ; [[ "$1" == package ]] && $PY art/hex_meadow/package.py $T/meadow.glb
