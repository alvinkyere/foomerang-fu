"""Inspect and turntable-render the licensed character models exactly as supplied. blender -b --python inspect_chars.py -- <outdir>"""
import bpy, os, sys, math
from mathutils import Vector
out = sys.argv[sys.argv.index('--') + 1]; os.makedirs(out, exist_ok=True)
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'licensed')
srcs = {'bread': 'bread/bread.blend', 'coffee': 'coffee/Coffee.blend', 'watermelon': 'watermelon/watermelon.blend'}
bpy.ops.wm.read_factory_settings(use_empty=True)
for k, (name, f) in enumerate(srcs.items()):
    with bpy.data.libraries.load(os.path.join(base, f), link=False) as (src, dst): dst.objects = [name]
    o = dst.objects[0]; bpy.context.collection.objects.link(o); o.location = (k * 2.5, 0, 0)
for o in bpy.data.objects:
    me = o.data
    print(o.name, 'verts', len(me.vertices), 'polys', len(me.polygons), 'dims', tuple(round(x, 3) for x in o.dimensions), 'scale', tuple(o.scale), 'rot', tuple(round(x, 2) for x in o.rotation_euler),
          'mods', [m.type for m in o.modifiers], 'mats', [m.name for m in me.materials], 'uv', list(me.uv_layers.keys()), 'shape_keys', bool(me.shape_keys))
    for m in me.materials:
        if m and m.node_tree: print('  nodes', [(n.type, n.name) for n in m.node_tree.nodes])
print([(i.name, tuple(i.size), i.packed_file is not None, i.filepath) for i in bpy.data.images])
sc = bpy.context.scene
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.8, 0.85, 0.95, 1)
sun = bpy.data.lights.new('S', 'SUN'); sun.energy = 3; so = bpy.data.objects.new('S', sun); bpy.context.collection.objects.link(so); so.rotation_euler = (0.9, 0.2, 0.6)
cam = bpy.data.cameras.new('C'); cam.lens = 85; co = bpy.data.objects.new('C', cam); bpy.context.collection.objects.link(co); sc.camera = co
sc.render.engine = 'CYCLES'; sc.cycles.samples = 32; sc.cycles.device = 'CPU'; sc.render.resolution_x = 700; sc.render.resolution_y = 700; sc.render.film_transparent = False
for k, name in enumerate(srcs):
    o = bpy.data.objects[name]
    c = o.location + Vector((0, 0, o.dimensions.z / 2))
    for view, d in (('front', (0, -1, 0.15)), ('side', (1, 0, 0.15)), ('top', (0.0, -0.5, 1.2)), ('back', (0, 1, 0.3))):
        co.location = c + Vector(d).normalized() * 6.5; co.rotation_euler = (c - co.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{out}/{name}_{view}.png'; bpy.ops.render.render(write_still=True)
