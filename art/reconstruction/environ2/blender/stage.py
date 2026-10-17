"""The 3D stage for environ2: its solved camera (../camera.json) in Blender, and the conversions every model builder shares.
World (as the solver): X right, Y away from the viewer, Z up, in plan units; Blender units = 100 x plan units (BU), so the camera
stands 110 BU above the ground. The game world maps to the plan through ../step4_arena.json's camera (world block).
Import from a builder run headless:  Blender -b --python <builder.py> -- <args>"""
import json, math, os
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ENV2 = os.path.dirname(HERE)
CAM = json.load(open(os.path.join(ENV2, 'camera.json')))
ARENA = json.load(open(os.path.join(ENV2, 'step4_arena.json')))
BU = 100.0                                   # Blender units per plan unit
W, H = 1280, 720
F = CAM['f_1280']
PP = CAM['principal_1280']


def plan_to_bu(X, Y, Z=0.0):
    return Vector((X * BU, Y * BU, Z * BU))


def world_to_bu(xw, yw, zw=0.0):
    """Game world units -> Blender units (through the arena's plan mapping)."""
    w = ARENA['camera']['world']
    u = w['unitsPerPlanUnit']
    return plan_to_bu(xw / u + w['planOriginX'], w['planOriginY'] - yw / u, zw / u)


TOON = os.environ.get('TOON', '1') == '1'          # environ2's cartoon look (every builder); TOON=0: realistic


def setup(engine='BLENDER_EEVEE_NEXT', samples=64):
    if TOON:
        engine = 'BLENDER_EEVEE'
    sc = bpy.context.scene
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    try:
        sc.render.engine = engine
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    cd = bpy.data.cameras.new('CAM')
    cd.sensor_fit = 'HORIZONTAL'
    cd.sensor_width = 36.0
    cd.lens = F / W * 36.0
    cd.shift_x = -(PP[0] - W / 2) / W
    cd.shift_y = (PP[1] - H / 2) / W
    cd.clip_start, cd.clip_end = 1, 5000
    co = bpy.data.objects.new('CAM', cd)
    sc.collection.objects.link(co)
    sc.camera = co
    th = math.radians(CAM['pitch_deg'])
    c, s = math.cos(th), math.sin(th)
    R = Matrix(((1, 0, 0), (0, -s, -c), (0, c, -s)))          # yaw 0, roll 0
    Rbl = Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1))) @ R
    m = Rbl.transposed().to_4x4()
    m.translation = Vector(CAM['C']) * BU
    co.matrix_world = m
    return sc, co


def ray_to_z(px, py, z_bu=0.0):
    """The point at height z (BU) seen at image pixel (px, py) (1280 x 720)."""
    co = bpy.context.scene.camera
    m = co.matrix_world
    d = (m.to_3x3() @ Vector(((px - PP[0]) / F, -(py - PP[1]) / F, -1.0))).normalized()
    o = m.translation
    return o + d * ((z_bu - o.z) / d.z)


def project(p_bu):
    """Blender point -> image pixel (1280 x 720)."""
    co = bpy.context.scene.camera
    q = co.matrix_world.inverted() @ Vector(p_bu)
    return (PP[0] + F * q.x / -q.z, PP[1] - F * q.y / -q.z)


def light():
    """environ2's light: a warm sun travelling west, slightly away from the viewer and down (its shadows fall west and toward the
    viewer), and a cool sky fill. Shared by every model so they are all lit alike."""
    sc = bpy.context.scene
    sun = bpy.data.lights.new('SUN', 'SUN')
    sun.energy = float(os.environ.get('FOO_SUN', '1.6' if TOON else '3.2'))
    sun.color = (1.0, 0.95, 0.85)
    sun.angle = math.radians(14 if TOON else 8)
    so = bpy.data.objects.new('SUN', sun)
    sc.collection.objects.link(so)
    so.rotation_euler = Vector((-1.0, 0.25, -float(os.environ.get('FOO_SUN_DOWN', '1.1')))).to_track_quat('-Z', 'Y').to_euler()
    wd = bpy.data.worlds.new('W')
    wd.use_nodes = True
    bg = wd.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.75, 0.80, 0.90, 1)
    bg.inputs['Strength'].default_value = float(os.environ.get('FOO_SKY', '0.22' if TOON else '0.9'))
    sc.world = wd


def material(name, rgb, rough=0.8):
    if TOON:
        return toon_material(name, rgb)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = rough
    return m


def render_with_ids(out_dir, stem, parts, region):
    """Render the beauty pass (Cycles) over `region` (x0, y0, x1, y1 px), then every part flat in its id colour (Workbench):
    <stem>_render.png and <stem>_ids.png. `parts` maps material name -> id colour (0/1 per channel)."""
    sc = bpy.context.scene
    x0, y0, x1, y1 = region
    sc.render.use_border, sc.render.use_crop_to_border = True, False
    sc.render.border_min_x, sc.render.border_max_x = x0 / W, x1 / W
    sc.render.border_min_y, sc.render.border_max_y = 1 - y1 / H, 1 - y0 / H
    sc.render.filepath = os.path.join(out_dir, f'{stem}_render.png')
    bpy.ops.render.render(write_still=True)
    for m in bpy.data.materials:
        m.diffuse_color = (*parts.get(m.name, (0, 0, 0)), 1)
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'FLAT'
    sc.display.shading.color_type = 'MATERIAL'
    sc.display.shading.show_shadows = False
    sc.render.filepath = os.path.join(out_dir, f'{stem}_ids.png')
    bpy.ops.render.render(write_still=True)


