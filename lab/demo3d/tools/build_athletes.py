"""Southbound 3D demos: build the male and female athletes (CC0 MakeHuman).

Run headless with Blender 4.5 LTS + the MPFB 2 extension + the MakeHuman
system asset pack (all CC0 for the generated character; see LICENSES.md):

    blender -b -noaudio -P lab/demo3d/tools/build_athletes.py -- <out_dir>

Writes <out_dir>/athlete-male.glb and athlete-female.glb: a skinned body on
MPFB's Mixamo-compatible rig (so the exercise rig in lab/demo3d/rig.js poses
it), dressed in Southbound kit (forest top, charcoal shorts / leggings, tan
shoes), with hair, eyebrows, eyelashes and eyes. No animation here: the
motion is baked separately (tools/bake.mjs) so one body serves every exercise.

Approach adapted from OpenGym3D's create_human() (MIT, (c) 2026
SylvesterAssiamahGK, github.com/AssiamahS/opengym3d): MPFB's HumanService,
macro sliders, a builtin rig.
"""
import bpy, os, sys, importlib, bmesh
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp/athletes"
os.makedirs(OUT, exist_ok=True)
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
M = lambda p: importlib.import_module("bl_ext.user_default.mpfb." + p)
DL = None
HumanService = M("services.humanservice").HumanService
TargetService = M("services.targetservice").TargetService
LocationService = M("services.locationservice").LocationService
DATA = LocationService.get_user_data()

# Southbound palette (css/style.css tokens), linear-ish sRGB for Principled.
def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c] + [1.0]
KIT = {"top": srgb("#24473A"), "bottom": srgb("#2A2E2B"), "shoe": srgb("#C9AD84"), "sole": srgb("#EDE6D8")}

BROW = {"male": (0.10, 0.065, 0.045), "female": (0.20, 0.09, 0.04)}   # linear, close to each athlete's hair

ATHLETES = {
    "male": {
        "macro": {"gender": 1.0, "age": 0.5, "muscle": 0.78, "weight": 0.5, "proportions": 0.8, "height": 0.55, "cupsize": 0.5, "firmness": 0.5,
                  "race": {"african": 0.15, "asian": 0.15, "caucasian": 0.7}},
        "skin": "skins/young_caucasian_male/young_caucasian_male.mhmat",
        "hair": "hair/{0}/{0}.mhclo".format(os.environ.get("HAIR_M", "short02")),
        "clothes": [("clothes/{0}/{0}.mhclo".format(os.environ.get("SHOE", "shoes03")), "shoe")],
        # Generated garments (see make_shell): a crew-neck tee with sleeves and shorts to mid-thigh.
        "kit": {"top_hem": -0.05, "top_off": 0.010, "sleeve": 0.45, "bottom": "shorts", "bottom_off": 0.007, "logo_drop": 0.16}
    },
    "female": {
        "macro": {"gender": 0.0, "age": 0.5, "muscle": 0.7, "weight": 0.45, "proportions": 0.8, "height": 0.5, "cupsize": 0.45, "firmness": 0.6,
                  "race": {"african": 0.2, "asian": 0.15, "caucasian": 0.65}},
        "skin": "skins/young_caucasian_female/young_caucasian_female.mhmat",
        "hair": "hair/{0}/{0}.mhclo".format(os.environ.get("HAIR_F", "ponytail01")),
        "clothes": [("clothes/{0}/{0}.mhclo".format(os.environ.get("SHOE", "shoes03")), "shoe")],
        # A fitted tee that covers the midriff, over full-length leggings.
        "kit": {"top_hem": -0.01, "top_off": 0.009, "sleeve": 0.40, "bottom": "leggings", "bottom_off": 0.006, "logo_drop": 0.17}
    },
}
FACE = [("eyebrows/eyebrow001/eyebrow001.mhclo", "Eyebrows"), ("eyelashes/eyelashes01/eyelashes01.mhclo", "Eyelashes"),
        ("eyes/low-poly/low-poly.mhclo", "Eyes")]

def flat(name, rgba, rough=0.7):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = rgba
    p.inputs["Roughness"].default_value = rough
    return m

