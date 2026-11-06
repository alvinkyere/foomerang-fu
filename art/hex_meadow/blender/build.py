"""The hex meadow in 3D, object by object (2026-11-06): ff physics hq 2.mp4 20:02 (1202.0 s), seen through the game's camera.

  Blender -b --python art/hex_meadow/blender/build.py -- <out_dir> [render [plants]]

  ground    one lime sheet; over it ground_field.py's measured field, the still shadows (shadow_mass.py: the trees', rocks', bamboo's),
            the dashed border (19 px dashes on a 39 px period at the bottom edge, measured), the fallen gold leaves (leaf_mass.py)
  trees     lavender trunks with navy shading and spots, through their gold clumps; the clumps' surface canopy_mass.py's (the
            frame's outline on the fitted clumps), shaded as the glade's are, in the meadow's gold
  rocks     four rounded lavender blocks (rock_mass.py: the frame's outline on the fitted blocks, lit by the fitted shading model)
  bamboo    green segmented stalks with cut tops and dark fronds at the nodes
  outskirts beyond the frame: more gold trees, bamboo and hex fields' ground in the frame's style (the plants themselves are the game's)
The plants (pads, stems, flowers, their shadows) are drawn by the game (render/three/hexPlantsView.ts) from the manifest; with `plants`
the render adds them at rest, for comparing with the frame. Exports meadow.glb; with `render`, also render.png through the HQ's camera.
"""
import bpy, bmesh, json, math, os, random, sys
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
args = sys.argv[sys.argv.index('--') + 1:]
OUT, RENDER, PLANTS = args[0], 'render' in args[1:], 'plants' in args[1:]
J = lambda p: json.load(open(os.path.join(ROOT, p)))
HAS = lambda p: os.path.exists(os.path.join(ROOT, p))
L, CAM = J('art/hex_meadow/layout.json'), J('art/sky_islands/camera.json')
A = J('art/hex_meadow/arena.json') if HAS('art/hex_meadow/arena.json') else dict(border=L['border'])
YC, COL = L['Yc'], L['colours']
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
rng = random.Random(5)


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


def unlit(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
    bg = nt.nodes.new('ShaderNodeBackground')
    nt.links.new(attr.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs[0], out.inputs['Surface'])
    return m


FLAT = unlit('flat')
SUN_TO = Vector((-0.095, -0.401, 0.911)).normalized()      # (towards the game's sun)
# the meadow's own sun, for shading our models as the frame's are: its shadows fall (-0.26, +0.48) plan units per unit of height
MEADOW_SUN = Vector((0.26, -0.48, 1.0)).normalized()


def obj(name, me, mats):
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    for m in mats: me.materials.append(m)
    return o


def smooth_boundary(bm, iters=6):
    bnd = {}
    for e in bm.edges:
        if len(e.link_faces) == 1:
            a, b = e.verts; bnd.setdefault(a, []).append(b); bnd.setdefault(b, []).append(a)
    for _ in range(iters):
        new = {v: v.co.copy() for v in bnd}
        for v, nb in bnd.items():
            if len(nb) == 2: new[v] = v.co * 0.5 + (nb[0].co + nb[1].co) * 0.25
        for v, c in new.items(): v.co = c


def scallop_boundary(bm, amp=0.12, period=5):
    bnd = {}
    for e in bm.edges:
        if len(e.link_faces) == 1:
            a, b = e.verts; bnd.setdefault(a, []).append(b); bnd.setdefault(b, []).append(a)
    seen = set()
    for start in list(bnd):
        if start in seen or len(bnd[start]) != 2: continue
        loop = [start]; seen.add(start); prev, cur = None, start
        while True:
            nxt = [n for n in bnd[cur] if n is not prev and len(bnd.get(n, [])) == 2]
            if not nxt or nxt[0] in seen: break
            prev, cur = cur, nxt[0]; loop.append(cur); seen.add(cur)
        if len(loop) < 12: continue
        mid = sum((v.co for v in loop), Vector((0, 0, 0))) / len(loop)
        ph = rng.uniform(0, 6.28); per = period * rng.uniform(0.8, 1.25)
        for i, v in enumerate(loop):
            out = v.co - mid; out.z = 0
            if out.length < 1e-6: continue
            v.co += out.normalized() * amp * max(0.0, math.sin(2 * math.pi * i / per + ph)) ** 2 * rng.uniform(0.6, 1.0)


def flat(name, poly, hex_, z):
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    face = bm.faces.new([bm.verts.new((x, YC + y, z)) for x, y in poly]); face.normal_update()
    if face.normal.z < 0: face.normal_flip()
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='EAR_CLIP')
    for f in bm.faces:
        for loop in f.loops: loop[col] = lin(hex_)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [FLAT])


