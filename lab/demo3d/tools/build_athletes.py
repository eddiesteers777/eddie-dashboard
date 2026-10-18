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
HumanService = M("services.humanservice").HumanService
TargetService = M("services.targetservice").TargetService
LocationService = M("services.locationservice").LocationService
DATA = LocationService.get_user_data()

# Southbound palette (css/style.css tokens), linear-ish sRGB for Principled.
def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c] + [1.0]
KIT = {"top": srgb("#24473A"), "bottom": srgb("#2A2E2B"), "shoe": srgb("#C9AD84"), "sole": srgb("#EDE6D8")}

ATHLETES = {
    "male": {
        "macro": {"gender": 1.0, "age": 0.5, "muscle": 0.78, "weight": 0.5, "proportions": 0.8, "height": 0.55, "cupsize": 0.5, "firmness": 0.5,
                  "race": {"african": 0.15, "asian": 0.15, "caucasian": 0.7}},
        "skin": "skins/young_caucasian_male/young_caucasian_male.mhmat",
        "hair": "hair/short02/short02.mhclo",
        "clothes": [("clothes/male_casualsuit06/male_casualsuit06.mhclo", "top"),        # tee (its jeans are cut off)
                    ("clothes/female_sportsuit01/female_sportsuit01.mhclo", "shorts"),   # leggings cut to shorts
                    ("clothes/shoes05/shoes05.mhclo", "shoe")],
    },
    "female": {
        "macro": {"gender": 0.0, "age": 0.5, "muscle": 0.7, "weight": 0.45, "proportions": 0.8, "height": 0.5, "cupsize": 0.45, "firmness": 0.6,
                  "race": {"african": 0.2, "asian": 0.15, "caucasian": 0.65}},
        "skin": "skins/young_caucasian_female/young_caucasian_female.mhmat",
        "hair": "hair/ponytail01/ponytail01.mhclo",
        "clothes": [("clothes/female_sportsuit01/female_sportsuit01.mhclo", "suit"),     # crop top + leggings
                    ("clothes/shoes05/shoes05.mhclo", "shoe")],
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

def hide_covered(body, garments, reach=0.04, margin=0.02, side=0.012):
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
    garments = []
    for path, part in spec["clothes"]:
        obj = HumanService.add_mhclo_asset(os.path.join(DATA, path), body, asset_type="Clothes", subdiv_levels=0, material_type="MAKESKIN")
        garments.append(obj)
        if part == "top":
            delete_faces(obj, lambda co: co.z > waist_z - 0.02, hems=[waist_z - 0.02])
            obj.data.materials.clear(); obj.data.materials.append(flat("sb-top", KIT["top"], 0.8))
        elif part == "shorts":
            # Leggings, cut to mid-thigh shorts and below the waist (the tee covers the top).
            delete_faces(obj, lambda co: knee_z + 0.17 < co.z < waist_z + 0.02, hems=[knee_z + 0.17])
            obj.data.materials.clear(); obj.data.materials.append(flat("sb-bottom", KIT["bottom"], 0.75))
        elif part == "suit":
            # Crop top above the waist (forest), leggings below (charcoal): two material slots.
            obj.data.materials.clear()
            obj.data.materials.append(flat("sb-top", KIT["top"], 0.8)); obj.data.materials.append(flat("sb-bottom", KIT["bottom"], 0.75))
            mw = obj.matrix_world
            for poly in obj.data.polygons:
                z = sum((mw @ obj.data.vertices[i].co).z for i in poly.vertices) / len(poly.vertices)
                poly.material_index = 0 if z > hips_z + 0.08 else 1
        elif part == "shoe":
            if sex == "female":
                # A low shoe: its collar would show through the leggings at the ankle.
                leg_bottom = min(c.z for c, _ in final_coords(garments[0]))
                delete_faces(obj, lambda co: co.z < leg_bottom + 0.01)
            obj.data.materials.clear()
            obj.data.materials.append(flat("sb-shoe", KIT["shoe"], 0.55)); obj.data.materials.append(flat("sb-sole", KIT["sole"], 0.6))
            mw = obj.matrix_world
            for poly in obj.data.polygons:
                z = sum((mw @ obj.data.vertices[i].co).z for i in poly.vertices) / len(poly.vertices)
                poly.material_index = 1 if z < 0.025 else 0
    # Hide the body under the kit, then lift the kit a few millimetres off it.
    hide_covered(body, [g for g in garments])
    for g in garments: inflate(g)
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
                              export_image_format="JPEG", export_jpeg_quality=82, export_yup=True)
    print("WROTE", path, os.path.getsize(path), "bones", len(rig.data.bones), "hips", round(hips_z, 3), "knee", round(knee_z, 3))
