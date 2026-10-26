"""The gong islands' portals (portals.py measures them; build.py calls this): each a thick hexagonal tile standing out of its
rock's face, its swirl two discs the game plays frame by frame (PORTAL_<k>_glyph, _glyph_next: their local Z the face's normal, their origin the
face's centre), and a ring, the face's outline, in front of it (PORTAL_<k>_ring: the game moves and fades it). Unlit, as the
video's objects are (glTF KHR_materials_unlit)."""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix


def linear(h):
    """A colour for a shader node (Blender's node colours are linear; the glTF export writes them back as the hex)."""
    return [(int(h[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5)] + [1.0]


def hexcol(h):
    # (for an image's pixels, which are as shown: made linear these had come out a gamma too dark, the gold face #e78c17
    # for #f4c256; plain colours on shader nodes are linear: `linear`)
    return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)] + [1.0]


def unlit(name, colour, image=None, alpha=None, opaque=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for nd in list(nt.nodes):
        if nd.type != 'OUTPUT_MATERIAL': nt.nodes.remove(nd)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Color'].default_value = linear(colour)
    if image is not None and opaque:
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image
        nt.links.new(tex.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs[0], out.inputs['Surface'])
    elif image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = image
        mix = nt.nodes.new('ShaderNodeMixShader'); tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        nt.links.new(tex.outputs['Color'], bg.inputs['Color'])
        nt.links.new(tex.outputs['Alpha'], mix.inputs['Fac'])
        nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(bg.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
        m.blend_method = 'BLEND'
    elif alpha is not None:
        mix = nt.nodes.new('ShaderNodeMixShader'); tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix.inputs['Fac'].default_value = alpha
        nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(bg.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
        m.blend_method = 'BLEND'
    else:
        nt.links.new(bg.outputs[0], out.inputs['Surface'])
    return m


def frame_of(p):
    """The face's axes in the world: n out of the rock (toward `facing`, leaned back by `lean`), s along the face (to the right
    seen from in front), u up the face; s and u turned in the face by `turn` (anticlockwise seen from in front)."""
    a, t, q = math.radians(p['facing']), math.radians(p.get('lean', 0.0)), math.radians(p.get('turn', 0.0))
    n = Vector((math.cos(a) * math.cos(t), math.sin(a) * math.cos(t), math.sin(t)))
    s = Vector((0.0, 0.0, 1.0)).cross(n).normalized()           # (right = forward x up, forward = -n)
    u = n.cross(s)
    return n, s * math.cos(q) + u * math.sin(q), -s * math.sin(q) + u * math.cos(q)


def build(data, parent):
    sides = data['sides']
    images = {}
    for k, p in enumerate(data['portals']):
        pal = data['palettes'][p['colour']]
        n, s, u = frame_of(p)
        c = Vector(p['centre']); R = p['radius']; d = p['back']
        corner = lambda j, r: s * (r * math.cos(math.radians(90 + 60 * j))) + u * (r * math.sin(math.radians(90 + 60 * j)))
        # (2026-10-26, ff physics hq 2.mp4 8:04-8:06: seen from behind, a portal is a hollow hexagon of its colour, no navy:
        # the navy is the rock's, a hexagon on its face behind the tile; the tile's face and its swirl show from in front only,
        # its rim from both sides)
        if ('solid', key0 := p['colour']) not in images:
            im = bpy.data.images.new(f'portal_face_{key0}', 4, 4); im.pixels = hexcol(pal['face']) * 16; im.pack()
            images[('solid', key0)] = im
        def hexmesh(name, rings, at, front_only, colour=None, image=None):
            bm = bmesh.new(); uv0 = bm.loops.layers.uv.new('UVMap')
            r0, r1 = rings
            outer = [bm.verts.new(at + corner(j, r1)) for j in range(6)]
            if r0 == 0: faces = [bm.faces.new(outer)]
            else:
                inner = [bm.verts.new(at + corner(j, r0)) for j in range(6)]
                faces = [bm.faces.new((outer[j], outer[(j + 1) % 6], inner[(j + 1) % 6], inner[j])) for j in range(6)]
            bm.normal_update()
            for f in faces:
                if f.normal.dot(n) < 0: f.normal_flip()
                for loop in f.loops: loop[uv0].uv = (0.5, 0.5)
            me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
            mat = unlit(name.lower(), colour or '#ffffff', image=image, opaque=image is not None)
            mat.use_backface_culling = front_only
            me.materials.append(mat)
            ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); ob.parent = parent
        # the rock's navy: a hexagonal slab standing out of the rock's face to just behind the tile, bigger than it (the HQ: a
        # thick navy border all round the face, deepest at its lower left, where the slab's side shows)
        bm = bmesh.new()
        RB = p['navy']
        fr = [bm.verts.new(c - n * 0.02 + corner(j, RB)) for j in range(6)]
        bk = [bm.verts.new(c - n * d + corner(j, RB)) for j in range(6)]
        bm.faces.new(fr)
        for j in range(6): bm.faces.new((fr[j], bk[j], bk[(j + 1) % 6], fr[(j + 1) % 6]))
        bm.normal_update()
        for f in bm.faces:
            if f.normal.dot(n) < -0.9: f.normal_flip()
        cen = c - n * (d / 2)
        for f in bm.faces:
            if f.normal.dot(f.calc_center_median() - cen) < 0: f.normal_flip()
        me = bpy.data.meshes.new(f'PORTAL_{k}_backing'); bm.to_mesh(me); bm.free()
        nm = unlit(f'portal_{k}_backing', sides); nm.use_backface_culling = True; me.materials.append(nm)
        ob = bpy.data.objects.new(f'PORTAL_{k}_backing', me); bpy.context.scene.collection.objects.link(ob); ob.parent = parent
        hexmesh(f'PORTAL_{k}', (0, R * 0.86), c, True, image=images[('solid', key0)])        # the tile's face
        hexmesh(f'PORTAL_{k}_rim', (R * 0.86, R), c + n * 0.005, False, image=images[('solid', key0)])   # its rim
        # the swirl: a disc just in front of the face showing one cell of its colour's atlas (portals.py draws it: the HQ's
        # swirl frame by frame), and a second just in front of that, for the next frame fading in; their own objects at the
        # model's top level (the game merges whatever never moves, and finds these to play them), the first cell's UVs
        key = p['colour']
        if key not in images:
            images[key] = bpy.data.images.load(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                            f'portal_glyph_{key}.png'))
            images[key].pack()
        fr = data['frames']; cw, chh = 1 / fr['columns'], 1 / fr['rows']
        # (PORTAL_CELL in the environment: show that frame, for a still render to compare; the game picks its own)
        cell = int(os.environ.get('PORTAL_CELL', '0')); cu, cv = (cell % fr['columns']) * cw, (cell // fr['columns']) * chh
        h = 1.28 * R; rd = 0.84 * R                                 # (a cell spans +-h; the disc, inside the hexagon)
        for name, ahead in ((f'PORTAL_{k}_glyph', 0.02), (f'PORTAL_{k}_glyph_next', 0.025)):
            bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
            mid = bm.verts.new((0, 0, 0))
            ring = [bm.verts.new((rd * math.cos(2 * math.pi * j / 48), rd * math.sin(2 * math.pi * j / 48), 0)) for j in range(48)]
            for j in range(48):
                f = bm.faces.new((mid, ring[j], ring[(j + 1) % 48]))
                for loop in f.loops:
                    loop[uvl].uv = (cu + (0.5 + loop.vert.co.x / (2 * h)) * cw, 1 - cv - chh + (0.5 + loop.vert.co.y / (2 * h)) * chh)
            me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
            gm = unlit(name.lower(), '#ffffff', image=images[key], opaque=True); gm.use_backface_culling = True
            me.materials.append(gm)
            ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
            # (turned in the face by data['swirl_turn'] for its colour, anticlockwise seen from in front: the atlas is drawn in the frame the HQ's
            # face was unskewed into, which sits that far round from the tile's own)
            st = math.radians(data['swirl_turn'][p['colour']])
            ss, uu = s * math.cos(st) + u * math.sin(st), -s * math.sin(st) + u * math.cos(st)
            ob.matrix_world = Matrix.Translation(c + n * ahead) @ Matrix((ss, uu, n)).transposed().to_4x4()
        # the ring (portals.py's RING): the face's hexagon outline in the face's plane, its own object at the model's top level
        # (the game moves it out along its local Z, the face's normal, and up, and fades it); built where it rests, at the
        # curve's start, so a game that does not move it still draws it where the HQ shows it most
        r0 = data['ring'][0]
        rest = c + n * r0[1] + Vector((0.0, 0.0, r0[2]))
        bm = bmesh.new()
        w = 0.06 * R                                                # (its line: ~6% of the face's radius, the HQ's 2-3 px)
        for j in range(6):
            a0, a1 = math.radians(90 + 60 * j), math.radians(90 + 60 * (j + 1))
            def at(a, rr): return Vector((rr * math.cos(a), rr * math.sin(a), 0.0))
            bm.faces.new([bm.verts.new(v) for v in (at(a0, R), at(a1, R), at(a1, R - w), at(a0, R - w))])
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(f'PORTAL_{k}_ring'); bm.to_mesh(me); bm.free()
        me.materials.append(unlit(f'portal_{k}_ring', pal['ghost']))
        ob = bpy.data.objects.new(f'PORTAL_{k}_ring', me); bpy.context.scene.collection.objects.link(ob)
        ob.matrix_world = Matrix.Translation(rest) @ Matrix((s, u, n)).transposed().to_4x4()
