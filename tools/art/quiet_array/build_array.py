"""Original Quiet Array relay archive and course actuator, in game metres.

Reuse Iron Nomad's original PBR masters so the ruin and the player's machine
belong to the same industrial world. Authoring uses game XYZ (Y up); glTF
export converts Blender Z up back to the game's convention.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/quiet-array'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'exports').mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0

def xyz(p): return Vector((p[0], -p[2], p[1]))

def pbr(name, prefix, tint=(1,1,1), emission=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*tint,1)
    bs.inputs['Metallic'].default_value = .65
    bs.inputs['Roughness'].default_value = .58
    if prefix:
        for suffix in ['BaseColor','Normal','ORM']:
            image = bpy.data.images.load(str(ROOT / f'assets/iron-nomad/textures/{prefix}_{suffix}.png'), check_existing=True)
            if max(image.size) > 1024: image.scale(1024,1024)
            image.pack()
            node = m.node_tree.nodes.new('ShaderNodeTexImage'); node.image = image
            if suffix == 'BaseColor': m.node_tree.links.new(node.outputs['Color'],bs.inputs['Base Color'])
            elif suffix == 'Normal':
                image.colorspace_settings.name = 'Non-Color'
                normal = m.node_tree.nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value = .55
                m.node_tree.links.new(node.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
            else:
                image.colorspace_settings.name='Non-Color'
                sep=m.node_tree.nodes.new('ShaderNodeSeparateColor');m.node_tree.links.new(node.outputs['Color'],sep.inputs['Color'])
                m.node_tree.links.new(sep.outputs['Green'],bs.inputs['Roughness']);m.node_tree.links.new(sep.outputs['Blue'],bs.inputs['Metallic'])
    if emission:
        bs.inputs['Emission Color'].default_value=(*tint,1);bs.inputs['Emission Strength'].default_value=emission
    return m

ivory=pbr('Array_IvoryPaint','WarmIvory_PaintedSteel')
steel=pbr('Array_CharcoalSteel','Charcoal_Steel')
bare=pbr('Array_MachinedMetal','Aged_BareMetal')
brass=pbr('Array_HandrailBrass','Worn_HandrailBrass')
red=pbr('Array_OxidePaint','OxideRed_PaintedSteel')
cyan=pbr('Array_ArchiveCyan',None,(.012,.48,.62),2.3)
amber=pbr('Array_ServiceAmber',None,(.9,.29,.035),2.4)
dark=pbr('Array_Recess',None,(.014,.022,.026))
letter=pbr('Array_Lettering',None,(.72,.72,.61))
root=bpy.data.objects.new('QuietArray',None);bpy.context.collection.objects.link(root)

def empty(name,at=(0,0,0),parent=root):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=xyz(at);o.parent=parent;return o

def finish(o,name,mat,parent=root,bevel=0):
    o.name=name;o.data.materials.append(mat);o.parent=parent
    if bevel:
        m=o.modifiers.new('Rounded worn edges','BEVEL');m.width=bevel;m.segments=3
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
    for p in o.data.polygons:p.use_smooth=True
    if o.type=='MESH':
        m=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL');m.keep_sharp=True
        try:bpy.ops.object.modifier_apply(modifier=m.name)
        except RuntimeError:pass
    return o

def box(name,at,size,mat,parent=root,bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at));o=bpy.context.object
    o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,parent,bevel)

def tube(name,a,b,r,mat,parent=root,segments=24):
    a,b=xyz(a),xyz(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=r,depth=d.length,location=(a+b)*.5)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return finish(o,name,mat,parent,.012 if r>.04 else 0)

def label(name,text,at,size=.3,mat=letter,parent=root):
    bpy.ops.object.text_add(location=xyz(at));o=bpy.context.object;o.name=name
    o.data.body=text;o.data.size=size;o.data.extrude=.0015;o.data.align_x='CENTER'
    # Text stands vertically facing the approach (-game Z).
    o.rotation_euler=(math.pi/2,0,math.pi)
    o.data.materials.append(mat);o.parent=parent
    bpy.ops.object.convert(target='MESH');return bpy.context.object

def cable(name,points,r=.035,mat=dark,parent=root):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=10;c.bevel_depth=r;c.bevel_resolution=3
    s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for v,p in zip(s.bezier_points,points):v.co=xyz(p);v.handle_left_type=v.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(mat);o.parent=parent
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
    return bpy.context.view_layer.objects.active

# Raised maintenance platform sits at the same deck height as the Nomad.
box('Armored platform',(0,-.24,0),(18,.48,20),steel,bevel=.10)
for x in range(-8,9,2):
    for z in range(-9,10,2):
        box('Bolted deck plate',(x,.007,z),(1.97,.035,1.97),bare,bevel=.012)
for x in [-8.2,0,8.2]:
    for z in [-8,0,8]:
        tube('Deep foundation pile',(x,-14.7,z),(x,-.45,z),.30,steel)
        for y in [-11,-7,-3]:
            tube('Pile collar',(x,y-.1,z),(x,y+.1,z),.38,red)
for z in [-8,0,8]:
    for x in [-8,0]:
        tube('Foundation crossbrace',(x,-6,z),(x+8,-.5,z),.10,bare)
        tube('Foundation crossbrace',(x,-.5,z),(x+8,-6,z),.10,bare)
for side in [-1,1]:
    x=side*8.88
    for z in range(-10,11,2):
        if side<0 and abs(z)<2:continue
        tube('Guardrail stanchion',(x,.05,z),(x,1.13,z),.055,brass)
    ranges=[(-9.8,-1.3),(1.3,9.8)] if side<0 else [(-9.8,9.8)]
    for a,b in ranges:
        for y in [.52,1.12]:tube('Guardrail',(x,y,a),(x,y,b),.045,brass)
for z in [-9.88,9.88]:
    for x in range(-8,9,2):tube('End rail post',(x,.05,z),(x,1.12,z),.055,brass)
    for y in [.52,1.12]:tube('End guardrail',(-8.88,y,z),(8.88,y,z),.045,brass)
gangway=empty('Gangway')
box('Gangway tread',(-9.5,-.07,0),(1,.14,2),bare,gangway,.02)
for z in [-.93,.93]:
    tube('Gangway rail',(-10,1,z),(-9,1,z),.04,brass,gangway)
    for x in [-10,-9]:tube('Gangway post',(x,0,z),(x,1,z),.05,brass,gangway)

# Central archive: ribbed, sheltered memory bank with a warm/cold light contrast.
box('Memory vault plinth',(3,.25,3),(4,.5,4),steel,root,.08)
box('Memory vault shell',(3,1.9,3),(3.85,3.3,3.85),ivory,bevel=.14)
box('Archive canopy',(3,3.75,3),(5,.16,5),steel,bevel=.04)
for x in [1.05,4.95]:
    for z in [1.05,4.95]:tube('Vault corner reinforcement',(x,.3,z),(x,3.5,z),.11,bare)
for z in [1.03,4.97]:
    for x in [1.6,2.3,3,3.7,4.4]:
        box('Archive cooling recess',(x,2.05,z),(.38,2.4,.065),dark)
        for y in [.9,1.5,2.1,2.7]:box('Archive data light',(x,y,z+(-.05 if z<3 else .05)),(.20,.035,.02),cyan,bevel=.004)
label('Archive identity','ANNIKA // MEMORY VAULT',(3,3.34,1.0),.19)

# Main receiving dish: smoothly curved paraboloid with separate structural ribs.
dish=empty('ReceivingDish')
centre=Vector((4,5.0,-5));axis=Vector((0,.58,-.82)).normalized()
u=Vector((1,0,0));v=axis.cross(u).normalized()
verts=[];faces=[];segments=64;rings=12;radius=3.9
for j in range(rings+1):
    r=radius*j/rings
    for i in range(segments):
        a=2*math.pi*i/segments;p=centre+u*(r*math.cos(a))+v*(r*math.sin(a))+axis*(r*r/15)
        verts.append(xyz(p))
for j in range(rings):
    for i in range(segments):
        a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
mesh=bpy.data.meshes.new('Parabolic reflector');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('Segmented reflector',mesh);bpy.context.collection.objects.link(o);finish(o,o.name,ivory,dish)
solid=o.modifiers.new('Reflector sheet thickness','SOLIDIFY');solid.thickness=.06;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name)
for i in range(12):
    a=2*math.pi*i/12;pts=[]
    for j in range(5):
        r=.2+(radius-.2)*j/4;pts.append(centre+u*(r*math.cos(a))+v*(r*math.sin(a))+axis*(r*r/15+.05))
    cable('Reflector radial seam',pts,.025,steel,dish)
rim=[centre+u*(radius*math.cos(a))+v*(radius*math.sin(a))+axis*(radius*radius/15) for a in [2*math.pi*i/48 for i in range(49)]]
cable('Reflector rim',rim,.065,bare,dish)
feed=centre+axis*2.4
for i in range(3):
    a=math.pi*2*i/3;r=3.6;p=centre+u*r*math.cos(a)+v*r*math.sin(a)+axis*r*r/15
    tube('Feed support boom',p,feed,.065,bare,dish)
tube('Feed horn',feed,feed+axis*.5,.22,red,dish,32)
box('Dish motor base',(4,.6,-5),(2.6,1.2,2.6),steel,bevel=.09)
tube('Dish pedestal',(4,1,-5),(4,4.5,-5),.48,ivory,segments=48)
for x in [3.55,4.45]:tube('Dish lift strut',(x,1.2,-5),(x,4,-4.4),.12,bare)

# Lattice mast and listening electronics, separated from the walkable route.
for x in [-6.8,-5.2]:
    for z in [-8.8,-7.2]:tube('Array mast leg',(x,0,z),(x,15,z),.105,steel)
for y in range(0,15,2):
    for z in [-8.8,-7.2]:
        tube('Mast diagonal',(-6.8,y,z),(-5.2,y+2,z),.052,brass)
        tube('Mast diagonal',(-5.2,y,z),(-6.8,y+2,z),.052,brass)
    for x in [-6.8,-5.2]:tube('Mast crossbracing',(x,y,-8.8),(x,y+2,-7.2),.052,bare)
for y in [8,11,14]:
    box('Antenna receiver',(-6,y,-8),(2.8,.25,.3),ivory)
    for x in [-7.2,-6.6,-6,-5.4,-4.8]:tube('Dipole elements',(x,y,-8.6),(x,y,-7.4),.035,bare)
tube('Mast beacon',(-6,15,-8),(-6,15.5,-8),.14,amber)

# Workbench, consoles, fuse couplers, cooling pipes and accessible story anchors.
box('Service workbench',(-3,.53,-6),(2.8,1.06,1.2),steel,bevel=.05)
box('Bench surface',(-3,1.1,-6),(3,.09,1.35),bare)
for x in [-4.25,-3.8,-3.35]:box('Tool case',(x,1.27,-6.2),(.32,.22,.5),red)
for name,at in [('JournalPort',(-5,1.2,-3)),('JournalStarboard',(6,1.2,0)),('JournalArchive',(0,1.3,3))]:
    node=empty(name,at)
    box('Terminal pedestal',(at[0],.50,at[2]),(.65,1,.55),steel)
    box('Service console',(at[0],at[1]-.06,at[2]),(.75,.32,.55),ivory)
    box('Live terminal screen',(at[0],at[1]+.11,at[2]-.13),(.53,.018,.31),cyan,bevel=.006)
    for x in [-.22,-.1,.02,.14]:box('Console keys',(at[0]+x,at[1]+.112,at[2]+.12),(.07,.018,.07),amber,bevel=.005)
    label('Terminal label','ANNIKA', (at[0],at[1]-.09,at[2]-.287),.09)
for x in [7,7.45]:
    tube('Service riser',(x,.22,-8),(x,.22,8),.12,ivory)
    for z in [-7,-3,1,5]:tube('Riser coupling',(x,.22,z-.12),(x,.22,z+.12),.16,bare)
for z in [-3,0,3]:
    cable('Exposed conduit',[(-8,.08,z),(-7,.08,z+.4),(-6.5,.08,z+.4),(-6,.08,z+1.2)],.035,dark)

archive=empty('AnnikaArchive',(-3,1.2,-6))
# Child geometry stays local to its anchor so collecting hides the exact item.
box('Archive memory cartridge',(0,.13,0),(.44,.25,.31),red,archive,.025)
for x in [-.12,0,.12]:box('Archive contacts',(x,.27,0),(.045,.045,.21),cyan,archive,.004)
actuator=empty('CourseActuator',(3,1,6))
box('Actuator cradle',(3,.42,6),(1.4,.84,1.2),steel,bevel=.04)
tube('Actuator body',(-.43,0,0),(.43,0,0),.25,bare,actuator,48)
for x in [-.40,-.22,.22,.40]:tube('Actuator locking flange',(x-.025,0,0),(x+.025,0,0),.29,ivory,actuator,48)
tube('Servo spindle',(.4,0,0),(.70,0,0),.09,brass,actuator)
box('Actuator controller',(0,.26,0),(.44,.18,.3),red,actuator,.025)
box('Actuator status lens',(0,.365,0),(.3,.025,.12),cyan,actuator,.007)
label('Array nameplate','QUIET ARRAY',(-2,2.2,-8.8),.55)
label('Array purpose','WE KEEP THE LINE OPEN',(-2,1.65,-8.8),.2)
box('Nameplate back',(-2,2.04,-8.69),(5.6,1.15,.12),steel)

# A few purposeful emissive lamps; no exported punctual lights per mesh.
for x,z in [(-8,-8),(-8,8),(8,-8),(8,8),(-7,0)]:
    tube('Lamp standard',(x,0,z),(x,3,z),.075,steel)
    box('Lamp housing',(x,3,z),(.4,.30,.30),dark)
    box('Lamp diffuser',(x,2.82,z),(.31,.05,.21),amber,bevel=.009)

# UV and join only fixed geometry, preserving named pickup/interaction groups.
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':continue
    if not obj.data.uv_layers:
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
for parent in [root,dish,gangway,archive,actuator]:
    for mat in list(bpy.data.materials):
        meshes=[o for o in list(parent.children) if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
        if len(meshes)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();bpy.context.object.name=f'{parent.name}_{mat.name}'

for child in gangway.children:
    child.location -= xyz((-9.5,-.08,0))
gangway.location = xyz((-9.5,-.08,0))
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH': continue
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Export triangles','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'QuietArray.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'exports/quiet-array.glb'),export_format='GLB',export_animations=False,export_tangents=True)
bpy.ops.export_scene.fbx(filepath=str(OUT/'exports/QuietArray.fbx'),use_selection=True,global_scale=1,apply_unit_scale=True,object_types={'MESH','EMPTY'},bake_anim=False,mesh_smooth_type='FACE',axis_forward='-Z',axis_up='Y')
report={'source':'Original Blender geometry with original Iron Nomad PBR textures','objects':len(bpy.context.scene.objects),'meshes':len([o for o in bpy.context.scene.objects if o.type=='MESH']),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'),'anchors':{n:[round(v,3) for v in bpy.data.objects[n].location] for n in ['Gangway','CourseActuator','AnnikaArchive','JournalPort','JournalStarboard','JournalArchive']}}
(OUT/'model-report.json').write_text(json.dumps(report,indent=2))
print('QUIET ARRAY BUILT',json.dumps(report),flush=True)