def traced(name, data, z, colour_of, iters=6):
    """A flat traced mass on the ground (verts in plan x, y), each vertex its colour."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    vs = [bm.verts.new((x, YC + y, z)) for x, y in data['verts']]; tc = {v: colour_of(k) for k, v in enumerate(vs)}
    for q in data['faces']:
        try: f = bm.faces.new([vs[i] for i in q])
        except ValueError: continue
        f.normal_update()
        if f.normal.z < 0: f.normal_flip()
        for loop in f.loops: loop[col] = lin(tc[loop.vert])
    smooth_boundary(bm, iters)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); return obj(name, me, [FLAT])


bgr_hex = lambda c: '#%02x%02x%02x' % (c[2], c[1], c[0])

# ---------------------------------------------------------------------------------------------------------------- ground
GF = J('art/hex_meadow/ground_field.json')
me = bpy.data.meshes.new('GROUND'); me.from_pydata([(-160, YC - 120, 0), (160, YC - 120, 0), (160, YC + 120, 0), (-160, YC + 120, 0)], [], [(0, 1, 2, 3)])
_gc = bmesh.new(); _gc.from_mesh(me); _cl = _gc.loops.layers.float_color.new('Col')
for _f in _gc.faces:
    for _l in _f.loops: _l[_cl] = lin(GF['base'])
_gc.to_mesh(me); _gc.free(); obj('GROUND', me, [FLAT])
bm = bmesh.new(); colL = bm.loops.layers.float_color.new('Col')
vs = [[bm.verts.new((GF['x0'] + i * GF['dx'], YC + GF['y0'] + j * GF['dx'], 0.005)) for i in range(GF['nx'])] for j in range(GF['ny'])]
for j in range(GF['ny'] - 1):
    for i in range(GF['nx'] - 1):
        f = bm.faces.new([vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]])
        for loop in f.loops:
            ii = round((loop.vert.co.x - GF['x0']) / GF['dx']); jj = round((loop.vert.co.y - YC - GF['y0']) / GF['dx'])
            loop[colL] = lin(bgr_hex(GF['bgr'][jj * GF['nx'] + ii]))
me = bpy.data.meshes.new('GROUND_FIELD'); bm.to_mesh(me); bm.free(); obj('GROUND_FIELD', me, [FLAT])
SM = J('art/hex_meadow/shadow_mass.json')
traced('SHADOWS', SM, 0.03, lambda k: bgr_hex(SM['bgr'][k]))
# the dashed border: 19 px dashes on a 39 px period at the bottom edge, ~4 px thick (measured at 1202.0 s: 0.65 / 1.33 / 0.13 plan units)
B = A['border']; DASH, PERIOD, THICK = 0.65, 1.33, 0.13
edges = [((B['x0'], B['y0']), (B['x1'], B['y0'])), ((B['x1'], B['y0']), (B['x1'], B['y1'])), ((B['x1'], B['y1']), (B['x0'], B['y1'])), ((B['x0'], B['y1']), (B['x0'], B['y0']))]
nd = 0
for (ax_, ay_), (bx_, by_) in edges:
    ln = math.hypot(bx_ - ax_, by_ - ay_); ux, uy = (bx_ - ax_) / ln, (by_ - ay_) / ln
    t = 0.0
    while t + DASH <= ln:
        x0_, y0_, x1_, y1_ = ax_ + ux * t, ay_ + uy * t, ax_ + ux * (t + DASH), ay_ + uy * (t + DASH)
        px_, py_ = -uy * THICK / 2, ux * THICK / 2
        flat(f'DASH_{nd}', [(x0_ + px_, y0_ + py_), (x1_ + px_, y1_ + py_), (x1_ - px_, y1_ - py_), (x0_ - px_, y0_ - py_)], '#a9cf6c', 0.05); nd += 1
        t += PERIOD
LM = J('art/hex_meadow/leaf_mass.json')
traced('LEAVES', LM, 0.06, lambda k: LM['tones'][LM['tone'][k]], 3)


# ---------------------------------------------------------------------------------------------------------------- trees
def trunk(name, foot, top, r0, r1, rings=14, seg=12, path=None):
    """A tapered lavender trunk from the foot (on the ground) to `top` (or along `path`, its points from the foot up): navy on its
    shaded side, pale where the sun meets it, with dark spots (the frame's: #b4b8f0 lit, #8a8fd6, #4d4f97 shaded)."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    path = [Vector(p) for p in (path or [(foot[0], foot[1], 0.0), top])]
    lens = [0.0]
    for p_, q_ in zip(path, path[1:]): lens.append(lens[-1] + (q_ - p_).length)
    def along(t):
        d = t * lens[-1]
        for i in range(len(path) - 1):
            if d <= lens[i + 1] or i == len(path) - 2:
                u = 0.0 if lens[i + 1] == lens[i] else (d - lens[i]) / (lens[i + 1] - lens[i])
                return path[i].lerp(path[i + 1], max(0.0, min(1.0, u)))
    grid = []; vc = {}
    for i in range(rings):
        t = i / (rings - 1); c = along(t); r = r0 + (r1 - r0) * t
        ring_ = [bm.verts.new((c.x + math.cos(2 * math.pi * k / seg) * r, c.y + math.sin(2 * math.pi * k / seg) * r, c.z)) for k in range(seg)]
        for v_ in ring_: vc[v_] = c.copy()
        grid.append(ring_)
    lo_, mi_, hi_ = Vector(lin('#4d4f97')[:3]), Vector(lin('#8a8fd6')[:3]), Vector(lin('#b4b8f0')[:3])
    for i in range(rings - 1):
        for k in range(seg):
            f = bm.faces.new([grid[i][k], grid[i][(k + 1) % seg], grid[i + 1][(k + 1) % seg], grid[i + 1][k]])
            spot = rng.random() < 0.12
            for loop in f.loops:
                nrm = (loop.vert.co - vc[loop.vert]); nrm.z = 0
                nrm = nrm.normalized() if nrm.length > 1e-6 else Vector((0, -1, 0))
                l_ = max(0.0, min(1.0, nrm.dot(MEADOW_SUN) * 0.8 + 0.45))
                c_ = lo_.lerp(mi_, l_ / 0.5) if l_ < 0.5 else mi_.lerp(hi_, (l_ - 0.5) / 0.5)
                loop[col] = list(c_ * (0.55 if spot else 1.0)) + [1.0]
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [FLAT])


