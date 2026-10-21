"""The fountain water's field (2026-10-21): how far each spot of the water is from its nearest edge, the basin's wall or the
shell island, seen from above; the plaza's water shader (render/three/waterShader.ts) draws the video's glow and foam from it.

The reference video's water is not a flat disc: a pale glow hugs every edge (wall and island alike), and thin light foam lines
are born at each edge and drift slowly away from it, fading, broken into pieces (its 2:10-2:20 traced along three radii,
art/physics_reference/README.md, "The water"). Lines that follow an edge are lines of equal distance from it: that distance is
what this bakes, from the plaza's own meshes, so the foam follows the island's shell outline exactly.

  R: distance to the nearest edge, 0 … FAR units (0 outside the water)
  G: smooth noise (tiling), which breaks the foam lines into pieces
Rows run north to south (scene z rising), columns west to east, over the water's square bounding box.

  python art/physics_reference/water_field.py       (from the repository root)
"""
import json, struct
import numpy as np, cv2

GLB = 'apps/console/public/maps/market_plaza/plaza.glb'
OUT = 'apps/console/public/maps/market_plaza/water.png'
N = 256        # texels across the water's box
FAR = 2.0      # scene units that R's 255 stands for
ISLAND = ('FOUNTAIN_dish', 'FOUNTAIN_bowl', 'FOUNTAIN_tab')

b = open(GLB, 'rb').read()
n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n]); data = b[20 + n + 8:]


def accessor(i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    k = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
    dt = np.dtype({5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']])
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride') or k * dt.itemsize
    raw = np.frombuffer(data, np.uint8, (a['count'] - 1) * stride + k * dt.itemsize, off)
    return np.lib.stride_tricks.as_strided(raw, (a['count'], k * dt.itemsize), (stride, 1)).copy().view(dt).reshape(-1, k)


def local(nd):
    if 'matrix' in nd: return np.array(nd['matrix']).reshape(4, 4).T
    x, y, z, w = nd.get('rotation', [0, 0, 0, 1]); m = np.eye(4)
    m[:3, :3] = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                          [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                          [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]) * np.array(nd.get('scale', [1, 1, 1]))
    m[:3, 3] = nd.get('translation', [0, 0, 0]); return m


tris = {}  # mesh name -> triangles (world x, z)
def walk(i, parent):
    nd = j['nodes'][i]; world = parent @ local(nd); name = nd.get('name', '')
    if 'mesh' in nd and name.startswith('FOUNTAIN'):
        for p in j['meshes'][nd['mesh']]['primitives']:
            v = accessor(p['attributes']['POSITION']); v = (world @ np.c_[v, np.ones(len(v))].T).T
            idx = accessor(p['indices']).ravel() if 'indices' in p else np.arange(len(v))
            tris.setdefault(name, []).append(v[idx][:, [0, 2]].reshape(-1, 3, 2))
    for c in nd.get('children', []): walk(c, world)
for r in j['scenes'][0]['nodes']: walk(r, np.eye(4))

water = np.concatenate(tris['FOUNTAIN_water'])
x0, z0 = water.reshape(-1, 2).min(0); x1, z1 = water.reshape(-1, 2).max(0)
cx, cz, R = (x0 + x1) / 2, (z0 + z1) / 2, max(x1 - x0, z1 - z0) / 2 * 1.03  # (a margin: dry all round)
S = 4  # supersampled, for smooth outlines
def fill(groups):
    m = np.zeros((N * S, N * S), np.uint8)
    for t in np.concatenate(groups):
        pts = ((t - [cx - R, cz - R]) / (2 * R) * N * S).round().astype(np.int32)
        cv2.fillConvexPoly(m, pts, 255)
    return m
wet = cv2.morphologyEx(fill(tris['FOUNTAIN_water']), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) > 0  # (closes hairline seams)
island = fill([g for k in ISLAND for g in tris[k]]) > 0
open_water = (wet & ~island).astype(np.uint8)
d = cv2.distanceTransform(open_water, cv2.DIST_L2, 5) * (2 * R) / (N * S)   # scene units
d = cv2.resize(d, (N, N), interpolation=cv2.INTER_AREA)
r = np.clip(d / FAR * 255, 0, 255).astype(np.uint8)

rng = np.random.default_rng(7)  # noise: random values, smoothed with wrap-round so it tiles
g = rng.random((N, N)).astype(np.float32)
g = cv2.GaussianBlur(np.tile(g, (3, 3)), (0, 0), 5)[N:2 * N, N:2 * N]
g = np.clip((g - g.mean()) / (g.std() * 4) + 0.5, 0, 1)
out = np.dstack([np.zeros((N, N), np.uint8), (g * 255).astype(np.uint8), r])  # BGR
cv2.imwrite(OUT, out, [cv2.IMWRITE_PNG_COMPRESSION, 9])
print('water box centre', round(float(cx), 3), round(float(cz), 3), 'half', round(float(R), 3),
      '; island covers', round(float(island.mean()) * 100), '% ; far', FAR)
