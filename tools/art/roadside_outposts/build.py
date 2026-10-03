"""Original braced roadside watch towers; Blender background, metre scale.

Two complete assemblies share a supported fabrication vocabulary. The runtime
adds only dune-seated pads/pile extensions at these exact four leg coordinates.
No external art inputs or texture downloads. No live Blender scene access.
"""
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/roadside-outposts';OUT.mkdir(parents=True,exist_ok=True)
ART=ROOT/'godot/art'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.unit_settings.system='METRIC'
root=None;collisions=[];objects=[];models={}

def xyz(p):return (p[0],-p[2],p[1])
def material(name,color,metal,rough):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
def linear(hexcolor):
    vals=[int(hexcolor[i:i+2],16)/255 for i in (0,2,4)]
    return [v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vals]
steel=material('Watch tower exposed steel',linear('434c4c'),.72,.59)
petrol=material('Faded petrol enamel',linear('516a6b'),.40,.69)
umber=material('Weathered umber enamel',linear('786957'),.40,.69)
rust=material('Localized oxidized joins',linear('785543'),.40,.83)
ivory=material('Worn ivory markings',linear('b1ab91'),.15,.77)
dark=material('Recessed service graphite',linear('323937'),.30,.72)

def finish(o,name,mat,bevel=.012):
    o.name=name;o.parent=root;o.data.materials.append(mat);objects.append(o)
    if bevel:
        b=o.modifiers.new('Manufactured eased edges','BEVEL');b.width=bevel;b.segments=2
        b.affect='EDGES'
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name)
    for p in o.data.polygons:p.use_smooth=False
    return o

def box(name,at,size,mat,solid=True,bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at));o=bpy.context.object
    o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat,min(bevel,min(size)*.15))
    if solid:collisions.append({'at':list(at),'size':list(size)})
    return o

def beam(name,a,b,width,mat,solid=True):
    av,bv=Vector(xyz(a)),Vector(xyz(b));d=bv-av
    bpy.ops.mesh.primitive_cube_add(size=1,location=(av+bv)/2);o=bpy.context.object
    o.scale=(width,width,d.length);o.rotation_mode='QUATERNION';o.rotation_quaternion=Vector((0,0,1)).rotation_difference(d.normalized())
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,name,mat,min(width*.08,.012))
    if solid:collisions.append({'a':list(a),'b':list(b),'width':width})
    return o

def bolt(at):
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.041,depth=.035,location=xyz(at))
    finish(bpy.context.object,'Retained hex foundation fastener',steel,.004)