def simple_textured(obj, alpha=True):
    """MakeSkin node trees don't survive glTF: rebuild as a Principled BSDF
    with the asset's own diffuse texture (and its alpha for hair, brows, lashes)."""
    old = obj.active_material
    img = None
    if old and old.use_nodes:
        for n in old.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and "normal" not in n.image.name.lower() and "_ao" not in n.image.name.lower():
                img = n.image; break
    m = bpy.data.materials.new(obj.name + "-sb"); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes["Principled BSDF"]
    p.inputs["Roughness"].default_value = 0.6 if alpha else 0.15
    if img:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
        nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
        if alpha:
            nt.links.new(t.outputs["Alpha"], p.inputs["Alpha"])
            m.blend_method = "HASHED"
    obj.data.materials.clear(); obj.data.materials.append(m)

def final_coords(obj):
    """World positions and normals as the mesh is shaped (shape keys applied),
    with modifiers off so indices match obj.data."""
    saved = [(m, m.show_viewport) for m in obj.modifiers]
    for m, _ in saved: m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg); me = ev.to_mesh()
    mw = obj.matrix_world; nm = mw.to_3x3().inverted().transposed()
    out = [(mw @ v.co, (nm @ v.normal).normalized()) for v in me.vertices]
    ev.to_mesh_clear()
    for m, on in saved: m.show_viewport = on
    return out

def hide_covered(body, garments, reach=0.04, margin=0.02, side=0.012, keep=None):
    """Hide the body wherever a garment covers it, so skin can't poke through
    the kit when the joints bend. A body vertex is covered when the nearest
    point on a garment's surface is within reach, lies outward of the skin
    (along the body's own normal) and straight out from it, not off past a
    hem. Replaces the garments' own delete-group masks, which don't match
    cut garments."""
    from mathutils.bvhtree import BVHTree
    trees = []
    for g in garments:
        co = [c for c, _ in final_coords(g)]
        trees.append(BVHTree.FromPolygons(co, [tuple(p.vertices) for p in g.data.polygons]))
    hide = []
    for i, (co, nb) in enumerate(final_coords(body)):
        for t in trees:
            loc, _, _, d = t.find_nearest(co, reach)
            if loc is None: continue
            off = loc - co; out = off.dot(nb)
            if out > -margin and (off - nb * out).length < side: hide.append(i); break
    if keep:   # e.g. the neck opening: never hide skin there, a gap would show the background
        cos = [c for c, _ in final_coords(body)]
        hide = [i for i in hide if not keep(cos[i])]
    # Leave the skin visible near every hem: the kit is thick and sits clear of the body there, so nothing pokes
    # through, and hiding right up to the rim leaves stair-stepped gaps once the arms lift the sleeve.
    from mathutils.kdtree import KDTree
    rim = []
    for g in garments:
        mw = g.matrix_world
        bmg = bmesh.new(); bmg.from_mesh(g.data)
        rim += [mw @ v.co for v in bmg.verts if any(e.is_boundary for e in v.link_edges)]
        bmg.free()
    kd = KDTree(max(1, len(rim)))
    for i, c in enumerate(rim): kd.insert(c, i)
    kd.balance()
    cos_all = [c for c, _ in final_coords(body)]
    hide = [i for i in hide if not rim or kd.find(cos_all[i])[2] > 0.03]
    # Pull the hidden area's border one ring back under the garment: hiding
    # right up to a hem leaves a see-through gap just past it.
    bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
    hidden = set(hide)
    hide = [i for i in hidden if all(e.other_vert(bm.verts[i]).index in hidden for e in bm.verts[i].link_edges)]
    bm.free()
    for mod in list(body.modifiers):
        if mod.type == "MASK" and mod.name != "Hide helpers" and "shoe" not in mod.name.lower():
            body.modifiers.remove(mod)
    vg = body.vertex_groups.new(name="sb-under-kit"); vg.add(hide, 1.0, "REPLACE")
    m = body.modifiers.new("Hide under kit", "MASK"); m.vertex_group = vg.name; m.invert_vertex_group = True
    print("hidden under kit:", len(hide))

def inflate(obj, by=0.003):
    """Push a garment out a few millimetres so it stays clear of the skin."""
    for (co, n), v in zip(final_coords(obj), obj.data.vertices):
        v.co = obj.matrix_world.inverted() @ (co + n * by)

def delete_faces(obj, keep, hems=()):
    """Delete the faces of obj whose centre fails keep(world_co). Each hem
    height in hems straightens the new edge: its vertices within 4 cm move to
    that height (the body stands upright here, so that's a level hem)."""
    me = obj.data; mw = obj.matrix_world; inv = mw.inverted()
    bm = bmesh.new(); bm.from_mesh(me)
    gone = [f for f in bm.faces if not keep(mw @ f.calc_center_median())]
    bmesh.ops.delete(bm, geom=gone, context="FACES_ONLY")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    for v in bm.verts:
        if not v.is_boundary: continue
        w = mw @ v.co
        for h in hems:
            if abs(w.z - h) < 0.04: w.z = h; v.co = inv @ w; break
    bm.to_mesh(me); bm.free(); me.update()


