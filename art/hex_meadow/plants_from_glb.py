"""The hex plants wherever a map already has them (owner, 2026-11-06: "the same physics ... across all maps where they appear"): reads a
map's model (apps/console/public/maps/<map>/plaza.glb), finds its hex plants' plates (the nodes matching the given pattern), and writes
them into the map's manifest as `plants` groups (one per plant: its plates' middles in the scene's ground units, their size, height,
turn, shades and flowers), with `plantsReplace`: the node-name pattern the game hides, drawing the plants itself instead (pushed aside,
springing back, burning: apps/console/src/render/hexPlants.ts), so they look as built and move as the meadow's.

  python art/hex_meadow/plants_from_glb.py <map> <plates pattern> <group pattern> [<buds pattern>] [<replace pattern>]
    gong_islands  '^HEXPLANT_\\d+_plates$'  '^HEXPLANT_(\\d+)_'  '^HEXPLANT_\\d+_dots$'  '^HEXPLANT_\\d+_'
    market_plaza  '^TREE_2[5-8]_tree_hex\\d+$'  '^TREE_(2[5-8])_'  ''  '^TREE_2[5-8]_tree'
(from the repository root; the Python of art/audio/output/venv; then npx prettier --write the manifest)
"""
import json, math, re, struct, sys
import numpy as np

MAP, PLATES, GROUP = sys.argv[1], re.compile(sys.argv[2]), re.compile(sys.argv[3])
BUDS = re.compile(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else None
REPLACE = sys.argv[5] if len(sys.argv) > 5 else sys.argv[3]
D = f'apps/console/public/maps/{MAP}/'
b = open(D + 'plaza.glb', 'rb').read()
n0 = struct.unpack('<I', b[12:16])[0]; G = json.loads(b[20:20 + n0])
bin_at = 20 + n0 + 8
TYPES = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}
SIZES = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def accessor(i):
    a = G['accessors'][i]; v = G['bufferViews'][a['bufferView']]
    dt = TYPES[a['componentType']]; k = SIZES[a['type']]
    start = bin_at + v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', 0)
    if stride and stride != k * np.dtype(dt).itemsize:
        raw = np.frombuffer(b, np.uint8, a['count'] * stride, start).reshape(a['count'], stride)
        out = raw[:, :k * np.dtype(dt).itemsize].copy().view(dt).reshape(a['count'], k)
    else:
        out = np.frombuffer(b, dt, a['count'] * k, start).reshape(a['count'], k).astype(np.float64)
    if a.get('normalized'): out = out / np.iinfo(dt).max
    return out


def local(node):
    m = np.eye(4)
    if 'matrix' in node: return np.array(node['matrix']).reshape(4, 4).T
    t = node.get('translation', [0, 0, 0]); r = node.get('rotation', [0, 0, 0, 1]); s = node.get('scale', [1, 1, 1])
    x, y, z, w = r
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m[:3, :3] = R * np.array(s)[None, :]; m[:3, 3] = t
    return m


world = {}
def walk(i, parent):
    m = parent @ local(G['nodes'][i]); world[i] = m
    for c in G['nodes'][i].get('children', []): walk(c, m)
for r in G['scenes'][G.get('scene', 0)]['nodes']: walk(r, np.eye(4))


def triangles(i):
    """A node's triangles in the scene (n x 3 x 3) and their vertex colours (n x 3 x 3, sRGB 0..1)."""
    mesh = G['meshes'][G['nodes'][i]['mesh']]; tris, cols = [], []
    for p in mesh['primitives']:
        P = accessor(p['attributes']['POSITION']); P = (world[i] @ np.c_[P, np.ones(len(P))].T).T[:, :3]
        if 'COLOR_0' in p['attributes']:
            C = accessor(p['attributes']['COLOR_0'])[:, :3]
            C = np.where(C <= 0.0031308, 12.92 * C, 1.055 * np.power(np.clip(C, 0, None), 1 / 2.4) - 0.055)      # (linear -> sRGB)
        else:
            f = G['materials'][p['material']]['pbrMetallicRoughness'].get('baseColorFactor', [1, 1, 1, 1])[:3]
            C = np.tile([v if v > 1 else (12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055) for v in f], (len(P), 1))
        idx = accessor(p['indices']).astype(int).ravel() if 'indices' in p else np.arange(len(P))
        tris.append(P[idx].reshape(-1, 3, 3)); cols.append(C[idx].reshape(-1, 3, 3))
    return np.concatenate(tris), np.concatenate(cols)