for variant,id in enumerate(['RoadsideRelayWatch','RoadsideTwinWatch']):
    root=bpy.data.objects.new(id,None);bpy.context.collection.objects.link(root)
    root['units']='metres';root['guard_deck_y']=18.15
    collisions=[];objects=[];paint=petrol if variant==0 else umber
    half=1.7 if variant==0 else 2.3
    feet=[[-half,.0,-1.3],[half,.0,-1.3],[-half,.0,1.3],[half,.0,1.3]]
    for x,_,z in feet:
        beam('Continuous load-bearing corner leg',(x,.30,z),(x,18.0,z),.28,steel)
        for y in [.5,6.0,12.0,17.9]:
            box('Bolted column splice',(x,y,z),(.35,.32,.35),paint,False)
            box('Splice seam oxidation',(x,y-.151,z),(.355,.014,.355),rust,False,.001)
    for low,high in [(.6,6.0),(6.0,11.8),(11.8,17.9)]:
        for z in [-1.3,1.3]:
            beam('Transverse tie',( -half,low,z),(half,low,z),.20,steel)
            beam('Cross brace',( -half,low,z),(half,high,z),.12,paint)
            beam('Cross brace',(half,low,z),(-half,high,z),.12,paint)
        for x in [-half,half]:
            beam('Longitudinal tie',(x,low,-1.3),(x,low,1.3),.20,steel)
            beam('Side diagonal',(x,low,-1.3),(x,high,1.3),.13,paint)
    box('Deep folded observation deck',(0,17.96,0),(half*2+.8,.38,3.6),paint)
    box('Quiet nonslip walking skin',(0,18.142,0),(half*2+.66,.016,3.46),dark,False,.001)
    # Open firing face: waist rail is below every actual rifle muzzle. The
    # rear service shield is a physical wall, never an invisible wide box.
    for x in [-half-.25,half+.25]:
        for z in [-1.55,1.55]:beam('Guardrail stanchion',(x,18.15,z),(x,19.2,z),.065,steel)
        for y in [18.55,19.18]:beam('Side safety rail',(x,y,-1.55),(x,y,1.55),.065,steel)
    for y in [18.58,19.18]:beam('Open sightline front rail',(-half-.25,y,-1.55),(half+.25,y,-1.55),.065,steel)
    box('Back service shield',(0,18.75,1.53),(half*2+.5,1.2,.08),paint)
    for x in [-half*.7,half*.7]:
        box('Shield mounting return',(x,18.55,1.45),(.15,.9,.15),steel)
        box('Localized shield seam rust',(x,18.20,1.479),(.17,.06,.004),rust,False,.001)
    # Roof remains deliberately offset over the rear electronics; guards stand
    # clear of it, so the silhouette reads as an occupied observation platform.
    for x in [-half+.25,half-.25]:beam('Weather hood upright',(x,18.15,1.32),(x,20.62,1.32),.10,steel)
    box('Folded service weather hood',(0,20.64,1.15),(half*2,.10,1.3),paint)
    box('Supported receiver cabinet',(0,18.70,1.17),(1.0,1.1,.55),paint)
    box('Cabinet service recess',(0,18.71,.882),(.8,.86,.025),dark,False)
    for y in [18.52,18.63,18.74,18.85]:box('Recessed cooling fin',(0,y,.862),(.65,.037,.020),steel,False,.004)
    for x in [-.35,.35]:box('Cabinet latch',(x,19.06,.849),(.055,.15,.06),ivory,False)
    beam('Connected aerial mast',(half-.25,20.65,1.32),(half-.25,22.05,1.32),.055,steel)
    for y in [21.15,21.45,21.75]:beam('Passive antenna element',(half-.7,y,1.32),(half+.2,y,1.32),.025,steel,False)
    # Ladder and landing are connected to real framing, behind the firing deck.
    for x in [-.40,.40]:beam('Service ladder stringer',(x,.45,1.67),(x,18.2,1.67),.052,steel)
    for i in range(55):beam('Ladder rung',(-.40,.7+i*.32,1.67),(.40,.7+i*.32,1.67),.043,steel,False)
    for y in [3,8,13,17.7]:
        for x in [-.4,.4]:beam('Ladder tie bracket',(x,y,1.3),(x,y,1.67),.048,steel,False)
    for x in [-half-.29,half+.29]:
        for z in [-1.58,1.58]:bolt((x,18.164,z))
    # Small seated strips, not coplanar decals or large noisy texture fields.
    for x in [-half-.22,half+.22]:
        box('Faded ID band',(x,17.966,-1.807),(.14,.24,.018),ivory,False,.003)
    bpy.context.view_layer.update()
    triangles=sum(len(o.data.polygons) if all(len(p.vertices)==3 for p in o.data.polygons) else sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
    models[id]={'collision':collisions,'feet':feet,'deck_y':18.15,'guards':variant+1,'triangles_before_export':triangles,'source_meshes':len(objects)}
    # Batch by material to keep tower cost bounded while retaining named source
    # objects in the editable master. Runtime batches are made only after save.

bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'RoadsideWatchTowers.blend'))
for root in [o for o in bpy.data.objects if o.type=='EMPTY' and o.name in models]:
    for mat in [steel,petrol,umber,rust,ivory,dark]:
        selected=[o for o in root.children if o.type=='MESH' and o.data.materials[0]==mat]
        if not selected:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in selected:o.select_set(True)
        bpy.context.view_layer.objects.active=selected[0];bpy.ops.object.join()
        bpy.context.object.name=root.name+'_'+mat.name
bpy.ops.export_scene.gltf(filepath=str(ART/'roadside-outposts.glb'),export_format='GLB',export_yup=True,
    export_texcoords=False,export_normals=True,export_tangents=False,export_materials='EXPORT',export_animations=False)
payload={'schema':1,'models':models,'deck_absolute_y':18.15,'footing':'Runtime dune-sampled pads and pile extensions; no root height approximation',
    'source':'assets/roadside-outposts/RoadsideWatchTowers.blend','sha256':hashlib.sha256((ART/'roadside-outposts.glb').read_bytes()).hexdigest()}
(ART/'roadside-outposts.json').write_text(json.dumps(payload,indent=2)+'\n')
(OUT/'manifest.json').write_text(json.dumps(payload,indent=2)+'\n')
print('ROADSIDE_TOWERS_COMPLETE', {k:v['triangles_before_export'] for k,v in models.items()})