ARM_CHAIN = ("Arm", "ForeArm", "Hand")
def short_name(vg_name, pre): return vg_name.replace(pre, "") if pre else vg_name

def dominant(v, names):
    """The bone name that moves this vertex most."""
    best, w = "", 0.0
    for gi, gw in v[DL].items():
        n = names.get(gi, "")
        if n in ("body", "Left", "Right", "Mid") or n.startswith(("helper", "joint", "Helper", "Joint")): continue
        if gw > w: best, w = n, gw
    return best

def in_arm(name, side=None):
    for s in ([side] if side else ["Left", "Right"]):
        if name == s + "Arm" or name == s + "ForeArm" or name.startswith(s + "Hand"): return True
    return False

def make_shell(body, rig, pre, name, mat, *, zmin=None, zmax=None, arms="remove", sleeve=None, collar_z=None, offset=0.008, relax=0):
    """A garment made from the body itself, offset outward: it deforms exactly
    like the skin (same weights) so nothing pokes through when joints bend, and
    its hems are straight cuts. arms: 'remove' (bottoms) or 'keep' (tee, with
    sleeve = fraction of the upper arm to keep)."""
    global DL
    o = body.copy(); o.data = body.data.copy(); o.name = name; o.data.name = name
    bpy.context.collection.objects.link(o)
    for m in list(o.modifiers):
        if m.type == "MASK": o.modifiers.remove(m)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    if o.data.shape_keys: bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    if o.data.has_custom_normals: bpy.ops.mesh.customdata_custom_splitnormals_clear()   # stale after we cut the mesh
    names = {g.index: short_name(g.name, pre) for g in o.vertex_groups}
    bm = bmesh.new(); bm.from_mesh(o.data)
    DL = bm.verts.layers.deform.verify()
    body_gi = o.vertex_groups["body"].index
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if body_gi not in v[DL]], context="VERTS")
    # Normals of the body as it was, before we cut it: the cut leaves slivers whose own normals are poor.
    from mathutils.kdtree import KDTree
    bm.normal_update()
    kd = KDTree(len(bm.verts))
    for i, v in enumerate(bm.verts): kd.insert(v.co, i)
    kd.balance()
    onorm = [v.normal.copy() for v in bm.verts]
    def smooth_normal(co):
        n = Vector()
        for _, i, d in kd.find_n(co, 6): n += onorm[i] / (d + 0.004)
        return n.normalized()
    cut = lambda co, no, **k: bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=co, plane_no=no, dist=1e-5, **k)
    if collar_z is not None:   # finer faces around the neck so the neckline is smooth
        near = [e for e in bm.edges if all(abs(v.co.x) < 0.30 and collar_z - 0.14 < v.co.z < collar_z + 0.22 for v in e.verts)]
        bmesh.ops.subdivide_edges(bm, edges=near, cuts=3, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    if zmin is not None: cut((0, 0, zmin), (0, 0, 1), clear_inner=True)

    if zmax is not None: cut((0, 0, zmax), (0, 0, 1), clear_outer=True)
    if collar_z is not None: cut((0, 0, collar_z), (0, 0, 1))
    if arms == "keep" and sleeve:
        for side in ("Left", "Right"):
            a = rig.matrix_world @ rig.data.bones[pre + side + "Arm"].head_local
            f = rig.matrix_world @ rig.data.bones[pre + side + "ForeArm"].head_local
            d = (f - a); L = d.length; d.normalize()
            P = a + d * (L * sleeve)
            # Cut only the arm's faces: a tilted plane through the torso would leave long slivers there.
            fs = [f for f in bm.faces if abs(f.calc_center_median().x) > 0.19]
            arm_geom = fs + list({e for f in fs for e in f.edges}) + list({v for f in fs for v in f.verts})
            bmesh.ops.bisect_plane(bm, geom=arm_geom, plane_co=P, plane_no=d, dist=1e-5)
            bad = [v for v in bm.verts if (v.co - P).dot(d) > 1e-4 and (in_arm(dominant(v, names), side) or abs(v.co.x) > 0.22)]
            bmesh.ops.delete(bm, geom=bad, context="VERTS")
    if arms == "remove":
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if in_arm(dominant(v, names)) or abs(v.co.x) > 0.3], context="VERTS")
    if collar_z is not None:   # the neck and head come out of the tee, with a round neckline
        # A round neckline: cut along the tangents of an ellipse (N straight cuts, so the edge is smooth
        # and exact), then drop the faces inside it and everything above it (the neck and head).
        import math
        cx, N = 0.0, 28
        cz, ra, rb = collar_z + 0.045, 0.098, 0.082          # the front scoop
        czb, rab, rbb = collar_z + 0.085, 0.090, 0.050       # the back sits much higher (a crew neck, not a scoop)
        def ellipse(cz_, ra_, rb_):
            out = []
            for k in range(N):
                th = 2 * math.pi * k / N
                out.append((Vector((cx + ra_ * math.cos(th), 0.0, cz_ + rb_ * math.sin(th))), Vector((math.cos(th) / ra_, 0.0, math.sin(th) / rb_)).normalized()))
            return out
        import math
        front, back = ellipse(cz, ra, rb), ellipse(czb, rab, rbb)
        for pt, nm, is_back in [(p_, n_, 0) for p_, n_ in front] + [(p_, n_, 1) for p_, n_ in back]:
            near = {v for v in bm.verts if v.co.z > collar_z - 0.12 and abs(v.co.x) < 0.2}
            # each scoop only cuts its own side (front faces / back faces), so the other side gets no stray cut lines
            fs = [f for f in bm.faces if any(v in near for v in f.verts) and ((f.calc_center_median().y > -0.015) if is_back else (f.calc_center_median().y < 0.015))]
            es = list({e for f in fs for e in f.edges})
            vs = list({v for f in fs for v in f.verts})
            bmesh.ops.bisect_plane(bm, geom=vs + es + fs, plane_co=pt, plane_no=nm, dist=1e-6)
        def inside(c, planes): return all((c - pt).dot(nm) < 1e-6 for pt, nm in planes)
        def goes(f):
            c = f.calc_center_median()
            if c.y > 0: return inside(c, back) or (c.z > czb and abs(c.x) < rab)      # the back of the tee
            return inside(c, front) or (c.z > cz and abs(c.x) < ra)
        gone = [f for f in bm.faces if goes(f)]
        bmesh.ops.delete(bm, geom=gone, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0012)   # merge the slivers the cuts leave
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=0.0006)
    if collar_z is not None:   # smooth the raw neckline / sleeve edges (the cut leaves a faint saw-tooth)
        for _ in range(6):
            bnd = [v for v in bm.verts if any(e.is_boundary for e in v.link_edges) and v.co.z > collar_z - 0.14]
            new = {}
            for v in bnd:
                nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
                if len(nb) == 2: new[v] = v.co.lerp((nb[0].co + nb[1].co) / 2, 0.5)
            for v, co in new.items(): v.co = co
    for f in bm.faces: f.smooth = True   # cuts create flat faces: shade them all smooth
    for e in bm.edges: e.smooth = True
    norms = {v.index: smooth_normal(v.co) for v in bm.verts}
    for v in bm.verts:
        extra = 0.0
        if collar_z is not None:   # a little more room around the collarbones, where the skin curves sharply
            t = min(1.0, max(0.0, (v.co.z - (collar_z - 0.14)) / 0.1))
            extra = 0.007 * t * t * (3 - 2 * t)
        v.co += norms[v.index] * (offset + extra)
    # Loosen the cloth: relax the surface so it doesn't trace every muscle crease of the body under it.
    fixed = {v.index for v in bm.verts if any(e.is_boundary for e in v.link_edges) or (zmin is not None and v.co.z < zmin + 0.004) or (zmax is not None and v.co.z > zmax - 0.004)}
    for _ in range(relax):
        new = {}
        for v in bm.verts:
            if v.index in fixed or not v.link_edges: continue
            avg = sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges)
            new[v.index] = v.co.lerp(avg, 0.5)
        for v in bm.verts:
            if v.index in new: v.co = new[v.index]
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(o.data); bm.free(); o.data.update()
    o.data.materials.clear(); o.data.materials.append(mat)
    zs = [v.co.z for v in o.data.vertices]
    print('SHELL', name, 'z', round(min(zs), 3), round(max(zs), 3), 'verts', len(zs))
    return o