def canopy_mass(name, data, hi, mid, lo):
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    vs = [bm.verts.new((x, YC + y, z)) for x, y, z in data['verts']]
    dd = {v: d_ for v, d_ in zip(vs, data['d'])}; sh_ = {v: x_ for v, x_ in zip(vs, data['shadow'])}; an_ = {v: x_ for v, x_ in zip(vs, data['ang'])}
    for q in data['faces']:
        try: bm.faces.new([vs[i] for i in q])
        except ValueError: pass
    smooth_boundary(bm, 3); scallop_boundary(bm)
    for f in bm.faces:
        f.smooth = True; f.normal_update()
        if f.normal.z < 0: f.normal_flip()
    bm.normal_update()
    ch, cm, cl = Vector(lin(hi)[:3]), Vector(lin(mid)[:3]), Vector(lin(lo)[:3]); ph = 1.3
    for f in bm.faces:
        for loop in f.loops:
            v = loop.vert.co; n = loop.vert.normal
            shade = -0.32 + 1.0 * max(0.0, n.dot(SUN_TO)) - 0.42 * max(0.0, -n.z)
            d_ = dd[loop.vert]
            shade += 0.05 * (math.sin(2.6 * v.x + ph) * math.sin(2.3 * v.y - ph)) + 0.055 * math.sin(7 * an_[loop.vert] + 0.8 * math.sin(3 * an_[loop.vert])) * min(1.0, d_ / 0.5)
            shade += 0.12 * (1 - min(d_, 1.0)) - 0.45 * max(0.0, min(d_, 1.1) - 0.72) / 0.38 - 0.55 * sh_[loop.vert]
            t = max(0.0, min(1.0, shade + 0.9 * max(0.0, shade - 0.55)))
            base = cl.lerp(cm, t / 0.6) if t < 0.6 else cm.lerp(ch, (t - 0.6) / 0.4)
            loop[col] = list(base) + [1.0]
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [FLAT])


