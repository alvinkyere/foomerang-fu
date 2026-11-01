#!/bin/zsh
# The whole glade pipeline (from the repository root): measure -> layout -> props -> sand -> arena -> Blender -> render -> compare.
#   art/autumn_glade/run.sh [package]
PY=art/audio/output/venv/bin/python; T=${TMPDIR%/}/glade
$PY art/autumn_glade/layout.py >/dev/null && $PY art/autumn_glade/props.py >/dev/null && $PY art/autumn_glade/sand.py >/dev/null && $PY art/autumn_glade/arena.py >/dev/null || exit 1
/Applications/Blender.app/Contents/MacOS/Blender -b --python art/autumn_glade/blender/build.py -- $T render 2>&1 | grep -E "Error|Traceback|File \"|glade built" | head
cp $T/render.png art/autumn_glade/output/render.png; $PY art/autumn_glade/compare.py
[[ "$1" == package ]] && $PY art/autumn_glade/package.py $T/glade.glb
