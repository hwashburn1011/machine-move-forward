"""Retain the two original keepsakes, cleaning collapsed faces and microscopic slivers."""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[3];out=root/'assets/native-receiver'
bpy.ops.wm.open_mainfile(filepath=str(out/'NomadReceiver.blend'))
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(root/'godot/art/story-instruments.glb'))
imported=set(bpy.data.objects)-before
parts=[bpy.data.objects[name] for name in ['ArchiveConsole','SeedTerrarium']]
keep=set(parts)
for part in parts:keep.update(part.children_recursive)
for obj in imported-keep:bpy.data.objects.remove(obj,do_unlink=True)
report={'source':'godot/art/story-instruments.glb','removedByMesh':{},'areaThresholdM2':1e-9,'removedAreaM2':0.0,'sourceAreaM2':0.0}
for obj in keep:
    if obj.type!='MESH':continue
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Explicit source triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    bm=bmesh.new();bm.from_mesh(obj.data);invalid=[f for f in bm.faces if f.calc_area()<report['areaThresholdM2']]
    report['sourceAreaM2']+=sum(f.calc_area() for f in bm.faces);report['removedAreaM2']+=sum(f.calc_area() for f in invalid)
    report['removedByMesh'][obj.name]=len(invalid)
    bmesh.ops.delete(bm,geom=invalid,context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()
for part,x in zip(parts,[.22,-.22]):
    part.location=Vector((x,0,1.447));part.rotation_mode='XYZ';part.rotation_euler.z=math.pi;part.scale=Vector((.65,.65,.65))
# Save an editable, assembled native review alongside the unrepaired source.
scene=bpy.context.scene;scene.name='Nomad receiver with recovered keepsakes'
for obj in bpy.data.objects['ScannerModule'].children_recursive:obj.hide_render=False
for obj in bpy.data.objects['EmptyModuleContacts'].children_recursive:obj.hide_render=True
for obj in bpy.data.objects['ScanProgress'].children_recursive:obj.hide_render=False
bpy.data.objects['ScanProgress'].scale.x=.5
bpy.ops.wm.save_as_mainfile(filepath=str(out/'NomadReceiverRecovered.blend'),compress=True)
# The shared part factory also uses ArchiveConsole at existing destinations.
# Export canonical local roots; assembly poses belong only in the saved studio.
poses={part:part.matrix_basis.copy() for part in parts}
for part in parts:part.location=(0,0,0);part.rotation_euler=(0,0,0);part.scale=(1,1,1)
bpy.ops.object.select_all(action='DESELECT')
for obj in keep:obj.select_set(True)
path=root/'godot/art/nomad-receiver-rewards.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
for part in parts:part.matrix_basis=poses[part]
report['bytes']=path.stat().st_size;report['removedTriangles']=sum(report['removedByMesh'].values())
(out/'reward-cleanup.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print('RECEIVER_REWARDS_CLEAN',json.dumps(report),flush=True)
if '--no-render' not in sys.argv:
    scene.render.filepath=str(out/'receiver-recovered.png');bpy.ops.render.render(write_still=True)
