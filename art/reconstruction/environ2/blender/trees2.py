"""Hex trees, outline-exact (trees_fit2.json): canopy plates (top = the painted outline at the canopy height, underside = the same
outline traced along the camera rays) on cylinder legs.  Blender -b --python trees2.py -- <out_dir>"""
import sys, os, json
import bpy, bmesh
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

OUT = sys.argv[sys.argv.index('--') + 1:][0]
os.makedirs(OUT, exist_ok=True)
FIT = json.load(open(os.path.join(stage.HERE, 'trees_fit2.json')))
sc, cam = stage.setup(engine='CYCLES')


def plate(name, top, bottom):
    bm = bmesh.new()
    T = [bm.verts.new(p) for p in top]
    B = [bm.verts.new(p) for p in bottom]
    bm.faces.new(T)
    bm.faces.new(B[::-1])
    n = len(T)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((B[i], B[j], T[j], T[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    sc.collection.objects.link(o)
    return o


for key, t in FIT.items():
    for i, p in enumerate(t['plates']):
        plate(f'TREE_{key}_canopy{i}', p['top'], p['bottom'])
    for i, l in enumerate(t['legs']):
        plate(f'TREE_{key}_leg{i}', l['front'], l['back'])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'trees2.blend'))
print('trees2 built')
