"""Export a refined component master on its retained gameplay bindings."""
import bpy, bmesh, sys, json, re
from pathlib import Path
from mathutils import Matrix
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-character-refinement'
sys.path.insert(0,str(ROOT/'tools/art/native_enemies'))
from repair_tangents import repair
from root_legacy_skin import root_skin

def select(obj):
    bpy.ops.object.select_all(action='DESELECT');obj.hide_set(False);obj.select_set(True);bpy.context.view_layer.objects.active=obj

if __name__=='__main__':
    kind=sys.argv[sys.argv.index('--')+1];hero=kind=='s07';legacy=kind in ['raider','scavenger']
    bpy.ops.wm.open_mainfile(filepath=str(OUT/(kind+'-components.blend')))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    rig.animation_data_clear();rig.data.pose_position='REST'
    parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent==rig]
    report=json.loads((OUT/(kind+'-manifest.json')).read_text()) if (OUT/(kind+'-manifest.json')).exists() else {}

# Read edited PNG bytes even when a component master still carries an older
# packed copy. Blender's pack() alone does not replace existing packed bytes.
for image in bpy.data.images:
    if 'native-character-refinement' in image.filepath and Path(bpy.path.abspath(image.filepath)).is_file():
        if image.packed_file:image.unpack(method='REMOVE')
        image.reload();image.pack()
for mat in bpy.data.materials:
    if 'visor' in mat.name.lower() and mat.use_nodes:
        bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
        if bs:
            bs.inputs['Base Color'].default_value=(.009,.022,.032,1);bs.inputs['Metallic'].default_value=.5;bs.inputs['Roughness'].default_value=.16
if '--pack-source-only' in sys.argv:
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(kind+'-components.blend')),compress=True)
    sys.exit(0)
# Join the new skin, then put it on the exact retained gameplay armature. Mech
# weapon vertices come from the existing playable file, preserving weapon fits.
for obj in parts:
    for mod in list(obj.modifiers):obj.modifiers.remove(mod)
    valid={g.index:g.name for g in obj.vertex_groups if g.name in rig.data.bones}
    totals={i:0.0 for i in valid}
    for vertex in obj.data.vertices:
        for group in vertex.groups:
            if group.group in totals:totals[group.group]+=group.weight
    assert totals and max(totals.values())>0, 'Component has no original bone binding: '+obj.name
    fallback=max(totals,key=totals.get)
    missing=[v.index for v in obj.data.vertices if not any(g.group in valid and g.weight>1e-6 for g in v.groups)]
    if missing:
        obj.vertex_groups[fallback].add(missing,1,'REPLACE')
        print('BOUND_NEW_EDGE_VERTICES',obj.name,len(missing),valid[fallback],flush=True)
select(parts[0])
for obj in parts:obj.select_set(True)
bpy.ops.object.join();body=bpy.context.object;body.name='RefinedSkin'
body.parent=None;body.matrix_world=Matrix.Identity(4)
select(body)
dec=body.modifiers.new('Native close-view budget','DECIMATE');dec.ratio=.61 if hero else .78 if legacy else .43 if kind=='warden' else .65
bpy.ops.object.modifier_apply(modifier=dec.name)
if hero:
    cloth_indices=set()
    for p in body.data.polygons:
        if any(t in body.data.materials[p.material_index].name for t in ['WovenScarf','ClothFibres']):cloth_indices.update(p.vertices)
    for i in cloth_indices:
        v=body.data.vertices[i];x,y,z=v.co
        if x>.36 and z<1.8:
            t=min(1,(x-.36)/1.1);v.co.x=.36+(x-.36)*.20;v.co.y+=t*.52;v.co.z-=t*.08
