"""The character-select rig (owner, 2026-10-20: the character-select screen exactly as game-setting.mp4): a pack character loaded,
given its hands (char_hands.py), its two side hands separated so they can move, placed and lit as the video shows it. Shared by
fit_select_look.py (fits the look on the video) and bake_select_anims.py (renders the animations).

The look (select_look.json, written by fit_select_look.py from the video's resting frame of each character):
 * camera: orthographic, ELEVATION_DEG down; each character turned TURN_DEG + its own `yaw` (fitted on the video's outline);
   framed by the rest pose's bounding sphere;
 * light: AgX view, exposure, sun and sky strength (fitted on the video's mean colours of all ten characters);
 * per character: `hands` {scale, out, up} (the game draws the hands larger and further out than the model files place them),
   `roll` (deg; Banana's model leans, the video's stands upright), `hand_colour` (sRGB as the video shows it) and
   `hand_albedo` (the material colour that renders as hand_colour under this light)."""
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
LIC = os.path.join(HERE, '..', 'licensed')
sys.path.insert(0, HERE)
from char_hands import add_hands  # noqa: E402
from select_face import build_faces  # noqa: E402

FILES = {'bread': ('bread.blend', 'bread'), 'coffee': ('Coffee.blend', 'coffee'), 'watermelon': ('watermelon.blend', 'watermelon'), 'icecream': ('icecream.blend', 'Icecream'),
         'banana': ('banana.blend', 'NurbsPath.001'), 'carrot': ('Carrot.blend', 'carrot'), 'avocado': ('avocado.blend', 'Avocado'), 'donut': ('donut.blend', 'donut'),
         'milk': ('milk.blend', 'milk'), 'bacon': ('bacon.blend', 'bacon')}
LOOK_FILE = os.path.join(HERE, 'select_look.json')
LOOK = json.load(open(LOOK_FILE)) if os.path.exists(LOOK_FILE) else {}
ELEVATION_DEG = LOOK.get('elevation_deg', 25.0)
TURN_DEG = LOOK.get('turn_deg', 10.0)


def srgb_to_linear(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def setup_scene(size, samples=64):
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples; sc.cycles.use_denoising = True; sc.render.film_transparent = True
    sc.render.resolution_x = size; sc.render.resolution_y = size
    light = LOOK.get('light', {})
    sc.view_settings.view_transform = light.get('view', 'Standard'); sc.view_settings.exposure = light.get('exposure', 0.0)
    if 'look' in light: sc.view_settings.look = light['look']
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    wd = bpy.data.worlds.new('W'); sc.world = wd; wd.use_nodes = True; bg = wd.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.97, 0.98, 1.0, 1); bg.inputs['Strength'].default_value = light.get('world', 0.975)
    sun = bpy.data.lights.new('S', 'SUN'); sun.color = (1.0, 0.95, 0.85); sun.energy = light.get('sun', 1.6); sun.angle = math.radians(14)
    # the sun lights the character but casts no shadow: the video's ground shadow is a soft round one right underneath, which is
    # the sky's (the ground under the character sees less of it)
    if hasattr(sun, 'use_shadow'): sun.use_shadow = False
    if hasattr(sun, 'cycles') and hasattr(sun.cycles, 'cast_shadow'): sun.cycles.cast_shadow = False
    so = bpy.data.objects.new('S', sun); bpy.context.collection.objects.link(so); so.rotation_euler = (math.radians(40), 0, math.radians(-30))
    cd = bpy.data.cameras.new('C'); cd.type = 'ORTHO'; co = bpy.data.objects.new('C', cd); bpy.context.collection.objects.link(co); sc.camera = co
    # the soft shadow on the ground under the character, as in the video: a shadow catcher (only the shadow is drawn)
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0)); ground = bpy.context.active_object; ground.name = 'GROUND'
    ground.is_shadow_catcher = True
    return sc, co