def umbrella(name, c, r, hi, mid, lo, scallops=7):
    """An outskirts clump: a shallow scalloped dome, lightest on its far side (as the glade's)."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    rings, seg = 4, 24
    ph = rng.uniform(0, 6.28); sk = 0.32 * r
    ch, cm, cl = Vector(lin(hi)[:3]), Vector(lin(mid)[:3]), Vector(lin(lo)[:3])
    grid = []
    for i in range(rings + 2):
        rho = min(i, rings) / rings; row = []
        for j in range(seg):
            th = 2 * math.pi * j / seg
            lobe = 1 + 0.13 * abs(math.sin(scallops * th / 2 + ph)) ** 0.7 + 0.04 * math.sin(13 * th + ph * 2)
            rr = r * rho * (lobe if rho > 0.6 else 1.0) if i <= rings else r * lobe * 0.97
            zz = c[2] + 0.5 * r * (1 - rho ** 2) - 0.2 * r - (sk if i > rings else 0)
            row.append(bm.verts.new((c[0] + math.cos(th) * rr, c[1] + math.sin(th) * rr, zz)))
        grid.append(row)
    for i in range(rings + 1):
        for j in range(seg):
            f = bm.faces.new([grid[i][j], grid[i][(j + 1) % seg], grid[i + 1][(j + 1) % seg], grid[i + 1][j]])
            for loop in f.loops:
                v = loop.vert.co; north = (v.y - c[1]) / r; rho_ = math.hypot(v.x - c[0], v.y - c[1]) / (r * 1.1)
                t = max(0.0, min(1.0, 0.45 - 0.4 * north + 0.35 * rho_ ** 2))
                base = ch.lerp(cm, t / 0.5) if t < 0.5 else cm.lerp(cl, (t - 0.5) / 0.5)
                loop[col] = list(base * (0.72 if i > rings else 1.0)) + [1.0]
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return obj(name, me, [FLAT])


GOLD = ('#d6bd63', '#c4a95a', '#b29452')      # (the frame's gold canopies: light tops, the body, the shaded rims)
MASS = J('art/hex_meadow/canopy_mass.json')
FIT = J('art/hex_meadow/lumps.json')
for k, t in enumerate(L['trees']):
    lumps = FIT[k]
    zs_ = [q['z'] for q in lumps]; xs_ = [q['x'] for q in lumps]
    lean = max(-0.35, min(0.35, sum(x_ * z_ for x_, z_ in zip(xs_, zs_)) / max(sum(z_ * z_ for z_ in zs_), 1e-6)))
    ztop = max(q['z'] - 0.1 * q['r'] for q in lumps)
    fx, fy = t['plan'][0], YC + t['plan'][1]
    for j, br in enumerate(t['trunk']):
        # (the frame's trunks, read along their middles: ~35 px across at the foot, a branch about half that)
        trunk(f'TRUNK_{k}_{j}', (fx, fy), None, 0.55 if j == 0 else 0.3, 0.3 if j == 0 else 0.18, rings=max(8, 4 * len(br)), path=[(x, YC + y, z) for x, y, z in br])
for kind_, data_ in MASS.items(): canopy_mass(f'CANOPY_MASS_{kind_}', data_, *GOLD)


# ---------------------------------------------------------------------------------------------------------------- rocks
for k, rm in enumerate(J('art/hex_meadow/rock_mass.json')):
    bm = bmesh.new(); vs = [bm.verts.new((x, YC + y, z)) for x, y, z in rm['verts']]
    for q in rm['faces']:
        try: bm.faces.new([vs[i] for i in q])
        except ValueError: pass
    smooth_boundary(bm)
    camv = Vector(tuple(v * 100 for v in CAM['centre']))
    for f in bm.faces:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - camv) > 0: f.normal_flip()
    colR = bm.loops.layers.float_color.new('Col'); tl = {v: bgr_hex(c) for v, c in zip(vs, rm['bgr'])}
    for f in bm.faces:
        for loop in f.loops: loop[colR] = lin(tl[loop.vert])
    me = bpy.data.meshes.new(f'ROCK_{k}'); bm.to_mesh(me); bm.free(); obj(f'ROCK_{k}', me, [FLAT])
# the rocks' far sides, which the frame cannot show (the follow camera sees round them): the fitted blocks, shaded by the same model
for k, rk in enumerate(J('art/hex_meadow/rocks.json')):
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col'); NU, NV = 10, 40; rows = []
    sg = lambda v: 1.0 if v >= 0 else -1.0
    c_, s_ = math.cos(math.radians(rk['yaw'])), math.sin(math.radians(rk['yaw']))
    for i in range(NU + 1):
        u = (math.pi / 2) * i / NU; row = []
        for j in range(NV):
            v = 2 * math.pi * j / NV
            fx_, fy_ = sg(math.cos(v)) * abs(math.cos(v)) ** rk['e2'], sg(math.sin(v)) * abs(math.sin(v)) ** rk['e2']
            kk = abs(math.cos(u)) ** rk['e1']; lx, ly = rk['w'] * fx_ * kk * 0.985, rk['d'] * fy_ * kk * 0.985
            row.append(bm.verts.new((rk['cx'] + c_ * lx - s_ * ly, YC + rk['cy'] + s_ * lx + c_ * ly, rk['h'] * 0.985 * abs(math.sin(u)) ** rk['e1'])))
        rows.append(row)
    for i in range(NU):
        for j in range(NV): bm.faces.new([rows[i][j], rows[i][(j + 1) % NV], rows[i + 1][(j + 1) % NV], rows[i + 1][j]])
    bm.faces.new(rows[NU]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.normal_update()
    top_, side_, dark_ = Vector(lin('#9eaae1')[:3]), Vector(lin('#7582bc')[:3]), Vector(lin('#596798')[:3])
    for f in bm.faces:
        for loop in f.loops:
            n = loop.vert.normal; up = max(0.0, n.z)
            c3 = side_.lerp(top_, up) if n.dot(MEADOW_SUN) > 0 else dark_.lerp(side_, up)
            loop[col] = list(c3) + [1.0]
    me = bpy.data.meshes.new(f'ROCKBODY_{k}'); bm.to_mesh(me); bm.free(); obj(f'ROCKBODY_{k}', me, [FLAT])


# ---------------------------------------------------------------------------------------------------------------- bamboo
def bamboo(name, foot, top, r=0.36, nodes=None):
    """A cut bamboo stalk: a green cylinder in segments (a paler band at each node), its cut top a pale rim round a dark hollow,
    lit from the meadow's sun (light #a6dc6c, mid #7fc95a, shade #5aa94a)."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    a, b = Vector((foot[0], foot[1], 0.0)), Vector(top); seg = 12
    ln = (b - a).length; nodes = nodes or max(2, round(ln / 1.4))
    ax = (b - a).normalized(); side = ax.cross(Vector((0, 0, 1)));
    side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0)); up = side.cross(ax).normalized()
    lo_, mi_, hi_ = Vector(lin('#5aa94a')[:3]), Vector(lin('#7fc95a')[:3]), Vector(lin('#a6dc6c')[:3])
    rings = []; ts = []
    for n in range(nodes):
        for u in (0.0, 0.08, 0.92):
            ts.append((n + u) / nodes)
    ts.append(1.0)
    for t in ts:
        c = a.lerp(b, t); bulge = 1.08 if abs((t * nodes) % 1) < 0.01 and t not in (0.0, 1.0) else 1.0
        rings.append([bm.verts.new(c + (side * math.cos(2 * math.pi * k / seg) + up * math.sin(2 * math.pi * k / seg)) * r * bulge) for k in range(seg)])
    for i in range(len(rings) - 1):
        band = (i % 3) == 0
        for k in range(seg):
            f = bm.faces.new([rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]])
            for loop in f.loops:
                nrm = (side * math.cos(2 * math.pi * (k + 0.5) / seg) + up * math.sin(2 * math.pi * (k + 0.5) / seg))
                l_ = max(0.0, min(1.0, nrm.dot(MEADOW_SUN) * 0.7 + 0.5))
                c_ = lo_.lerp(mi_, l_ / 0.5) if l_ < 0.5 else mi_.lerp(hi_, (l_ - 0.5) / 0.5)
                loop[col] = list(c_ * (1.1 if band else 1.0)) + [1.0]
    # the cut top: a pale rim and a dark hollow
    ctr = bm.verts.new(b - ax * 0.15)
    inner = [bm.verts.new(b + (side * math.cos(2 * math.pi * k / seg) + up * math.sin(2 * math.pi * k / seg)) * r * 0.6) for k in range(seg)]
    for k in range(seg):
        f = bm.faces.new([rings[-1][k], rings[-1][(k + 1) % seg], inner[(k + 1) % seg], inner[k]])
        for loop in f.loops: loop[col] = lin('#8fd56a')
        f = bm.faces.new([inner[k], inner[(k + 1) % seg], ctr])
        for loop in f.loops: loop[col] = lin('#3d8a3d')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); obj(name, me, [FLAT])
    return a, b, ax