if not legacy:
    # Append the original gameplay rig (including equipment joints), not a newly
    # generated skeleton. Original actions are left for the native compiler.
    playable=ROOT/('assets/gunner-s07/game/S07_Playable.blend' if hero else f'assets/mech-enemies/gameplay/{kind}_combat.blend')
    before=set(bpy.data.objects)
    with bpy.data.libraries.load(str(playable),link=False) as (src,dst):
        dst.objects=[name for name in src.objects if name in [('S07_Rig' if hero else kind+'_Rig'),('S07_Playable' if hero else kind+'_CombatBody')]]
    imported=[o for o in bpy.data.objects if o not in before]
    for o in imported:bpy.context.scene.collection.objects.link(o)
    game_rig=next(o for o in imported if o.type=='ARMATURE');oldbody=next(o for o in imported if o.type=='MESH')
    game_rig.animation_data_clear();game_rig.data.pose_position='REST'
    for bone in game_rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
    if not hero:
        select(oldbody)
        for mod in list(oldbody.modifiers):oldbody.modifiers.remove(mod)
        bm=bmesh.new();bm.from_mesh(oldbody.data);layer=bm.verts.layers.deform.active
        groups={g.index for g in oldbody.vertex_groups if g.name.startswith('equipment_')}
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not any(i in groups and w>.99 for i,w in v[layer].items())],context='VERTS')
        bm.to_mesh(oldbody.data);bm.free()
        select(body);oldbody.select_set(True);bpy.ops.object.join();body=bpy.context.object
    else:bpy.data.objects.remove(oldbody,do_unlink=True)
    rig=game_rig
body.parent=rig;body.matrix_world=Matrix.Identity(4)
mod=body.modifiers.new('Original gameplay rig','ARMATURE');mod.object=rig
# Appended weapon materials share the refined body palette by source name.
canonical={}
for i,mat in enumerate(body.data.materials):
    name=re.sub(r'\.\d{3}$','',mat.name)
    if name in canonical:body.data.materials[i]=canonical[name]
    else:canonical[name]=mat
select(body)
tri=body.modifiers.new('Portable tangent topology','TRIANGULATE')
bpy.ops.object.modifier_move_up(modifier=tri.name)
bpy.ops.object.modifier_apply(modifier=tri.name)
bm=bmesh.new();bm.from_mesh(body.data)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<max(1e-9,max(e.calc_length()**2 for e in f.edges)*1e-5)],context='FACES_ONLY')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bm.normal_update()
uv=bm.loops.layers.uv.active
if uv:
    for face in bm.faces:
        a,b,c=[loop[uv].uv for loop in face.loops]
        if abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))<1e-10:
            # Newly rounded sidewalls can inherit a collapsed edge UV. Give
            # those triangles a metric projection, retaining all other UVs.
            axis=max(range(3),key=lambda i:abs(face.normal[i]));axes=[i for i in range(3) if i!=axis]
            for loop in face.loops:loop[uv].uv=(loop.vert.co[axes[0]]*3.2,loop.vert.co[axes[1]]*3.2)
bm.to_mesh(body.data);bm.free();body.data.update()
old=list(body.data.materials);unique=list(dict.fromkeys(old));indices=[unique.index(old[p.material_index]) for p in body.data.polygons]
body.data.materials.clear()
for mat in unique:body.data.materials.append(mat)
for polygon,index in zip(body.data.polygons,indices):polygon.material_index=index
# Joining weighted metal panels creates a custom-normal layer on the combined
# mesh. Recalculate textile corners after the traversal cape fold so they do
# not keep lighting normals from the unfolded reference shape.
cloth_slots={i for i,m in enumerate(body.data.materials) if any(t in m.name.lower() for t in ['cloth','scarf','camouflage','canvas'])} if hero else set()
normals=[tuple(n.vector) for n in body.data.corner_normals]
for polygon in body.data.polygons:
    if polygon.material_index in cloth_slots:
        for loop in polygon.loop_indices:normals[loop]=(0,0,0)
if hero:body.data.normals_split_custom_set(normals)
# Only export the new skin and the original binding hierarchy.
select(body);rig.select_set(True)
if rig.parent:rig.parent.select_set(True)
path=ROOT/'godot/art'/('refined-'+('s07-player' if hero else kind)+'.glb')
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_tangents=True,export_cameras=False,export_lights=False)
if legacy:root_skin(path)
report['repairedTangents']=repair(path)
body.data.calc_loop_triangles()
equipment_groups={g.index for g in body.vertex_groups if g.name.startswith('equipment_')}
report['equipmentTriangles']=sum(all(any(g.group in equipment_groups and g.weight>.99 for g in body.data.vertices[i].groups) for i in t.vertices) for t in body.data.loop_triangles)
report['triangles']=len(body.data.loop_triangles);report['materials']=len(unique)
(OUT/(kind+'-manifest.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('CHARACTER_REFINED',kind,report['triangles'],len(report.get('rounded',[])),len(report.get('cloth',[])),flush=True)
