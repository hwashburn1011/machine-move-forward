"""Original Orchard geometry helpers; run only in a separate Blender process."""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/glass-orchard'
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'exports').mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
with bpy.data.libraries.load(str(ROOT/'assets/quiet-array/QuietArray.blend'),link=False) as (source,target):
    target.materials=[n for n in source.materials if n.startswith('Array_')]
M={m.name:m for m in target.materials}
steel=M['Array_CharcoalSteel'];bare=M['Array_MachinedMetal'];brass=M['Array_HandrailBrass']
ivory=M['Array_IvoryPaint'];red=M['Array_OxidePaint'];cyan=M['Array_ArchiveCyan'];amber=M['Array_ServiceAmber']
dark=M['Array_Recess'];letter=M['Array_Lettering']

def flat(name,color,metal=0,rough=.75,alpha=1):
    m=bpy.data.materials.new(name);m.use_nodes=True
    s=m.node_tree.nodes.get('Principled BSDF')
    s.inputs['Base Color'].default_value=(*color,1)
    s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough
    s.inputs['Alpha'].default_value=alpha
    if alpha<1:m.surface_render_method='DITHERED'
    return m
soil=flat('Orchard_FertileSoil',(.035,.023,.014))
leafgreen=flat('Orchard_LivingLeaves',(.075,.20,.042),rough=.7)
veingreen=flat('Orchard_LeafVeins',(.18,.29,.065),rough=.78)
glass=flat('Orchard_AgedGlass',(.21,.42,.35),rough=.26,alpha=.24)
plant_batches={}

def batch_geometry(parent,mat,verts,faces):
    key=(parent,mat)
    data=plant_batches.setdefault(key,([],[]))
    offset=len(data[0]);data[0].extend(verts)
    data[1].extend(tuple(offset+i for i in face) for face in faces)