def frond(name, at, ang, length=1.3, z=None):
    """A spray of dark bamboo leaves at a node: three to four narrow blades fanned out flat-ish (#4aa552, #3a9446)."""
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    for j in range(4):
        a = ang + (j - 1.5) * 0.35; l_ = length * (0.75 + 0.25 * rng.random())
        d = Vector((math.cos(a), math.sin(a), 0.15)); w = Vector((-math.sin(a), math.cos(a), 0)) * 0.11
        p0 = Vector(at); p1 = p0 + d * l_ * 0.5 + w; p2 = p0 + d * l_; p3 = p0 + d * l_ * 0.5 - w
        f = bm.faces.new([bm.verts.new(p) for p in (p0, p1, p2, p3)])
        for loop in f.loops: loop[col] = lin('#4aa552' if j % 2 else '#3a9446')
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); obj(name, me, [FLAT])


from_px = None
try:
    sys.path.insert(0, os.path.join(ROOT, 'art', 'hex_meadow'))
except Exception: pass
BAM = J('art/hex_meadow/bamboo.json') if HAS('art/hex_meadow/bamboo.json') else []
for k, bb in enumerate(BAM):
    a, b, ax = bamboo(f'BAMBOO_{k}', (bb['foot'][0], YC + bb['foot'][1]), (bb['top'][0], YC + bb['top'][1], bb['top'][2]), bb.get('r', 0.36))
    for j, (t, ang) in enumerate(bb.get('fronds', [])):
        frond(f'FROND_{k}_{j}', a.lerp(b, t), math.radians(ang))