def plates_of(T, C):
    """Connected plates (triangles sharing a vertex position): each one's middle, top, radius, turn and colour."""
    key = {tuple(np.round(v, 3)) for v in T.reshape(-1, 3)}; idx = {k: i for i, k in enumerate(key)}
    parent = list(range(len(idx)))
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for t in T:
        ks = [idx[tuple(np.round(v, 3))] for v in t]
        for k in ks[1:]: parent[find(k)] = find(ks[0])
    groups = {}
    for n, t in enumerate(T): groups.setdefault(find(idx[tuple(np.round(t[0], 3))]), []).append(n)
    out = []
    for tri in groups.values():
        V = T[tri].reshape(-1, 3); c = V.mean(0)
        d = np.hypot(V[:, 0] - c[0], V[:, 2] - c[2]); far = V[np.argmax(d)]
        out.append(dict(x=float(c[0]), z=float(c[2]), y=float(V[:, 1].max()), r=float(d.max()),
                        turn=float(math.atan2(far[2] - c[2], far[0] - c[0]) % (math.pi / 3)), colour=np.median(C[tri].reshape(-1, 3), 0)))
    return out


# each map's plants as its model was built (its plates' colours are a texture or a build palette, not vertex colours alone):
#   gong_islands  art/sky_islands/objects.py: plates #8ddea2 at the middle, #7ed39a rim, a third dark #6bc691; stems #6bc691; buds #f4d98c
#   market_plaza  art/physics_reference/README.md (2:38.5): plates #f79762, #f9a96e at the middle, #eb925e at the rim; stems hex_stem's
LOOKS = {'gong_islands': dict(stem='#6bc691', flower='#f4d98c', rim=0.92),
         'market_plaza': dict(shade=['#f79762'], stem='#f59761', rim=0.95)}
hexs = lambda c: '#%02x%02x%02x' % tuple(int(round(min(1, max(0, v)) * 255)) for v in c)
by_group = {}
for i, nd in enumerate(G['nodes']):
    if 'mesh' not in nd or not PLATES.search(nd.get('name', '')): continue
    g = GROUP.search(nd['name']).group(1)
    T, C = triangles(i)
    by_group.setdefault(g, []).extend(plates_of(T, C))
buds = {}
if BUDS:
    for i, nd in enumerate(G['nodes']):
        if 'mesh' in nd and BUDS.search(nd.get('name', '')):
            T, C = triangles(i); g = GROUP.search(nd['name']).group(1)
            for bud in plates_of(T, C): buds.setdefault(g, []).append(np.array([bud['x'], 0, bud['z']]))      # (each bud: its own blob)
groups = []
for g, pl in sorted(by_group.items()):
    pl = [p for p in pl if p['r'] > 0.05]
    # the shades: the plates' colours in up to three tones by lightness (dark .. light), each plate its nearest
    L = np.array([p['colour'].sum() for p in pl]); order = np.argsort(L)
    k = min(3, len(set(np.round(L, 2))))
    cuts = [order[int(len(order) * q / k):int(len(order) * (q + 1) / k)] for q in range(k)]
    shade = [hexs(np.median([pl[i]['colour'] for i in c], 0)) for c in cuts]
    tone = np.zeros(len(pl), int)
    for q, c in enumerate(cuts): tone[c] = q
    flower = np.zeros(len(pl), bool)
    for bc in buds.get(g, []):
        j = int(np.argmin([math.hypot(p['x'] - bc[0], p['z'] - bc[2]) for p in pl])); flower[j] = True
    s = float(np.median([p['r'] for p in pl])); height = float(np.median([p['y'] for p in pl]))
    turn = float(np.median([p['turn'] for p in pl]))
    groups.append({**dict(s=round(s, 3), height=round(height, 3), turn=round(turn, 4), shade=shade,
                       pads=[[round(p['x'], 3), round(p['z'], 3), int(t), bool(f), round(p['y'], 3)] for p, t, f in zip(pl, tone, flower)],
                          ), **LOOKS.get(MAP, {})})
    if 'shade' in LOOKS.get(MAP, {}): groups[-1]['pads'] = [[x, z, min(t, len(groups[-1]['shade']) - 1), f, h] for x, z, t, f, h in groups[-1]['pads']]
    print(MAP, g, len(pl), 'plates, s %.3f height %.2f turn %.1f deg' % (s, height, math.degrees(turn)), shade, int(flower.sum()), 'buds')
M = json.load(open(D + 'manifest.json'))
M['plants'] = groups
M['plantsReplace'] = REPLACE
json.dump(M, open(D + 'manifest.json', 'w'), indent=1)