def plant_tube(a,b,r,parent):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized()
    u=axis.cross(Vector((0,1,0)))
    if u.length<.01:u=axis.cross(Vector((1,0,0)))
    u.normalize();v=axis.cross(u).normalized();verts=[]
    for center in [a,b]:
        for i in range(8):
            angle=2*math.pi*i/8;verts.append(xyz(center+r*(u*math.cos(angle)+v*math.sin(angle))))
    faces=[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
    faces.extend([tuple(reversed(range(8))),tuple(range(8,16))])
    batch_geometry(parent,veingreen,verts,faces)

def flush_plants():
    for (parent,mat),(verts,faces) in plant_batches.items():
        mesh=bpy.data.meshes.new(parent.name+' foliage');mesh.from_pydata(verts,[],faces);mesh.update()
        obj=bpy.data.objects.new(parent.name+' '+mat.name,mesh);bpy.context.collection.objects.link(obj)
        finish(obj,obj.name,mat,parent)
    plant_batches.clear()

def xyz(p):return Vector((p[0],-p[2],p[1]))
def empty(name,at=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=xyz(at);o.parent=parent;return o
def finish(o,name,mat,parent,bevel=0):
    o.name=name;o.data.materials.append(mat);o.parent=parent
    if bevel:
        m=o.modifiers.new('Soft manufactured edges','BEVEL');m.width=bevel;m.segments=3
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
    for face in o.data.polygons:face.use_smooth=True
    return o
def box(name,at,size,mat,parent,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at));o=bpy.context.object
    o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat,parent,bevel)
    mod=o.modifiers.new('Planar weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def tube(name,a,b,r,mat,parent,segments=16):
    a,b=xyz(a),xyz(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return finish(o,name,mat,parent,.008 if r>.04 else 0)
def cable(name,points,r,mat,parent):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=8
    curve.bevel_depth=r;curve.bevel_resolution=2
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for p,co in zip(spline.bezier_points,points):p.co=xyz(co);p.handle_left_type=p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(mat);o.parent=parent
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH');o.select_set(False);return o
def label(name,text,at,size,parent):
    bpy.ops.object.text_add(location=xyz(at));o=bpy.context.object;o.name=name;o.parent=parent
    o.data.body=text;o.data.size=size;o.data.extrude=.001;o.data.align_x='CENTER'
    o.rotation_euler=(math.pi/2,0,math.pi);o.data.materials.append(letter)
    bpy.ops.object.convert(target='MESH');return bpy.context.object
def leaf(at,length,width,angle,parent):
    # Curved, closed lanceolate blade: smooth silhouette and raised central vein.
    verts=[];faces=[];rows=10;cols=4
    direction=Vector((math.cos(angle),0,math.sin(angle)));side=Vector((-math.sin(angle),0,math.cos(angle)))
    base=Vector(at)
    for i in range(rows+1):
        t=i/rows
        for j in range(cols+1):
            s=2*j/cols-1
            p=base+direction*(length*t)+side*(width*math.sin(math.pi*t)*s)
            p.y+=length*(.5*t-.3*t*t)+width*.28*(1-s*s)*math.sin(math.pi*t)
            verts.append(xyz(p))
    for i in range(rows):
        for j in range(cols):
            a=i*(cols+1)+j;faces.append((a,a+1,a+cols+2,a+cols+1))
    count=len(verts)
    verts.extend([v-Vector((0,0,.004)) for v in verts[:]])
    faces.extend([tuple(i+count for i in reversed(f)) for f in faces[:]])
    batch_geometry(parent,leafgreen,verts,faces)
    tip=base+direction*(length*.91);tip.y+=length*.25
    plant_tube(at,tuple(tip),.006,parent)
def plant(at,scale,parent,seed=0):
    x,y,z=at
    plant_tube((x,y,z),(x,y+.32*scale,z),.013*scale,parent)
    for i in range(6):
        leaf((x,y+(.1+.028*i)*scale,z),(.28+.025*(i%3))*scale,.085*scale,i*2.4+seed,parent)
def bed(at,size,parent,planted=True):
    x,y,z=at;w,d=size
    box('Grow tray',(x,y+.30,z),(w,.60,d),ivory,parent,.07)
    box('Dark rich soil',(x,y+.63,z),(w-.12,.10,d-.12),soil,parent,.015)
    for side in [-1,1]:
        tube('Irrigation manifold',(x+side*(w/2-.12),y+.72,z-d/2+.12),(x+side*(w/2-.12),y+.72,z+d/2-.12),.025,brass,parent)
    if planted:
        for i in range(max(1,int(w/.46))):
            for j in range(max(1,int(d/.48))):
                px=x-w/2+.26+i*.46;pz=z-d/2+.26+j*.48
                plant((px,y+.69,pz),.8,parent,i*.7+j*.4)
def platform(parent,w=18,d=20):
    box('Armored foundation deck',(0,-.24,0),(w,.48,d),steel,parent,.08)
    for x in range(int(-w/2)+1,int(w/2),2):
        for z in range(int(-d/2)+1,int(d/2),2):box('Grip plate',(x,.007,z),(1.97,.035,1.97),bare,parent,.01)
    for x in [-w/2+1,w/2-1]:
        for z in [-d/2+1,d/2-1]:
            tube('Foundation pile',(x,-15,z),(x,-.45,z),.3,steel,parent,24)
            for y in [-12,-8,-4]:tube('Pile sleeve',(x,y-.10,z),(x,y+.10,z),.37,red,parent,24)
        tube('Underdeck diagonal',(x,-7,-d/2+1),(x,-.5,d/2-1),.12,bare,parent)
        tube('Underdeck diagonal',(x,-.5,-d/2+1),(x,-7,d/2-1),.12,bare,parent)
    for x in [-w/2+.1,w/2-.1]:
        spans=[(-d/2+.1,-1.3),(1.3,d/2-.1)] if x<0 else [(-d/2+.1,d/2-.1)]
        for a,b in spans:
            for y in [.55,1.12]:tube('Guardrail',(x,y,a),(x,y,b),.045,brass,parent)
        for z in range(int(-d/2),int(d/2)+1,2):
            if x<0 and abs(z)<2:continue
            tube('Rail post',(x,.03,z),(x,1.13,z),.05,brass,parent)
    for z in [-d/2+.1,d/2-.1]:
        for y in [.55,1.12]:tube('End rail',(-w/2+.1,y,z),(w/2-.1,y,z),.045,brass,parent)
    gangway=empty('Gangway',(-w/2-.5,-.08,0),parent)
    box('Gangway tread',(0,0,0),(1,.16,2),bare,gangway)
    for z in [-.93,.93]:
        tube('Gangway rail',(-.5,1,z),(.5,1,z),.04,brass,gangway)
        for x in [-.5,.5]:tube('Gangway post',(x,0,z),(x,1,z),.045,brass,gangway)
    return gangway
def terminal(name,at,parent,color=cyan):
    x,y,z=at
    box(name+' pedestal',(x,.5,z),(.72,1,.55),steel,parent,.045)
    box(name+' display',(x,1.03,z),(.62,.075,.48),color,parent,.015)
    return empty(name,at,parent)
def export(name,root,preserve=()):
    flush_plants()
    print('Preparing export',name,len(bpy.context.scene.objects),'objects',flush=True)
    for obj in list(bpy.context.scene.objects):
        if obj.type!='MESH':continue
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        if not obj.data.uv_layers:
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.01);bpy.ops.object.mode_set(mode='OBJECT')
        mod=obj.modifiers.new('Runtime triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    for parent in [root,*preserve]:
        for mat in list(bpy.data.materials):
            meshes=[o for o in list(parent.children) if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
            if len(meshes)<2:continue
            bpy.ops.object.select_all(action='DESELECT')
            for o in meshes:o.select_set(True)
            bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();bpy.context.object.name=parent.name+'_'+mat.name
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(OUT/'exports'/(name+'.glb')),export_format='GLB',export_animations=False,export_tangents=True)
    bpy.ops.export_scene.fbx(filepath=str(OUT/'exports'/(name+'.fbx')),use_selection=True,global_scale=1,apply_unit_scale=True,object_types={'MESH','EMPTY'},bake_anim=False,mesh_smooth_type='FACE',axis_forward='-Z',axis_up='Y')
    report={'name':name,'meshes':sum(o.type=='MESH' for o in bpy.context.scene.objects),'triangles':sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'),'anchors':{o.name:list(o.location) for o in bpy.context.scene.objects if o.type=='EMPTY'}}
    (OUT/(name+'-report.json')).write_text(json.dumps(report,indent=2))
    print('ORCHARD_EXPORT',json.dumps(report),flush=True)