def thicken(o, inner, t=0.0035):
    """Give a cloth shell real thickness (inward, so the outside stays put) with
    a darker inside, so hems read as cut cloth, not a torn sheet."""
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    o.data.materials.append(inner)
    m = o.modifiers.new("Thick", "SOLIDIFY")
    m.thickness = t; m.offset = -1; m.use_even_offset = False; m.use_rim = True; m.nonmanifold_thickness_mode = "FIXED"; m.nonmanifold_boundary_mode = "NONE"
    m.material_offset = 1; m.material_offset_rim = 0
    bpy.ops.object.modifier_move_to_index(modifier="Thick", index=0)
    bpy.ops.object.modifier_apply(modifier="Thick")

def make_logo(shell, img_path, center_z, width=0.15, lift=0.0015):
    """The Southbound mark: a patch of the tee's own chest faces, lifted a
    millimetre and a half, UV-mapped to the logo's alpha."""
    o = shell.copy(); o.data = shell.data.copy(); o.name = "sb-logo"; o.data.name = "sb-logo"
    bpy.context.collection.objects.link(o)
    h = width * 655 / 1024
    bm = bmesh.new(); bm.from_mesh(o.data)
    keep = []
    for f in bm.faces:
        c = f.calc_center_median()
        if f.normal.y < -0.2 and abs(c.x) < width / 2 + 0.012 and abs(c.z - center_z) < h / 2 + 0.012: keep.append(f)
    gone = [f for f in bm.faces if f not in set(keep)]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    for f in bm.faces: f.smooth = True
    bm.normal_update()
    for v in bm.verts: v.co += v.normal * lift
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = ((l.vert.co.x + width / 2) / width, (l.vert.co.z - center_z + h / 2) / h)
    bm.to_mesh(o.data); bm.free(); o.data.update()
    m = bpy.data.materials.new("sb-logo"); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes["Principled BSDF"]; p.inputs["Roughness"].default_value = 0.6
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(img_path); t.extension = "CLIP"
    nt.links.new(t.outputs["Color"], p.inputs["Base Color"]); nt.links.new(t.outputs["Alpha"], p.inputs["Alpha"])
    m.blend_method = "HASHED"
    o.data.materials.clear(); o.data.materials.append(m)
    return o