# ---------------------------------------------------------------------------------------------------------------- beyond the frame
_th = math.radians(CAM['pitchDeg'])
_R = [[1, 0, 0], [0, -math.sin(_th), -math.cos(_th)], [0, math.cos(_th), -math.sin(_th)]]


def on_screen(x, y, z, margin=-90):
    v = [(x / 100 - CAM['centre'][0]), ((y + YC) / 100 - CAM['centre'][1]), (z / 100 - CAM['centre'][2])]
    w = [sum(_R[i][j] * v[j] for j in range(3)) for i in range(3)]
    cx, cy = CAM['focalPx'] * w[0] / w[2] + 960, CAM['focalPx'] * w[1] / w[2] + 540
    px_, py_ = 960 + (cx - 960) * CAM['referenceZoom'], 540 + (cy - 540) * CAM['referenceZoom']
    return -margin < px_ < 1920 + margin and -margin < py_ < 1080 + margin


def inside(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i - 1], poly[i]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0: c = not c
    return c


FR = L['frame']; fcx = sum(p[0] for p in FR) / 4; fcy = sum(p[1] for p in FR) / 4
FRAME_WIDE = [(fcx + (p[0] - fcx) * 1.05, fcy + (p[1] - fcy) * 1.05) for p in FR]
orng = random.Random(77); no = 0; nb = 0
for gx in range(-70, 76, 12):
    for gy in range(-56, 60, 11):
        x, y = gx + orng.uniform(-3, 3), gy + orng.uniform(-2.5, 2.5)
        if inside((x, y), FRAME_WIDE) or on_screen(x, y, 0.0, 140) or on_screen(x, y, 8.0, 140): continue
        if orng.random() < 0.3:
            # a clump of bamboo
            for j in range(orng.choice((2, 3))):
                fx_, fy_ = x + orng.uniform(-0.8, 0.8), y + orng.uniform(-0.8, 0.8); hgt = orng.uniform(3.5, 7.5)
                a, b, ax = bamboo(f'OBAMBOO_{nb}', (fx_, YC + fy_), (fx_ + orng.uniform(-1.2, 1.2), YC + fy_ + orng.uniform(-1.0, 1.0), hgt))
                for q in range(2): frond(f'OFROND_{nb}_{q}', a.lerp(b, orng.uniform(0.35, 0.8)), orng.uniform(0, 6.28))
                nb += 1
            continue
        foot = (x, YC + y); n = orng.choice((3, 4)); zs = sorted(orng.uniform(3.5, 7.5) for _ in range(n))
        lumps = [dict(x=orng.uniform(-1.3, 1.3), y=orng.uniform(-0.6, 0.6), z=zs[i], r=orng.uniform(1.3, 2.0)) for i in range(n)]
        trunk(f'OTRUNK_{no}', foot, (foot[0] + sum(q['x'] for q in lumps) / n, foot[1], zs[-1] - 0.3), 0.5, 0.3, rings=5, seg=8)
        for j, lump in enumerate(lumps): umbrella(f'OCANOPY_{no}_{j}', (foot[0] + lump['x'], foot[1] + lump['y'], lump['z']), lump['r'], *GOLD, scallops=orng.choice((6, 7, 8)))
        sx, sy = x - 0.26 * 5, y + 0.48 * 5
        flat(f'OSHADOW_{no}', [(sx + math.cos(a) * 3.2 * (1.2 if abs(math.sin(a)) < 0.5 else 1), sy + math.sin(a) * 2.6) for a in [i * math.pi / 8 for i in range(16)]], COL['shadow'], 0.03); no += 1


