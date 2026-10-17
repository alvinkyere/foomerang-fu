"""Paint a built model from the camera (stage.paint_from_camera) and render it unlit through the camera: how exactly does the
painted model reproduce environ2?  Blender -b --python paint_check.py -- <model.blend> <out.png>"""
import sys, os
import bpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stage

blend, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
img = bpy.data.images.load(os.path.join(stage.ENV2, 'step2_clean.png'))
img.colorspace_settings.name = 'sRGB'
for o in list(sc.objects):
    if o.type == 'MESH' and not o.select_get() and o.name.startswith('Plane'):
        bpy.data.objects.remove(o, do_unlink=True)
for o in list(sc.objects):
    if o.type == 'CURVE':
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.convert(target='MESH')
for o in sc.objects:
    if o.type == 'MESH':
        dg = bpy.context.evaluated_depsgraph_get()
        for mod in list(o.modifiers):
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=mod.name)
        stage.paint_from_camera(o, img)
sc.render.engine = 'CYCLES'
sc.cycles.samples = int(os.environ.get("PAINT_SAMPLES", "1"))   # one ray at the pixel centre: no blend of neighbouring texels
sc.cycles.use_denoising = False
sc.render.filter_size = 0.01                 # no pixel filter: each pixel shows its own texel
sc.render.dither_intensity = 0.0             # no output dither noise
sc.cycles.use_adaptive_sampling = False
sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'
sc.render.use_border = False
sc.world = None
for o in list(sc.objects):
    if o.type == 'LIGHT':
        bpy.data.objects.remove(o, do_unlink=True)
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('painted render written')
