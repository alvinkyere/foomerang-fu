#!/bin/sh
# The FRAME-MODE map factory: cleaned reference frame + cut-outs -> animated props -> characters through the map camera ->
# runtime package -> generated rules module. Everything map-specific is in maps/<map>.json (frame_mode, cutouts, animated, arena,
# character_scale, roster, rules_doc).
# usage: build_frame_map.sh <map> <frames_dir> <work_dir> <repo_root> <CONST_PREFIX> <rules_ts_file>
set -e
MAP=$1; FD=$2; WORK=$3; ROOT=$4; P=$5; TSFILE=$6
HERE=$(cd "$(dirname "$0")" && pwd); PY=${PYTHON:-python3}; BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
CFG="$HERE/../maps/$MAP.json"; mkdir -p "$WORK"
$PY "$HERE/build_frame_map.py" "$MAP" "$FD" "$WORK/bake"
$PY -c "import json,sys; sys.exit(0 if json.load(open('$CFG')).get('animated') else 1)" && $PY "$HERE/animate_prop.py" "$MAP" "$WORK/bake"
ROSTER=$($PY -c "import json;print(','.join(json.load(open('$CFG'))['roster']))")
[ -f "$WORK/chars/cells.json" ] || FOO_MAP=$MAP "$BLENDER" -b --python "$HERE/bake_chars.py" -- "$WORK/chars" 1920 "$ROSTER" > "$WORK/chars.log" 2>&1
rm -f "$ROOT/apps/console/public/maps/$MAP/"*.webp
$PY "$HERE/package_map.py" "$MAP" "$WORK/bake" "$WORK/chars" "$ROOT/apps/console/public/maps/$MAP"
$PY "$HERE/gen_arena_frame.py" "$MAP" "$WORK/bake" --ts "$P" > "$ROOT/$TSFILE"
$PY "$HERE/gen_arena_frame.py" "$MAP" "$WORK/bake" | $PY -c "import json,sys; a=json.load(sys.stdin); print('rules', a['width'], 'x', a['height'], len(a['walls']), 'blocks,', a['open_cells'], 'open spawn cells')"
