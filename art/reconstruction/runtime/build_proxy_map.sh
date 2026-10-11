#!/bin/sh
# The map FACTORY for proxy-kit maps: ground texture -> N projected-frame bake passes -> median -> character atlases -> runtime package.
# Everything map-specific is in maps/<map>.json (camera, shot, ground fills, arena) and maps/proxies/<map>.json (measured primitives).
# usage: build_proxy_map.sh <map> <frames_dir> <work_dir> <out_public_dir> [passes]
set -e
MAP=$1; FD=$2; WORK=$3; OUT=$4; N=${5:-5}
HERE=$(cd "$(dirname "$0")" && pwd); PY=${PYTHON:-python3}; BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
CFG="$HERE/../maps/$MAP.json"; mkdir -p "$WORK"
read KEY F0 F1 STEP GX0 GX1 GY0 GY1 GS <<EOT
$($PY -c "import json;c=json.load(open('$CFG'))['shot'];print(c['camera_key'],*c['frames'],c['ground_step'],*c['ground_box'],c['ground_px_per_unit'])")
EOT
$PY "$HERE/../analysis/ground_texture.py" "$FD" "$KEY" "$F0" "$F1" "$STEP" "$GS" "$GX0" "$GX1" "$GY0" "$GY1" "$WORK/ground_tex.png" "$CFG"
PASSES=""
i=0; while [ $i -lt "$N" ]; do
  FOO_RANK=$i "$BLENDER" -b --python "$HERE/bake_proxies.py" -- "$MAP" "$FD" "$WORK/ground_tex.png" "$WORK/pass$i" > "$WORK/pass$i.log" 2>&1
  PASSES="$PASSES $WORK/pass$i"; i=$((i+1))
done
$PY "$HERE/combine_passes.py" "$WORK/bake" $PASSES
ROSTER=$($PY -c "import json;print(','.join(json.load(open('$CFG'))['roster']))")
[ -f "$WORK/chars/cells.json" ] || FOO_MAP=$MAP "$BLENDER" -b --python "$HERE/bake_chars.py" -- "$WORK/chars" 1920 "$ROSTER" > "$WORK/chars.log" 2>&1
$PY "$HERE/package_map.py" "$MAP" "$WORK/bake" "$WORK/chars" "$OUT"