def ray_to_vertical_plane(px, py, a, b):
    """The point seen at pixel (px, py) on the vertical plane through ground points a and b (BU, (x, y))."""
    co = bpy.context.scene.camera
    m = co.matrix_world
    d = (m.to_3x3() @ Vector(((px - PP[0]) / F, -(py - PP[1]) / F, -1.0))).normalized()
    o = m.translation
    n = Vector((b[1] - a[1], -(b[0] - a[0]), 0)).normalized()
    t = (Vector((a[0], a[1], 0)) - o).dot(n) / d.dot(n)
    return o + d * t


def height_at(ground_px, top_row):
    """How tall a vertical post standing at the ground point seen at `ground_px` must be for its top to appear at `top_row`."""
    g = ray_to_z(*ground_px, 0.0)
    lo, hi = 0.0, 40.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if project((g.x, g.y, mid))[1] > top_row:
            lo = mid
        else:
            hi = mid
    return g, (lo + hi) / 2


def paint_from_camera(obj, image, name='paint'):
    """Give `obj` the painting as its surface: a UV map that projects every vertex through environ2's camera onto `image` (the
    clean plate), and an unlit material that shows that image at those UVs (nearest texel, so the camera sees it unfiltered).
    Seen from the camera it reproduces the painting's pixels exactly wherever the model's shape matches the painted object."""
    me = obj.data
    uv = me.uv_layers.new(name='camera')
    mw = obj.matrix_world
    for loop in me.loops:
        x, y = project(mw @ me.vertices[loop.vertex_index].co)
        uv.data[loop.index].uv = (x / W, 1 - y / H)
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        tex.interpolation = 'Closest'
        # the lookup uses the shading point's exact position on screen (Window coordinates): a projected UV map, interpolated
        # perspective-correctly across a large face, drifts by a pixel or more from the true screen position
        tc = nt.nodes.new('ShaderNodeTexCoord')
        em = nt.nodes.new('ShaderNodeEmission')
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Location'].default_value = (float(os.environ.get('PAINT_DX', '0')) / W, float(os.environ.get('PAINT_DY', '0')) / H, 0)
        nt.links.new(tc.outputs['Window'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], tex.inputs['Vector'])
        nt.links.new(tex.outputs['Color'], em.inputs['Color'])
        nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    me.materials.clear()
    me.materials.append(m)
    return m


def toon_material(name, rgb, shadow_tint=(0.72, 0.66, 0.86), bands=(0.32, 0.62), soft=0.08, mottle=0.06):
    """environ2's cartoon look: the light on a surface falls into soft bands (shadow / mid / lit), the shadow tone is tinted
    violet (never grey), and the colour carries a faint hand-painted mottle. Eevee only (Shader to RGB)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    L = nt.links.new
    diff = nt.nodes.new('ShaderNodeBsdfDiffuse')
    s2r = nt.nodes.new('ShaderNodeShaderToRGB')
    bw = nt.nodes.new('ShaderNodeRGBToBW')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = 0.0, (*shadow_tint, 1)
    e[1].position, e[1].color = bands[0] + soft, (1, 1, 1, 1)
    mid = e.new(bands[0])
    mid.color = (*[0.5 * (1 + t) for t in shadow_tint], 1)
    hi = e.new(bands[1] + soft)
    hi.color = (1.06, 1.04, 1.0, 1)
    e[1].position = bands[1]
    e[1].color = (1, 1, 1, 1)
    L(diff.outputs['BSDF'], s2r.inputs['Shader'])
    L(s2r.outputs['Color'], bw.inputs['Color'])
    norm = nt.nodes.new('ShaderNodeMath')
    norm.operation = 'DIVIDE'
    norm.inputs[1].default_value = 1.8
    L(bw.outputs['Val'], norm.inputs[0])
    L(norm.outputs[0], ramp.inputs['Fac'])
    # the base colour with a faint painterly mottle (large soft noise)
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 0.6
    noise.inputs['Detail'].default_value = 3.0
    tc = nt.nodes.new('ShaderNodeTexCoord')
    L(tc.outputs['Object'], noise.inputs['Vector'])
    mot = nt.nodes.new('ShaderNodeMapRange')
    mot.inputs['To Min'].default_value = 1 - mottle
    mot.inputs['To Max'].default_value = 1 + mottle
    L(noise.outputs['Fac'], mot.inputs['Value'])
    base = nt.nodes.new('ShaderNodeRGB')
    base.outputs[0].default_value = (*rgb, 1)
    tint = nt.nodes.new('ShaderNodeMix')
    tint.data_type, tint.blend_type = 'RGBA', 'MULTIPLY'
    tint.inputs['Factor'].default_value = 1.0
    L(base.outputs[0], tint.inputs['A'])
    L(ramp.outputs['Color'], tint.inputs['B'])
    mott = nt.nodes.new('ShaderNodeMix')
    mott.data_type, mott.blend_type = 'RGBA', 'MULTIPLY'
    mott.inputs['Factor'].default_value = 1.0
    L(tint.outputs['Result'], mott.inputs['A'])
    comb = nt.nodes.new('ShaderNodeCombineColor')
    for ch in ('Red', 'Green', 'Blue'):
        L(mot.outputs['Result'], comb.inputs[ch])
    L(comb.outputs['Color'], mott.inputs['B'])
    em = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    L(mott.outputs['Result'], em.inputs['Color'])
    L(em.outputs['Emission'], out.inputs['Surface'])
    m.diffuse_color = (*rgb, 1)
    return m