def _islands(bm):
    seen, parts = set(), []
    for v in bm.verts:
        if v.index in seen: continue
        group, stack = [], [v]; seen.add(v.index)
        while stack:
            x = stack.pop(); group.append(x.index)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen: seen.add(y.index); stack.append(y)
        parts.append(group)
    return parts


def _separate(mesh, centre):
    """Separates the stub part of `mesh` nearest `centre` (world) into its own object, origin at its centre (Blender's own
    separate, so materials and UVs are kept)."""
    mw = mesh.matrix_world.copy()
    bm = bmesh.new(); bm.from_mesh(mesh.data); bm.verts.ensure_lookup_table()
    best = None
    for g in _islands(bm):
        if len(g) not in (98, 218): continue
        c = sum(((mw @ bm.verts[i].co) for i in g), Vector()) / len(g)
        if best is None or (c - centre).length < best[0]: best = ((c - centre).length, set(g), c)
    bm.free()
    _, idx, c = best
    me = mesh.data
    for f in me.polygons: f.select = False
    for e in me.edges: e.select = False
    for v in me.vertices: v.select = v.index in idx
    bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
    before = set(bpy.data.objects)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='VERT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    hand = next(o for o in bpy.data.objects if o not in before)
    hand.parent = None; hand.matrix_world = mw; bpy.context.view_layer.update()
    local_c = hand.matrix_world.inverted() @ c
    hand.data.transform(Matrix.Translation(-local_c)); hand.matrix_world = hand.matrix_world @ Matrix.Translation(local_c)
    return hand


def _matte(mesh, name, tone=None):
    """Matte materials; `tone` {sat, val} scales the textured colour's saturation and value (fitted per character on the video's
    main body colour: the AgX curve dulls strong colours such as Banana's yellow)."""
    for mt in mesh.data.materials:
        if not (mt and mt.node_tree): continue
        nt = mt.node_tree; bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); bs.inputs['Specular IOR Level'].default_value = 0.0; bs.inputs['Roughness'].default_value = 1.0
        lk = next((l for l in nt.links if l.to_socket == bs.inputs['Base Color']), None)
        if tone and lk is not None:
            hs = nt.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = tone.get('sat', 1.0); hs.inputs['Value'].default_value = tone.get('val', 1.0)
            nt.links.new(lk.from_socket, hs.inputs['Color']); nt.links.new(hs.outputs['Color'], bs.inputs['Base Color'])


