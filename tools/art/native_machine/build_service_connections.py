"""Three shallow Nomad service sockets; run in a separate Blender process.

Reuses the finished Art200 machine PBR palette and the existing manufactured
box/fastener authoring recipe. No existing source scene or GLB is edited.
"""
import ast
import bpy
import bmesh
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-service-connections';OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'godot/art'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.unit_settings.system='METRIC'
recipe=ast.parse((ROOT/'tools/art/glass_orchard/common.py').read_text())
for name in ['xyz','empty','finish','box','tube']:
    function=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name==name)
    code=ast.unparse(function)
    if name=='finish':code=code.replace('m.segments = 3','m.segments = 2')
    exec(compile(code,'<existing Nomad manufactured hardware>','exec'))
names=['N200_steel','N200_machined_alloy','N200_rubber','N200_age_ivory','N200_petrol','N200_olive','N200_ochre']
source=ROOT/'assets/art200/machine/NomadLivingArchive.blend'
with bpy.data.libraries.load(str(source),link=False) as (available,target):
    assert all(n in available.materials for n in names)
    target.materials=list(names)
steel,alloy,rubber,ivory,petrol,olive,ochre=target.materials
font=bpy.data.fonts.load('C:/Windows/Fonts/consolab.ttf')
roots=[];details={}

def tube(name,a,b,r,mat,parent,segments=16):
    a,b=xyz(a),xyz(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=min(segments,16 if r<.08 else 32),radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    o.name=name;o.parent=parent;o.data.materials.append(mat)
    bevel=o.modifiers.new('Shallow machined rim','BEVEL');bevel.width=min(.00045,d.length*.18);bevel.segments=1
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for face in o.data.polygons:face.use_smooth=len(face.vertices)==4
    return o

def bolt(p,x,z):
    tube('Captive screw counterbore',(x,.0135,z),(x,.0145,z),.026,rubber,p,20)
    tube('Flush stainless screw',(x,.0144,z),(x,.017,z),.020,alloy,p,12)
    box('Screw drive slot',(x,.01715,z),(.027,.0003,.0045),rubber,p,.0001)

def lid(p,name,x,z,r,coat):
    tube(name+' gasket',(x,.013,z),(x,.0147,z),r,rubber,p,48)
    tube(name+' rolled cover',(x,.0145,z),(x,.017,z),r-.006,coat,p,48)
    box(name+' recessed lift socket',(x,.01705,z),(r*.55,.0003,.010),rubber,p,.0001)

def text(p,body,at,size):
    bpy.ops.object.text_add(location=xyz(at));o=bpy.context.object;o.name=body;o.parent=p
    o.data.body=body;o.data.font=font;o.data.align_x='CENTER';o.data.size=size;o.data.extrude=0;o.data.resolution_u=3
    o.data.materials.append(ivory);bpy.ops.object.convert(target='MESH')
    return bpy.context.object

for id,label,coat in [('quiet-drive','D1 / DRIVE',olive),('battery-bank','D2 / POWER',petrol),('salvage-crane','D3 / CRANE',ochre)]:
    p=empty(id);roots.append(p);p['purpose']='flush machine service connection; no added collision'
    box('Deck isolation gasket',(0,.004,0),(1.636,.008,1.636),rubber,p,.003)
    box('Bevelled service plate',(0,.008,0),(1.64,.012,1.64),steel,p,.004)
    # A split removable panel with two fine seams and shallow fastening sockets.
    for x in [-.54,.54]:
        box('Inset panel seam',(x,.01415,0),(.003,.0003,1.12),rubber,p,.0001)
    for x in [-.735,.735]:
        for z in [-.735,0,.735]:bolt(p,x,z)
    for z in [-.735,.735]:bolt(p,0,z)
    box('Muted service identity strip',(0,.0145,.648),(1.12,.001,.19),coat,p,.0003)
    text(p,label,(0,.0152,.694),.115)
    text(p,'NOMAD  /  SERVICE',(0,.0147,-.698),.052)
    if id=='quiet-drive':
        lid(p,'Keyed drive coupler',0,0,.285,alloy)
        for a in [i*math.tau/6 for i in range(6)]:bolt(p,.342*math.cos(a),.342*math.sin(a))
        for x in [-.465,.465]:lid(p,'Capped lubricant union',x,-.25,.056,coat)
        box('Drive key index',(0,.0175,-.245),(.025,.0005,.07),rubber,p,.0001)
    elif id=='battery-bank':
        for x in [-.26,.26]:
            box('Sealed bus socket recess',(x,.0148,0),(.39,.001,.53),rubber,p,.0003)
            box('Captive bus dust cover',(x,.016,0),(.365,.002,.50),coat,p,.0005)
            for z in [-.185,.185]:bolt(p,x,z)
            box('Bus cover lift slot',(x,.0174,0),(.095,.0004,.012),rubber,p,.0001)
        text(p,'+',(-.26,.0176,-.07),.08);text(p,'-',(.26,.0176,-.07),.08)
    else:
        lid(p,'Central slewing service cover',0,0,.31,alloy)
        for i in range(8):
            a=i*math.tau/8;x=.48*math.cos(a);z=.48*math.sin(a)
            lid(p,'Covered crane anchor',x,z,.054,coat)
            box('Anchor socket',(x,.0175,z),(.019,.0005,.012),rubber,p,.0001)
    for o in p.children_recursive:
        if o.type!='MESH':continue
        bpy.context.view_layer.objects.active=o;bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
        if not o.data.uv_layers:
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.01);bpy.ops.object.mode_set(mode='OBJECT')
        mod=o.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
        bm=bmesh.new();bm.from_mesh(o.data)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-12],context='FACES_ONLY')
        bm.to_mesh(o.data);bm.free();o.data.update()
    details[id]={'parts':sum(o.type=='MESH' for o in p.children_recursive),'maxHeightM':.018,'footprintM':[1.64,1.64],'collision':False}
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NomadServiceConnections.blend'),compress=True)
for p in roots:
    for mat in [steel,alloy,rubber,ivory,petrol,olive,ochre]:
        meshes=[o for o in p.children if o.type=='MESH' and o.data.materials[0]==mat]
        if not meshes:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0]
        if len(meshes)>1:bpy.ops.object.join()
        bpy.context.object.name=p.name+'_'+mat.name
    tris=0;degenerate=0
    for o in p.children_recursive:
        if o.type!='MESH':continue
        o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
        for t in o.data.loop_triangles:
            a,b,c=[o.data.vertices[i].co for i in t.vertices]
            if (b-a).cross(c-a).length<1e-12:degenerate+=1
    assert degenerate==0,(p.name,degenerate)
    details[p.name].update(triangles=tris,degenerateTriangles=0,materialBatches=sum(o.type=='MESH' for o in p.children))
    assert tris<10000,(p.name,tris)
bpy.ops.object.select_all(action='SELECT')
path=ART/'nomad-service-connections.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_animations=False,export_tangents=True)
manifest={'models':details,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'materialSource':'assets/art200/machine/NomadLivingArchive.blend','materialSourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source':'tools/art/native_machine/build_service_connections.py','coordinateSpace':'metres, +Y up, floor at zero','collision':'none; artwork within 18 mm of existing floor'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(ART/'nomad-service-connections.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('SERVICE_CONNECTIONS_EXPORTED',json.dumps(details),flush=True)
