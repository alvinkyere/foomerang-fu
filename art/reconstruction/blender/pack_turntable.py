"""Render every model in the character pack from fixed views (front, 3/4, side, back, game camera ~56 deg).  blender -b --python pack_turntable.py -- <outdir>"""
import bpy, os, sys, math
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]; os.makedirs(OUT, exist_ok=True); LIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'licensed')
for name in sorted(os.listdir(LIC)):
    d = os.path.join(LIC, name); blends = [f for f in os.listdir(d) if f.endswith('.blend') and 'native' not in f]
    if not blends: continue
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    with bpy.data.libraries.load(os.path.join(d, blends[0]), link=False) as (s_, d_): d_.objects = [n for n in s_.objects if not n.startswith(('Area', 'Camera', 'Light'))]
    objs = [o for o in d_.objects if o and o.type == 'MESH']
    for o in objs: bpy.context.collection.objects.link(o)
    bpy.context.view_layer.update(); pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]; mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (mn + mx) / 2; R = (mx - mn).length
    print(name, 'objects', [o.name for o in objs], 'dims', tuple(round(x, 2) for x in (mx - mn)), 'verts', sum(len(o.data.vertices) for o in objs))
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.cycles.device = 'CPU'; sc.render.resolution_x = 360; sc.render.resolution_y = 360
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.9, 0.92, 0.95, 1)
    sun = bpy.data.lights.new('S', 'SUN'); sun.energy = 2.5; so = bpy.data.objects.new('S', sun); bpy.context.collection.objects.link(so); so.rotation_euler = (0.7, 0.2, 0.5)
    cam = bpy.data.cameras.new('C'); cam.lens = 70; co = bpy.data.objects.new('C', cam); bpy.context.collection.objects.link(co); sc.camera = co
    for view, dv in (('front', (0, -1, 0.15)), ('threeq', (0.7, -0.7, 0.25)), ('side', (1, 0, 0.15)), ('back', (0, 1, 0.15)), ('game', (0, -0.56, 0.83))):
        co.location = c + Vector(dv).normalized() * R * 2.6; co.rotation_euler = (c - co.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{OUT}/{name}_{view}.png'; bpy.ops.render.render(write_still=True)