class Rig:
    """A character standing as in the video's character-select circle. `pose(...)` moves body and hands from the rest pose."""

    def __init__(self, name, look=None):
        look = LOOK.get('chars', {}).get(name, {}) if look is None else look
        for o in list(bpy.data.objects):
            if o.type in ('MESH', 'CURVE', 'EMPTY') and o.name != 'GROUND': bpy.data.objects.remove(o, do_unlink=True)
        blend, obj = FILES[name]
        with bpy.data.libraries.load(os.path.join(LIC, name, blend), link=False) as (s1, d1): d1.objects = [obj]
        mesh = d1.objects[0]; bpy.context.collection.objects.link(mesh)
        add_hands(mesh, name, LIC, 1.0)
        _matte(mesh, name, look.get('tone'))
        bpy.context.view_layer.update()
        # the face's parts, out of the body so the blink and happy faces can replace them (select_face.py)
        self.faces, self.shows = build_faces(mesh, name)
        bpy.context.view_layer.update()
        # the two side hands: of the stub parts (98 vertices; Avocado's 218), the two highest; the others are feet
        mw = mesh.matrix_world.copy()
        bm = bmesh.new(); bm.from_mesh(mesh.data); bm.verts.ensure_lookup_table()
        stubs = [sum(((mw @ bm.verts[i].co) for i in g), Vector()) / len(g) for g in _islands(bm) if len(g) in (98, 218)]
        bm.free()
        stubs.sort(key=lambda c: -c.z)
        assert len(stubs) >= 2, f'{name}: expected two hands, found {len(stubs)} stub parts'
        tops = sorted(stubs[:2], key=lambda c: c.x)          # screen-left first (the camera looks along +Y)
        self.hands = [_separate(mesh, c) for c in tops]
        self.mesh, self.name = mesh, name
        # hand colour as the video shows it (every hand: the video is the reference)
        if 'hand_colour' in look:
            mat = bpy.data.materials.new(f'hands_{name}_video'); mat.use_nodes = True
            bs = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            bs.inputs['Base Color'].default_value = (*[srgb_to_linear(c) for c in look.get('hand_albedo', look['hand_colour'])], 1.0)
            bs.inputs['Roughness'].default_value = 1.0; bs.inputs['Specular IOR Level'].default_value = 0.0
            for h in self.hands:
                h.data.materials.clear(); h.data.materials.append(mat)
                for p in h.data.polygons: p.material_index = 0
        # Banana's model leans; the video's stands upright: turn the whole character about the camera axis
        upright = Matrix.Rotation(math.radians(look.get('roll', 0.0)), 4, 'Y')
        for o in [mesh, *self.hands, *self.faces.values()]: o.matrix_world = upright @ o.matrix_world
        bpy.context.view_layer.update()
        pts = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
        self.zmin = min(p.z for p in pts); self.height = max(p.z for p in pts) - self.zmin
        for o in [mesh, *self.hands, *self.faces.values()]: o.location.z -= self.zmin
        bpy.context.view_layer.update()
        pts = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
        self.axis = Vector((sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts), 0.0))
        h = look.get('hands', {})
        for hand, side in ((self.hands[0], -1), (self.hands[1], 1)):
            k = h.get('scale', 1.0); hand.scale = (k, k, k)
            hand.location.x += side * h.get('out', 0.0) * self.height; hand.location.z += h.get('up', 0.0) * self.height
        bpy.context.view_layer.update()
        self.yaw = look.get('yaw', 0.0)       # this character's own facing in the video (outline fit)
        self.rest = {o: o.matrix_world.copy() for o in [mesh, *self.hands, *self.faces.values()]}

    def pose(self, yaw_deg=0.0, roll_deg=0.0, shift=0.0, hop=0.0, lifts=(0.0, 0.0), inward=(0.0, 0.0), face='normal'):
        """Turns the body (about its own axis) and leans it (about the point between its feet), with the hands lifted and drawn in
        by fractions of the height. Positive roll leans to the screen left."""
        H = self.height; foot = self.axis
        body = (Matrix.Translation(foot + Vector((-shift * H, 0, hop * H)))
                @ Matrix.Rotation(math.radians(-roll_deg), 4, 'Y')
                @ Matrix.Rotation(math.radians(TURN_DEG + self.yaw + yaw_deg), 4, 'Z')
                @ Matrix.Translation(-foot))
        self.mesh.matrix_world = body @ self.rest[self.mesh]
        for part, ob in self.faces.items():
            ob.matrix_world = body @ self.rest[ob]; ob.hide_render = part not in self.shows[face]
        for hand, l, n, side in ((self.hands[0], lifts[0], inward[0], -1), (self.hands[1], lifts[1], inward[1], 1)):
            hand.matrix_world = body @ Matrix.Translation(Vector((-side * n * H, 0, l * H))) @ self.rest[hand]
        bpy.context.view_layer.update()

    def frame(self, cam):
        """The camera for this character: framed by its rest pose's bounding sphere (every character fills its circle alike)."""
        self.pose()
        pts = [o.matrix_world @ Vector(c) for o in [self.mesh, *self.hands] for c in o.bound_box]
        ctr = sum(pts, Vector()) / len(pts); r = max((p - ctr).length for p in pts)
        el = math.radians(ELEVATION_DEG); d = Vector((0, -math.cos(el), math.sin(el)))
        cd = cam.data; cam.location = ctr + d * (r * 6); cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        cd.ortho_scale = r * 2.1; cd.clip_start = r * 0.5; cd.clip_end = r * 12
        bpy.context.view_layer.update()
        return r