def bone_z(rig, name):
    return (rig.matrix_world @ rig.data.bones[name].head_local).z

for sex, spec in ATHLETES.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
    body = HumanService.create_human(macro_detail_dict=spec["macro"])
    HumanService.set_character_skin(os.path.join(DATA, spec["skin"]), body, skin_type="GAMEENGINE")
    rig = HumanService.add_builtin_rig(body, "mixamo")
    pre = "mixamorig:" if "mixamorig:Hips" in rig.data.bones else ""
    hips_z = bone_z(rig, pre + "Hips"); knee_z = bone_z(rig, pre + "LeftLeg")
    waist_z = hips_z + 0.06
    for path, kind in FACE + [(spec["hair"], "Hair")]:
        obj = HumanService.add_mhclo_asset(os.path.join(DATA, path), body, asset_type=kind, subdiv_levels=0, material_type="MAKESKIN")
        simple_textured(obj, alpha=kind != "Eyes")
    kit = spec["kit"]
    garments = []
    neck_z = bone_z(rig, pre + "Neck")
    # Bottoms first (the shoe trim below looks at garments[0]).
    if kit["bottom"] == "shorts":
        bottom = make_shell(body, rig, pre, "sb-shorts", flat("sb-bottom", KIT["bottom"], 0.75), zmin=knee_z + 0.17, zmax=hips_z + kit["top_hem"] + 0.03, offset=kit["bottom_off"])
    else:
        bottom = make_shell(body, rig, pre, "sb-leggings", flat("sb-bottom", KIT["bottom"], 0.75), zmin=bone_z(rig, pre + "LeftFoot") + 0.0, zmax=hips_z + kit["top_hem"] + 0.03, offset=kit["bottom_off"])
    garments.append(bottom)
    top = make_shell(body, rig, pre, "sb-tee", flat("sb-top", KIT["top"], 0.8), zmin=hips_z + kit["top_hem"], arms="keep", sleeve=kit["sleeve"], collar_z=neck_z - 0.025, offset=kit["top_off"] + 0.003, relax=0)
    garments.append(top)
    logo_z = neck_z - kit["logo_drop"]
    logo = make_logo(top, os.path.join(os.path.dirname(os.path.abspath(__file__)), "art", "sb-logo.png"), logo_z)
    for path, part in spec["clothes"]:
        obj = HumanService.add_mhclo_asset(os.path.join(DATA, path), body, asset_type="Clothes", subdiv_levels=0, material_type="MAKESKIN")
        garments.append(obj)
        if part == "shoe":
            if kit["bottom"] == "leggings":
                # Leggings end at the ankle bone: trim the shoe's cuff so it can't show through them.
                delete_faces(obj, lambda co: co.z < bone_z(rig, pre + "LeftFoot") + 0.03)
            # One material, coloured per vertex (smooth blends, no stair-steps on the coarse mesh):
            # white sole fading into a tan upper.
            mw = obj.matrix_world
            ca = obj.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
            def lin(c): return list(c[:3]) + [1.0]
            def mix(a_, b_, t): return [a_[i] + (b_[i] - a_[i]) * t for i in range(4)]
            sm = lambda x: x * x * (3 - 2 * x)
            for v in obj.data.vertices:
                z = (mw @ v.co).z
                col = lin(KIT["shoe"])
                col = mix(col, lin(KIT["sole"]), 1 - sm(min(1, max(0, (z - 0.016) / 0.008))))
                ca.data[v.index].color = col
            m = bpy.data.materials.new("sb-shoe"); m.use_nodes = True
            nt = m.node_tree; pb = nt.nodes["Principled BSDF"]; pb.inputs["Roughness"].default_value = 0.55
            cn = nt.nodes.new("ShaderNodeVertexColor"); cn.layer_name = "Col"
            nt.links.new(cn.outputs["Color"], pb.inputs["Base Color"])
            obj.data.materials.clear(); obj.data.materials.append(m)
    # Hide the body under the kit, then lift the kit a few millimetres off it.
    hide_covered(body, [bottom, top], keep=lambda co: co.z > neck_z - 0.025 - 0.09 and abs(co.x) < 0.16)
    # (the shells are already offset from the skin; the shoes get a lift)
    for g in garments[2:]: inflate(g)
    # Hems with thickness (after the logo patch was taken from the single sheet).
    for g, base in ((bottom, KIT["bottom"]), (top, KIT["top"])):
        thicken(g, flat("sb-inner-" + g.name, tuple(c * 0.8 for c in base[:3]) + (1.0,), 0.9))
    # The skin is opaque: drop its alpha link so the exporter stores it as a JPEG (a quarter of the PNG's size).
    for m in bpy.data.materials:
        if m.use_nodes and m.name == "Human.body":
            for l in list(m.node_tree.links):
                if l.to_socket.name == "Alpha": m.node_tree.links.remove(l)
            m.blend_method = "OPAQUE"
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image: n.image.alpha_mode = "NONE"
    # Soften the hair texture's alpha a little so the hairline feathers (the player draws it with alpha-to-coverage).
    import numpy as np
    for img in bpy.data.images:
        if img.size[0] > 0 and any(k in img.name.lower() for k in ("short0", "ponytail", "bob", "braid")) and "diffuse" in img.name.lower():
            w, h = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
            a = px[:, :, 3]
            for _ in range(3):
                a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5.0
            px[:, :, 3] = a
            img.pixels = px.ravel().tolist()
    # The brow texture is solid black: tint it to the hair so the brows read as hair, not marker lines.
    brow = BROW[sex]
    for img in bpy.data.images:
        if img.size[0] > 0 and "eyebrow" in img.name.lower():
            w, h = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
            px[:, :, 0], px[:, :, 1], px[:, :, 2] = brow
            px[:, :, 3] = np.clip(px[:, :, 3] * 1.0, 0, 1)
            img.pixels = px.ravel().tolist()
    # Phone-sized textures: skin 1024, everything else 512.
    for img in bpy.data.images:
        if img.size[0] > 0:
            cap = 1024 if "skin" in img.name.lower() or "male" in img.name.lower() else 512
            if max(img.size) > cap:
                k = cap / max(img.size); img.scale(int(img.size[0] * k), int(img.size[1] * k))
    # Export: skinned meshes + rig, no animation, Y-up, textures as JPEG.
    for o in bpy.data.objects: o.select_set(o.type in {"MESH", "ARMATURE"})
    path = os.path.join(OUT, f"athlete-{sex}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_skins=True, export_animations=False, export_morph=False,
                              export_vertex_color="ACTIVE", export_active_vertex_color_when_no_material=True, export_image_format="JPEG", export_jpeg_quality=82, export_yup=True)
    print("WROTE", path, os.path.getsize(path), "bones", len(rig.data.bones), "hips", round(hips_z, 3), "knee", round(knee_z, 3))
