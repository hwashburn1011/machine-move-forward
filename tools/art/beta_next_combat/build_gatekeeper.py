"""Authored G-01 service hardware on the retained native gunboat, in metres.

Background Blender only. Keeps component sources and a complete fitted reference;
exports only the compact additive hardware, with named mechanical hinge roots.
"""
import bpy,bmesh,ast,math,json,sys
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[3];O=R/'assets/beta-next/gatekeeper';O.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.preferences.filepaths.save_version=0
tree=ast.parse((R/'tools/art/art100_story_robots/build.py').read_text())
for fn in tree.body:
 if isinstance(fn,ast.FunctionDef) and fn.name in {'xyz','finish','box','tube','cable','ring','empty'}:exec(compile(ast.Module(body=[fn],type_ignores=[]),'<retained authored primitive>','exec'))
names=['A200 oxblood enamel','A200 weathered load steel','A200 aged brushed alloy','A200 petrol ceramic stencil','A200 vulcanized rubber','A200 smoked instrument glazing']
with bpy.data.libraries.load(str(R/'assets/art200/story/Story200-editable.blend'),link=False) as (src,dst):dst.materials=[n for n in names if n in src.materials]
mats={m.name:m for m in dst.materials};paint,steel,metal,letter,rubber,glass=[mats[n] for n in names]

def label(value,at,size,normal,parent):
 bpy.ops.object.text_add(location=xyz(at));o=bpy.context.object;o.name='Stamped '+value;o.parent=parent;o.data.body=value;o.data.size=size;o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.resolution_u=2;o.data.extrude=.0005
 n=xyz(normal);up=Vector((0,0,1));right=up.cross(n);o.rotation_euler=Matrix((right,up,n)).transposed().to_euler();o.data.materials.append(letter);bpy.ops.object.convert(target='MESH');return o

def bolt(at,axis,parent,r=.012):
 p=Vector(at);a=Vector(axis);tube('Captured washer',p,p+a*.004,r*1.5,metal,parent,16);tube('Hex cap',p+a*.004,p+a*.012,r,steel,parent,6)

hull=empty('GatekeeperHullDetails');gun=empty('GatekeeperGunDetails');roots=[hull,gun]
for side in [-1,1]:
 box('Bolted G01 identity backing',(side*1.179,2.60,0),(.028,.34,.94),steel,hull,.012)
 box('Inset cordon identity enamel',(side*1.199,2.60,0),(.014,.286,.88),paint,hull,.007)
 label('G - 01',(side*1.207,2.63,0),.17,(side,0,0),hull)
 label('CORDON / FIRE CONTROL',(side*1.208,2.50,0),.035,(side,0,0),hull)
 for y in [2.465,2.735]:
  for z in [-.42,.42]:bolt((side*1.205,y,z),(side,0,0),hull,.009)
# A low relay enclosure physically seats on the existing citadel roof, behind
# the gun's sweep. It reads as civilian-bearing control hardware, not a new gun.
box('Roof relay mounting sole',(0,3.03,.62),(.92,.06,.58),rubber,hull,.012)
box('Weather sealed bearing relay',(0,3.165,.62),(.86,.22,.52),paint,hull,.027)
box('Raised relay service lid',(0,3.29,.62),(.90,.04,.55),steel,hull,.018)
for x in [-.35,.35]:
 for z in [.43,.81]:bolt((x,3.311,z),(0,1,0),hull)
for x in [-.35,.35]:
 tube('Aerial dielectric foot',(x,3.3,.69),(x,3.39,.69),.065,rubber,hull,24)
 tube('Captured aerial ferrule',(x,3.36,.69),(x,3.46,.69),.037,metal,hull,24)
 tube('Short bearing antenna',(x,3.44,.69),(x,3.85,.69),.009,steel,hull,16)
for x in [-.25,-.15,-.05,.05,.15,.25]:box('Separate relay cooling rib',(x,3.17,.898),(.044,.12,.026),metal,hull,.003)
cable('Terminated roof signal loom',[(.38,3.13,.5),(.49,3.1,.43),(.51,3.03,.31),(.44,3.015,.20)],.021,rubber,hull)

# Gun-local frame: the retained fire-control optic is at (0,.30,-.023) relative
# to GunboatRecoil. These shutters cover that optic and open from physical hinges.
for x in [-.145,.145]:box('Shutter frame upright',(x,.30,-.055),(.025,.24,.08),steel,gun,.006)
for y in [.184,.416]:box('Shutter cross member',(0,y,-.055),(.31,.026,.08),steel,gun,.006)
for x in [-.142,.142]:
 tube('Supported hinge pin',(x,.187,-.104),(x,.417,-.104),.012,metal,gun,20)
 side='Port' if x<0 else 'Starboard';hinge=empty('FireControlShutter'+side,(x,.30,-.104),gun)
 offset=.069 if x<0 else -.069
 box('Armored optic shutter',(offset,0,0),(.137,.202,.028),paint,hinge,.01)
 box('Shutter edge rail',(offset,0,-.017),(.09,.009,.012),metal,hinge,.002)
 for y in [-.075,.075]:bolt((offset,y,-.016),(0,0,-1),hinge,.006)
 label('1' if x<0 else '0',(offset,.043,-.033),.045,(0,0,-1),hinge)