# ---------------------------------------------------------------------------------------------------------------- the plants at rest (for the render only)
if PLANTS:
    PD = J('art/hex_meadow/pads.json'); s = J('art/hex_meadow/lattice.json')['s']; HH = 2.9
    pal = COL['pad']
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    for p in PD:
        x, y = p['x'], YC + p['y']; z = HH
        sh_ = [bm.verts.new((x - 0.26 * z + s * math.cos(k * math.pi / 3), y + 0.48 * z + s * math.sin(k * math.pi / 3), 0.04)) for k in range(6)]
        f = bm.faces.new(sh_)
        for loop in f.loops: loop[col] = lin(COL['shadow'])
    me = bpy.data.meshes.new('PLANT_SHADOWS'); bm.to_mesh(me); bm.free(); obj('PLANT_SHADOWS', me, [FLAT])
    bm = bmesh.new(); col = bm.loops.layers.float_color.new('Col')
    for p in PD:
        x, y = p['x'], YC + p['y']
        st = [bm.verts.new((x + 0.07 * math.cos(k * math.pi / 3), y + 0.07 * math.sin(k * math.pi / 3), zz)) for zz in (0, HH) for k in range(6)]
        for k in range(6):
            f = bm.faces.new([st[k], st[(k + 1) % 6], st[6 + (k + 1) % 6], st[6 + k]])
            for loop in f.loops: loop[col] = lin('#5cb98a')
        c_ = Vector(lin(pal[p['shade']])[:3])
        ctr = bm.verts.new((x, y, HH)); rim = [bm.verts.new((x + s * 0.93 * math.cos(k * math.pi / 3), y + s * 0.93 * math.sin(k * math.pi / 3), HH)) for k in range(6)]
        out = [bm.verts.new((x + s * math.cos(k * math.pi / 3), y + s * math.sin(k * math.pi / 3), HH)) for k in range(6)]
        for k in range(6):
            f = bm.faces.new([ctr, rim[k], rim[(k + 1) % 6]])
            for loop in f.loops: loop[col] = list(c_ * (1.03 if loop.vert is ctr else 1.0)) + [1.0]
            f = bm.faces.new([rim[k], out[k], out[(k + 1) % 6], rim[(k + 1) % 6]])
            for loop in f.loops: loop[col] = list(c_ * (0.86 if loop.vert in out else 1.0)) + [1.0]
        if p['flower']:
            fl = [bm.verts.new((x + 0.1 * math.cos(k * math.pi / 5), y + 0.1 * math.sin(k * math.pi / 5), HH + 0.01)) for k in range(10)]
            f = bm.faces.new(fl)
            for loop in f.loops: loop[col] = lin('#ece3c8')
    me = bpy.data.meshes.new('PLANTS'); bm.to_mesh(me); bm.free(); o = obj('PLANTS', me, [FLAT])

