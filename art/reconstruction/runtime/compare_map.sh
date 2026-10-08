#!/bin/sh
# Reference comparison for a proxy-kit map: the reconstruction is rendered through the SHOT's own solved camera at checkpoint frames
# (bake_proxies.py FOO_DEBUG_FRAME) and set beside the footage: reference | reconstruction | |difference| x3, one row per frame,
# with the mean absolute difference per frame. Characters and effects are absent from the reconstruction by design (they are the
# game's, drawn live), so their pixels count as difference.
# usage: compare_map.sh <map> <frames_dir> <ground_tex.png> <work_dir> <out.png> <frame> [<frame> ...]
set -e
MAP=$1; FD=$2; GT=$3; WORK=$4; OUT=$5; shift 5
HERE=$(cd "$(dirname "$0")" && pwd); PY=${PYTHON:-python3}; BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
for F in "$@"; do
  FOO_GROUND_ONLY=1 FOO_DEBUG_FRAME=$F FOO_RANK=0 "$BLENDER" -b --python "$HERE/bake_proxies.py" -- "$MAP" "$FD" "$GT" "$WORK/cmp_$F" > "$WORK/cmp_$F.log" 2>&1
done
$PY - "$FD" "$WORK" "$OUT" "$@" <<'EOF'
import sys, cv2, numpy as np
FD, WORK, OUT, FR = sys.argv[1], sys.argv[2], sys.argv[3], [int(f) for f in sys.argv[4:]]; rows = []
for f in FR:
    ref = cv2.imread(f'{FD}/f{f:04d}.png'); rec = cv2.resize(cv2.imread(f'{WORK}/cmp_{f}/ground.png'), (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_AREA)
    d = np.abs(ref.astype(int) - rec.astype(int)); mad = d.mean(); dif = np.clip(d * 3, 0, 255).astype(np.uint8)
    row = np.hstack([ref, rec, dif]); cv2.putText(row, f'f{f}  MAD {mad:.1f}', (8, 22), 0, 0.6, (255, 255, 255), 2); rows.append(row); print(f'f{f} MAD {mad:.2f}')
cv2.imwrite(OUT, np.vstack(rows)); print('comparison', OUT)
EOF
