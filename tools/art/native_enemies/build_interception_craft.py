"""Adapt the original crossfire hull master into the playable raider assemblies.

Blender --background --factory-startup --python this_file.py [-- --no-render]
Keeps full scale crew decks, guns, muzzle/seat anchors; bakes scaled hull parts
from CrossfireShips.blend into geometry so runtime colliders remain metric.
"""
import bpy, bmesh, json, sys, re
from pathlib import Path
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-raiders/interception';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(Path(__file__).resolve().parent))
from repair_tangents import repair

bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
with bpy.data.libraries.load(str(ROOT/'assets/native-raiders/RaiderCraft.blend'),link=False) as (source,target):
    target.objects=[name for name in source.objects if name not in ['Camera'] and not name.startswith('Area')]
originals=[o for o in target.objects if o]
roots=[next(o for o in originals if o.name==name) for name in ['RaiderSkiff','RaiderGunboat']]
for root in roots:
    root.location=(0,0,0)
    for obj in [root,*root.children_recursive]:
        if not obj.users_collection:bpy.context.collection.objects.link(obj)
with bpy.data.libraries.load(str(ROOT/'assets/native-ships/CrossfireShips.blend'),link=False) as (source,target):
    target.objects=source.objects
master=next(o for o in target.objects if o and o.name=='RobotWarship')
parts=[o for o in master.children_recursive if o.type=='MESH']
keep=('Continuous tapered armored hull','Longitudinal keel','Hull belt frame','Upper rubbed edge',
      'Replaceable upper armor','Side machinery recess','Angled cooling louvre','Vent frame upright',
      'Inset navigation strip','Lamp protective eyebrow','Propulsion duct clamp','External armored cable',
      'Cable saddle','Stamped MACHINE ORDER','Stamped 03','Bow collision armor','Bow headlamp mount',
      'Protected bow lens','Tow eye backing','Open tow eye','Lift plenum','Open lift outlet',
      'Dark outlet depth','Radial outlet vane')
remove=('Formed boarding hull','Sealed armored gunboat hull','Replaceable hull cheek','Raised armor cassette',
        'Armor mounting spacer','Cassette mounting spacer','Hull rubbing strake','Gunboat rub rail',
        'Rub rail saddle','Recessed side identity','Stamped 07 / BOARD','Stamped ORDER // 03',
        'Lift duct armored shell','Lift outlet wear ring','Recessed lift motor','Recessed lift impeller',
        'Motor locating spoke','Sealed headlamp case','Recessed amber lamp','Lamp guard rod','Bow recovery eye','Gunboat tow eye')
report={'source':'CrossfireShips.blend RobotWarship hull and RaiderCraft.blend full-scale decks, seats, weapons and engines','models':[]}
for root,scale in zip(roots,[(.34,.145,.22),(.40,.268,.36)]):
    for obj in list(root.children_recursive):
        if obj.type=='MESH' and obj.name.startswith(remove):bpy.data.objects.remove(obj,do_unlink=True)
    # Blender Z-up conversion of game X/Y/Z scaling.
    bake=Matrix.Diagonal((scale[0],scale[2],scale[1],1))
    count=0
    for source in parts:
        if not source.name.startswith(keep):continue
        obj=source.copy();obj.data=source.data.copy();obj.name='Crossfire '+re.sub(r'\.\d+$','',source.name)
        # Library objects are not linked to a dependency graph. Their evaluated
        # matrix_world may be stale; saved local transforms are authoritative.
        local=source.matrix_parent_inverse@Matrix.LocRotScale(source.location,source.rotation_euler.to_quaternion(),source.scale);ancestor=source.parent
        while ancestor and ancestor!=master:
            local=ancestor.matrix_parent_inverse@Matrix.LocRotScale(ancestor.location,ancestor.rotation_euler.to_quaternion(),ancestor.scale)@local;ancestor=ancestor.parent
        obj.data.transform(bake@local)
        obj.parent=root;obj.matrix_parent_inverse=Matrix.Identity(4);obj.matrix_basis=Matrix.Identity(4)
        bpy.context.collection.objects.link(obj);count+=1
    # Portable semantic anchors allow effects and collider bounds to be audited.
    anchors={'HullDamageAnchor':(0,1.2,0),'GrappleLauncher':(0,1.9,.4),'LeapLaunch':(.58,1.224,.35)} if root==roots[0] else {'HullDamageAnchor':(0,1.2,0)}
    for name,(x,y,z) in anchors.items():
        anchor=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(anchor);anchor.parent=root;anchor.location=(x,-z,y)
    report['models'].append({'name':root.name,'crossfireParts':count,'hullScaleXYZ':scale,'crewAndWeaponScale':1.0})

scene=bpy.context.scene;scene.world.color=(.13,.13,.13)
roots[0].location=(-2.5,0,0);roots[1].location=(2.7,-1,0)
bpy.ops.object.camera_add(location=(13,17,12));camera=bpy.context.object;target=Vector((0,0,1.6));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=14.5;scene.camera=camera
for at,power,size in [((2,8,12),2300,8),((-8,-3,8),1800,8),((8,-6,10),2300,7)]:
    bpy.ops.object.light_add(type='AREA',location=at);obj=bpy.context.object;obj.data.energy=power;obj.data.shape='DISK';obj.data.size=size;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1440;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'interception-craft.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'InterceptionCraft.blend'),compress=True)
if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)
for root in roots:
    root.location=(0,0,0)
    for parent in [root,*[o for o in root.children_recursive if o.type=='EMPTY']]:
        pieces=[o for o in parent.children if o.type=='MESH']
        if not pieces:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in pieces:obj.select_set(True)
        bpy.context.view_layer.objects.active=pieces[0]
        bpy.ops.object.join();obj=bpy.context.object;obj.name=parent.name+'Mesh'
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        # Full editable source stays intact above. Reduce repeated vent bevels
        # and tiny fasteners in the distant gameplay assembly, retaining guns.
        if parent==root:
            decimate=obj.modifiers.new('Runtime hull detail budget','DECIMATE');decimate.ratio=.56
            bpy.ops.object.modifier_apply(modifier=decimate.name)
        tri=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
        bm=bmesh.new();bm.from_mesh(obj.data)
        tiny=[face for face in bm.faces if face.calc_area()<1e-9]
        if tiny:bmesh.ops.delete(bm,geom=tiny,context='FACES_ONLY')
        bm.to_mesh(obj.data);bm.free();obj.data.update()
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
    for obj in [root,*root.children_recursive]:obj.select_set(True)
path=ROOT/'godot/art/interception-craft.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True,export_cameras=False,export_lights=False)
report['tangentRepair']=repair(path);report['bytes']=path.stat().st_size
(OUT/'manifest.json').write_text(json.dumps(report,indent=2));print('INTERCEPTION_CRAFT_COMPLETE',json.dumps(report),flush=True)