# ---------------------------------------------------------------------------------------------------------------- camera, export
cam = bpy.data.cameras.new('CAM'); co = bpy.data.objects.new('CAM', cam); sc.collection.objects.link(co); sc.camera = co
co.location = tuple(v * 100 for v in CAM['centre']); co.rotation_euler = (math.radians(90 - CAM['pitchDeg']), 0, 0)
cam.sensor_fit = 'HORIZONTAL'; cam.sensor_width = 36; cam.lens = CAM['focalPx'] * CAM['referenceZoom'] / 1920 * 36; cam.clip_end = 5000
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value = (0.52, 0.52, 0.52, 1)
sc.view_settings.view_transform = 'Standard'
os.makedirs(OUT, exist_ok=True)
for o in bpy.data.objects:
    if o.name.startswith('PLANT'): o.select_set(False)
bpy.ops.object.select_all(action='SELECT'); co.select_set(False)
for o in bpy.data.objects:
    if o.name.startswith('PLANT'): o.select_set(False)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'meadow.glb'), export_format='GLB', use_selection=True, export_cameras=False,
                          export_lights=False, export_apply=True, export_yup=True)
if RENDER:
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.filepath = os.path.join(OUT, 'render.png'); bpy.ops.render.render(write_still=True)
_g = {}
for _o in bpy.data.objects:
    if _o.type == 'MESH': _k = _o.name.split('_')[0]; _g[_k] = _g.get(_k, 0) + len(_o.data.polygons)
print('polygons by group:', dict(sorted(_g.items(), key=lambda t: -t[1])[:10]))
print('meadow built:', len(L['trees']), 'trees, polygons', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
