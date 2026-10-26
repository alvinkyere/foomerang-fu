"""The gong islands' portals (portals.py measures them; build.py calls this): each a thick hexagonal tile standing out of its
rock's face, its "G" swirl a separate plane the game turns (PORTAL_<k>_glyph: its local Z the face's normal, its origin the
face's centre), and the hexagon lying flat on the grass in front as a thin outline (PORTAL_<k>_ghost). Unlit, as the
video's objects are (glTF KHR_materials_unlit)."""
import bpy, bmesh, math
from mathutils import Vector, Matrix


def hexcol(h):
    # (as written: the export and the game take these as they are; made linear here they had come out a gamma too dark,
    # the gold face #e78c17 for #f4c256)
    return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)] + [1.0]


def unlit(name, colour, image=None, alpha=None, opaque=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    for nd in list(nt.nodes):
        if nd.type != 'OUTPUT_MATERIAL': nt.nodes.remove(nd)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Color'].default_value = hexcol(colour)
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


def glyph_image(name, outline, colours, face, N=512):
    """The "G" drawn crisp (4x supersampled) on the face's colour; darker toward its lower left (the HQ's). Opaque: it is
    shown on a disc inside the face's hexagon, so turning it never shows the disc."""
    S = 4 * N
    inside = []
    poly = [((x + 1.28) / 2.56 * S, (1.28 - y) / 2.56 * S) for x, y in outline]   # the plane spans +-1.28 face radii

    def contains(px, py):
        hit = False
        for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
            if (ay > py) != (by > py) and px < (bx - ax) * (py - ay) / (by - ay) + ax: hit = not hit
        return hit
    c1, c2, bgc = hexcol(colours[0]), hexcol(colours[1]), hexcol(face)
    im = bpy.data.images.new(name, N, N)
    px = bgc * (N * N)
    for j in range(N):
        for i in range(N):
            cov = 0
            for sj in range(4):
                for si in range(4):
                    cov += contains(i * 4 + si + 0.5, (N - 1 - j) * 4 + sj + 0.5)
            if cov == 0: continue
            t = min(1.0, max(0.0, (i + j) / (2 * N))); a = cov / 16
            k = (j * N + i) * 4
            g = [c2[q] + (c1[q] - c2[q]) * t for q in range(3)]
            px[k:k + 4] = [bgc[q] * (1 - a) + g[q] * a for q in range(3)] + [1.0]
    im.pixels = px; im.pack()
    return im


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
        c = Vector(p['centre']); R = p['radius']; d = p['depth']
        corner = lambda j, r: s * (r * math.cos(math.radians(90 + 60 * j))) + u * (r * math.sin(math.radians(90 + 60 * j)))
        # the tile: a hexagonal prism from the rock (d behind the face) to the face, navy all round, its face its colour
        bm = bmesh.new()
        front = [bm.verts.new(c + corner(j, R)) for j in range(6)]
        back = [bm.verts.new(c + corner(j, R) - n * d) for j in range(6)]
        bm.faces.new(front)
        for j in range(6):
            bm.faces.new((front[j], back[j], back[(j + 1) % 6], front[(j + 1) % 6]))
        bm.normal_update()
        uv0 = bm.loops.layers.uv.new('UVMap')                     # (one colour: every corner at the texture's middle)
        for f in bm.faces:
            if f.normal.dot(n) < 0: f.normal_flip()
            for loop in f.loops: loop[uv0].uv = (0.5, 0.5)
        me = bpy.data.meshes.new(f'PORTAL_{k}'); bm.to_mesh(me); bm.free()
        # (the face as a texture of its one colour: through the same path as the swirl's disc, so the two match exactly)
        if ('solid', key0 := p['colour']) not in images:
            im = bpy.data.images.new(f'portal_face_{key0}', 4, 4); im.pixels = hexcol(pal['face']) * 16; im.pack()
            images[('solid', key0)] = im
        me.materials.append(unlit(f'portal_{k}_face', '#ffffff', image=images[('solid', key0)], opaque=True))
        me.materials.append(unlit(f'portal_{k}_sides', sides))
        for poly in me.polygons:
            poly.material_index = 0 if Vector(poly.normal).dot(n) > 0.9 else 1
        ob = bpy.data.objects.new(f'PORTAL_{k}', me); bpy.context.scene.collection.objects.link(ob); ob.parent = parent
        # the swirl: a square plane just in front of the face, its own object so the game can turn it about its local Z
        key = p['colour']
        if key not in images: images[key] = glyph_image(f'portal_glyph_{key}', data['glyph'], pal['glyph'], pal['face'])
        h = 1.28 * R; rd = 0.84 * R                                 # (the image spans +-h; the disc, inside the hexagon)
        bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
        mid = bm.verts.new((0, 0, 0))
        ring = [bm.verts.new((rd * math.cos(2 * math.pi * j / 48), rd * math.sin(2 * math.pi * j / 48), 0)) for j in range(48)]
        for j in range(48):
            f = bm.faces.new((mid, ring[j], ring[(j + 1) % 48]))
            for loop in f.loops: loop[uvl].uv = (0.5 + loop.vert.co.x / (2 * h), 0.5 + loop.vert.co.y / (2 * h))
        me = bpy.data.meshes.new(f'PORTAL_{k}_glyph'); bm.to_mesh(me); bm.free()
        me.materials.append(unlit(f'portal_{k}_glyph', '#ffffff', image=images[key], opaque=True))
        # (at the model's top level, not under `parent`: the game merges whatever never moves, and finds this to turn it)
        ob = bpy.data.objects.new(f'PORTAL_{k}_glyph', me); bpy.context.scene.collection.objects.link(ob)
        ob.matrix_world = Matrix.Translation(c + n * 0.02) @ Matrix((s, u, n)).transposed().to_4x4()
        # the outline on the grass: the face's hexagon laid flat in front of the tile, `ghost` placing it from the tile's
        # bottom corner: forward (out of the rock) and right, its radius and its turn
        foot = c + corner(3, R)                                     # (corner 3: the bottom one)
        g = p['ghost']
        nh = Vector((n.x, n.y, 0.0)).normalized(); sh = Vector((0.0, 0.0, 1.0)).cross(nh)
        centre = Vector((foot.x, foot.y, 0.03)) + nh * g['forward'] + sh * g['right']
        R_g, turn_g = g['radius'], g['turn']
        bm = bmesh.new()
        w = 0.05
        for j in range(6):
            a0, a1 = math.radians(turn_g + 60 * j), math.radians(turn_g + 60 * (j + 1))
            def flat(a, r): return centre + nh * (r * math.cos(a)) + sh * (r * math.sin(a))
            o0, o1, i0, i1 = flat(a0, R_g), flat(a1, R_g), flat(a0, R_g - w * 2), flat(a1, R_g - w * 2)
            bm.faces.new([bm.verts.new(v) for v in (o0, o1, i1, i0)])
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        me = bpy.data.meshes.new(f'PORTAL_{k}_ghost'); bm.to_mesh(me); bm.free()
        me.materials.append(unlit(f'portal_{k}_ghost', pal['ghost']))
        ob = bpy.data.objects.new(f'PORTAL_{k}_ghost', me); bpy.context.scene.collection.objects.link(ob); ob.parent = parent