# A backed pressure instrument sits above the original ammunition cassette.
box('Gauge bracket sole',(.39,.117,.02),(.20,.024,.19),steel,gun,.006)
box('Gauge cast mounting neck',(.39,.188,.02),(.077,.12,.064),metal,gun,.008)
tube('Fire control pressure housing',(.39,.276,.045),(.39,.276,-.16),.086,steel,gun,40)
tube('Pressure bezel',(.39,.276,-.16),(.39,.276,-.177),.090,metal,gun,40)
tube('Recessed ivory gauge face',(.39,.276,-.178),(.39,.276,-.182),.077,letter,gun,40)
for i in range(7):
 a=-2.35+i*4.7/6
 box('Pressure gauge index',(.39+math.sin(a)*.059,.276+math.cos(a)*.059,-.185),(.005,.009,.002),steel,gun,.0005)
needle=empty('PressureNeedle',(.39,.276,-.188),gun)
box('Balanced pressure needle',(0,.024,0),(.006,.064,.003),paint,needle,.001)
tube('Captive pointer spindle',(0,0,.002),(0,0,-.005),.011,metal,needle,20)

bpy.context.view_layer.update()
part_report=[]
for root in roots:
 parts=[o for o in root.children_recursive if o.type=='MESH']
 for obj in parts:
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
  tri=obj.modifiers.new('Portable triangle normals','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
  # Bake local object transforms before joining. Hinges keep their own origins.
  bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-10],context='FACES_ONLY');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(obj.data);bm.free()
  uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
  for p in obj.data.polygons:
   axis=max(range(3),key=lambda i:abs(p.normal[i]));a,b=[i for i in range(3) if i!=axis]
   for l in p.loop_indices:
    v=obj.data.vertices[obj.data.loops[l].vertex_index].co;uv.data[l].uv=(v[a]*2.1,v[b]*2.1)
  obj.data.calc_loop_triangles()
 part_report.append({'root':root.name,'editable_parts':len(parts),'triangles':sum(len(o.data.loop_triangles) for o in parts)})
bpy.ops.wm.save_as_mainfile(filepath=str(O/'GatekeeperServiceKit-editable.blend'),compress=True)
for root in roots:
 for parent in [root,*[o for o in root.children_recursive if o.type=='EMPTY']]:
  for mat in mats.values():
   parts=[o for o in parent.children if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
   if not parts:continue
   bpy.ops.object.select_all(action='DESELECT')
   for obj in parts:obj.select_set(True)
   bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bpy.context.object.name=parent.name+' '+mat.name
bpy.ops.object.select_all(action='DESELECT')
for root in roots:
 for obj in [root,*root.children_recursive]:obj.select_set(True)
out=R/'godot/art/gatekeeper-service-kit.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True,export_cameras=False,export_lights=False)
sys.path.insert(0,str(R/'tools/art/native_enemies'));from repair_tangents import repair
fixed=repair(out)
(O/'manifest.json').write_text(json.dumps({'source':'Original G-01 hardware; retained gunboat supplied only as complete visual reference','units':'metres','counting':'One signature encounter refinement, not a new enemy AI or full replacement hull','roots':part_report,'hinges':['FireControlShutterPort','FireControlShutterStarboard'],'material_surfaces':sum(len(o.data.materials) for o in bpy.context.scene.objects if o.type=='MESH'),'bytes':out.stat().st_size,'tangent_repairs':fixed,'runtime_targets':{'GatekeeperHullDetails':'RaiderGunboat','GatekeeperGunDetails':'GunboatRecoil'},'collision':'Existing gunboat hull and physical subsystem targets retained; kit adds no invisible colliders'},indent=2)+'\n')

# Artist-review source includes the whole original carrier and editable kit.
bpy.ops.wm.open_mainfile(filepath=str(O/'GatekeeperServiceKit-editable.blend'))
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(R/'godot/art/interception-craft.glb'))
carrier=bpy.data.objects['RaiderGunboat'];keep={carrier,*carrier.children_recursive}
for obj in list(set(bpy.data.objects)-before):
 if obj not in keep:bpy.data.objects.remove(obj,do_unlink=True)
hull=bpy.data.objects['GatekeeperHullDetails'];hull.parent=carrier;hull.matrix_basis=Matrix.Identity(4)
gun=bpy.data.objects['GatekeeperGunDetails'];gun.parent=bpy.data.objects['GunboatRecoil'];gun.matrix_basis=Matrix.Identity(4)
bpy.ops.wm.save_as_mainfile(filepath=str(O/'GatekeeperCompleteReview.blend'),compress=True)
print('GATEKEEPER_KIT_BUILT',part_report,flush=True)
