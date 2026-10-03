"""Read-only GLB QA. Render the actual chest inside the exported grab geometry."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/native-salvage-beta'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/art/beta-port-claw.glb'))
head=bpy.data.objects['ClawHead'];keep={head,*head.children_recursive}
head.parent=None;head.location=(0,0,1.565)
for obj in list(bpy.context.scene.objects):
    if obj not in keep:bpy.data.objects.remove(obj,do_unlink=True)
previous=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/authored/salvage-chest.glb'))
new=set(bpy.context.scene.objects)-previous
cargo=bpy.data.objects.new('Cargo placement QA',None);bpy.context.collection.objects.link(cargo)
for obj in new:
    if obj.parent not in new:obj.parent=cargo
def bounds(root):
    points=[o.matrix_world@v.co for o in root.children_recursive if o.type=='MESH' for v in o.data.vertices]
    points=[Vector((p.x,p.z,-p.y)) for p in points]
    return [min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)]
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.world=bpy.data.worlds.new('Fit review');scene.world.color=(.3,.3,.3)
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object
m=bpy.data.materials.new('QA ground');m.diffuse_color=(.14,.15,.12,1);floor.data.materials.append(m)
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=3.5
cam.location=(3,-4.5,3);target=Vector((0,0,.95));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
for p,power in [((3,-4,5),1000),((-3,-1,4),800),((0,4,5),1300)]:
    bpy.ops.object.light_add(type='AREA',location=p);o=bpy.context.object;o.data.energy=power;o.data.size=4
    o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1300;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
report=[]
for name,angle,offset in [('open',0,-1),('closed-current',.2,-1),('closed-raised-cargo',.2,-.70)]:
    bpy.data.objects['JawA'].rotation_mode='XYZ';bpy.data.objects['JawB'].rotation_mode='XYZ'
    bpy.data.objects['JawA'].rotation_euler.x=-angle;bpy.data.objects['JawB'].rotation_euler.x=angle
    cargo.location=(0,0,1.565+offset);bpy.context.view_layer.update();lo,hi=bounds(cargo)
    vertices=[]
    for node in ['JawA','JawB']:
        root=bpy.data.objects[node]
        pts=[o.matrix_world@v.co for o in root.children_recursive if o.type=='MESH' for v in o.data.vertices]
        pts=[Vector((p.x,p.z,-p.y)) for p in pts]
        inside=sum(all(lo[i]+.004<p[i]<hi[i]-.004 for i in range(3)) for p in pts)
        vertices.append({'jaw':node,'verticesWithinChestAABB':inside,'vertexCount':len(pts)})
    report.append({'name':name,'jawAngle':angle,'cargoOffset':offset,'chestBounds':{'min':lo,'max':hi},'jaws':vertices})
    scene.render.filepath=str(OUT/('carry-fit-'+name+'.png'));bpy.ops.render.render(write_still=True)
(OUT/'carry-fit-review.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
