"""Render the plaza's moving objects for the game: each alone (the rest hidden), through environ2's camera at the game canvas
(1920 x 1080: the same view, x1.5), transparent, edges smoothed (16 samples), N frames over the loop; and the floor alone (the
ground plane, filled under every object) for the ground under the moving objects.
Blender -b --python render_moving.py -- <plaza_animated.blend> <out_dir> [frames]"""
import sys, os
import bpy

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[:2]
N = int(args[2]) if len(args) > 2 else 60
bpy.ops.wm.open_mainfile(filepath=SRC)
sc = bpy.context.scene
GROUPS = {'02_banner_l': ('BANNER_02',), '03_banner_r': ('BANNER_03',), '23_fountain': ('FOUNTAIN',), '24_bunting': ('BUNTING',),
          '25_tree': ('TREE_25',), '26_tree': ('TREE_26',), '27_tree': ('TREE_27',), '28_tree': ('TREE_28',), '29_tree': ('TREE29',)}


def members(prefixes):
    """The objects named with a prefix, and everything parented under them (the outline fill pieces)."""
    out = set()
    for o in sc.objects:
        if o.name.startswith(prefixes):
            out.add(o)
            out.update(o.children_recursive)
    return out


sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 1080, 100
sc.render.engine = 'CYCLES'
sc.cycles.samples = 16
sc.cycles.use_denoising = False
sc.render.filter_size = 1.0
sc.render.dither_intensity = 0.0
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
for img in bpy.data.images:             # at x1.5 the painted texels are interpolated, not repeated
    pass
for m in bpy.data.materials:
    if m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE':
                n.interpolation = 'Linear'
step = sc.frame_end + 1
everything = [o for o in sc.objects if o.type == 'MESH']
ONLY = os.environ.get('ONLY_GROUPS')
for key, prefixes in GROUPS.items():
    if ONLY and key not in ONLY.split(','):
        continue
    keep = members(prefixes)
    for o in everything:
        o.hide_render = o not in keep
    os.makedirs(os.path.join(OUT, key), exist_ok=True)
    for i in range(N):
        sc.frame_set(round(i * step / N))
        sc.render.filepath = os.path.join(OUT, key, f'f{i:03d}.png')
        bpy.ops.render.render(write_still=True)
    print('rendered', key, len(keep), 'objects')
for o in everything:
    o.hide_render = o.name != 'GROUND'
sc.frame_set(0)
sc.render.filepath = os.path.join(OUT, 'floor.png')
bpy.ops.render.render(write_still=True)
print('floor rendered')
