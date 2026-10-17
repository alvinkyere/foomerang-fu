"""Render a baked model as an asset (its own UV texture, unlit) through environ2's camera, 1 sample per pixel, no filter, no dither.
Blender -b --python render_asset.py -- <model.blend> <out.png>"""
import sys, os
import bpy
args = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=args[0])
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 1
sc.cycles.use_denoising = False
sc.cycles.use_adaptive_sampling = False
sc.render.filter_size = 0.01
sc.render.dither_intensity = 0.0
sc.render.film_transparent = True
sc.render.use_border = False
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
sc.world = None
sc.render.filepath = args[1]
bpy.ops.render.render(write_still=True)
