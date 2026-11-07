"""The pack characters as small 3D models for the game (owner, 2026-11-06: deaths exactly as the HQs — cut, burnt, crushed — in 3D,
not flat sprite pieces). One .glb per character, standing upright on its feet at the origin, facing the camera's way of the atlases'
heading 0, one unit tall (the game scales it to the drawn height):

  body        the body (its texture shrunk to TEX px), without the face and the two side hands
  hand_L/R    the side hands (the pack's rounded cubes), as the atlases' NO_HANDS bake takes them off
  face_*      the face parts select_face.py builds that play uses: eyes, mouth, dead_eyes

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python export_chars3d.py -- <outdir> [char,...]

The licensed models stay out of git; these exports are derived from them like the atlases are (see art/reconstruction/README.md)."""
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Matrix, Vector
import select_rig
from select_rig import Rig, FILES

args = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(args[0]); os.makedirs(OUT, exist_ok=True)
CHARS = args[1].split(',') if len(args) > 1 else list(FILES)
TEX = 256
GAME_FACES = ('eyes', 'mouth', 'dead_eyes')       # the select screen's blink and happy faces are not used in play

bpy.ops.wm.read_factory_settings(use_empty=True)
for name in CHARS:
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    rig = Rig(name, look={})
    rig.pose(yaw_deg=-select_rig.TURN_DEG)          # the pack's own heading (the select screen's turn taken back)
    parts = {'body': rig.mesh, 'hand_L': rig.hands[0], 'hand_R': rig.hands[1], **{f'face_{k}': v for k, v in rig.faces.items() if k in GAME_FACES}}
    H = rig.height; foot = rig.axis
    for key, ob in parts.items():
        # bake each part's world placement into its mesh: feet at the origin, one unit tall
        ob.data = ob.data.copy(); ob.data.transform(Matrix.Scale(1 / H, 4) @ Matrix.Translation(-foot) @ ob.matrix_world)
        ob.matrix_world = Matrix.Identity(4); ob.parent = None; ob.name = key; ob.data.name = key; ob.hide_render = False; ob.hide_set(False)
    # matte, as the atlases render them: only the colour texture goes (no normal or roughness maps)
    for mt in bpy.data.materials:
        if not (mt.use_nodes and mt.node_tree): continue
        bs = next((n for n in mt.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bs is None: continue
        for sock in ('Normal', 'Roughness', 'Metallic'):
            for l in [l for l in mt.node_tree.links if l.to_socket == bs.inputs[sock]]: mt.node_tree.links.remove(l)
        bs.inputs['Roughness'].default_value = 1.0
    for img in bpy.data.images:
        if img.size[0] > TEX: img.scale(TEX, TEX)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts.values(): ob.select_set(True)
    path = os.path.join(OUT, f'{name}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_normals=True,
                              export_texcoords=True, export_materials='EXPORT', export_image_format='WEBP', export_apply=True)
    print('EXPORTED', name, os.path.getsize(path), 'bytes', 'height', round(H, 3))
