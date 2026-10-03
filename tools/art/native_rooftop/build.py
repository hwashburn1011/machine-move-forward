"""Original ruined opening rooftop, authored in an isolated Blender process.

Preserves the frozen roof/ledge/stair volume and leaves every chase corridor
clear. The tank is moved toward the parapet, away from the first pursuer.
"""
import bpy, bmesh, math, json, sys
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-rooftop';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
Y=19.522
rng=np.random.default_rng(4219)

def xyz(p):return Vector((p[0],-p[2],p[1]))
def empty(name,at=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=xyz(at);o.parent=parent;return o
def material(name,base,metal=0,rough=.8):
    m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF')
    s.inputs['Base Color'].default_value=(*base,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough;return m
def textured(name,concrete=False):
    n=1024;v,u=np.mgrid[0:n,0:n]/n
    field=np.zeros((n,n))
    for k in range(1,7):
        field+=np.sin(u*(2**k)*math.tau+.3*k)*np.cos(v*(2**(k-1))*math.tau+.71*k)/(k*3)
    noise=rng.random((n,n));pits=(noise>.982).astype(float)
    grain=rng.normal(0,.026,(n,n));stain=np.clip(field*.8+.3,0,1)
    if concrete:
        streak=np.clip((np.sin(u*math.tau*11)+np.sin(u*math.tau*23)*.5)*.35-.1,0,.65)*(np.sin(v*math.tau)*.25+.65)
        base=np.array([.39,.362,.313])[None,None,:]*(.91+field[:,:,None]*.30+grain[:,:,None])
        base-=pits[:,:,None]*.10+(stain+streak)[:,:,None]*np.array([.067,.071,.074]);rough=.85+field*.045;met=np.zeros((n,n));height=field*.045+noise*.018-pits*.065
    else:
        wear=np.clip((field+.1)*2,0,1)*(noise>.34)
        base=np.array([.245,.258,.235])[None,None,:]*(.85+field[:,:,None]*.23+grain[:,:,None])
        base=base*(1-wear[:,:,None])+np.array([.19,.082,.035])[None,None,:]*wear[:,:,None]
        rough=.66+wear*.22;met=.63-wear*.30;height=field*.05+noise*.01-wear*.027
    m=material(name,(.4,.4,.4));nodes=m.node_tree.nodes;links=m.node_tree.links;s=nodes.get('Principled BSDF');textures={}
    for channel in ['Base','ORM','Normal']:
        pixels=np.ones((n,n,4),dtype=np.float32)
        if channel=='Base':pixels[:,:,:3]=np.clip(base,0,1)
        elif channel=='ORM':pixels[:,:,1]=rough;pixels[:,:,2]=met
        else:
            pixels[:,:,0]=.5+(np.roll(height,1,1)-np.roll(height,-1,1))*.7
            pixels[:,:,1]=.5+(np.roll(height,1,0)-np.roll(height,-1,0))*.7;pixels[:,:,2]=1
        image=bpy.data.images.new(name+' '+channel,width=n,height=n);image.colorspace_settings.name='sRGB' if channel=='Base' else 'Non-Color';image.pixels.foreach_set(pixels.ravel());image.pack()
        node=nodes.new('ShaderNodeTexImage');node.image=image;textures[channel]=node
    links.new(textures['Base'].outputs['Color'],s.inputs['Base Color'])
    sep=nodes.new('ShaderNodeSeparateColor');links.new(textures['ORM'].outputs['Color'],sep.inputs[0]);links.new(sep.outputs[1],s.inputs['Roughness']);links.new(sep.outputs[2],s.inputs['Metallic'])
    normal=nodes.new('ShaderNodeNormalMap');links.new(textures['Normal'].outputs['Color'],normal.inputs['Color']);normal.inputs['Strength'].default_value=.6;links.new(normal.outputs[0],s.inputs['Normal'])
    return m

concrete=textured('Weathered mineral concrete',True);steel=textured('Oxidized painted steel')
edge=material('Scoured steel edges',(.19,.185,.16),.8,.56)
dark=material('Interior recesses',(.035,.033,.029),.05,.94)
rust=material('Exposed oxide',(.17,.07,.03),.30,.88)
ivory=material('Faded service lettering',(.62,.61,.50),0,.82)
root=empty('OpeningRooftop')
roof=empty('RoofStructure',parent=root);equipment=empty('RoofEquipment',parent=root)

def finish(o,name,mat,parent,bevel=0):
    o.name=name;o.data.materials.append(mat);o.parent=parent
    if bevel:
        b=o.modifiers.new('Worn softened edges','BEVEL');b.width=bevel;b.segments=2 if 'Window' in name or 'window' in name else 3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name)
    return o
def box(name,at,size,mat=concrete,parent=roof,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at));o=bpy.context.object;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat,parent,bevel)
    for f in o.data.polygons:f.use_smooth=True
    b=o.modifiers.new('Planar weighted normals','WEIGHTED_NORMAL');b.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=b.name);return o
def tube(name,a,b,r,mat=steel,parent=equipment,n=24):
    a,b=xyz(a),xyz(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    finish(o,name,mat,parent,.006 if r>.035 else 0)
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    return o
def cable(name,points,r,mat=steel,parent=equipment):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=6;curve.bevel_depth=r;curve.bevel_resolution=2
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for p,co in zip(spline.bezier_points,points):p.co=xyz(co);p.handle_left_type=p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(mat);o.parent=parent
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return bpy.context.object
def ring(name,at,r,minor,mat=steel,parent=equipment):
    bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=minor,major_segments=48,minor_segments=8,location=xyz(at));o=bpy.context.object;finish(o,name,mat,parent)
    for f in o.data.polygons:f.use_smooth=True
    return o
def label(name,text,at,size,rotation=(math.pi/2,0,math.pi),parent=equipment):
    bpy.ops.object.text_add(location=xyz(at));o=bpy.context.object;o.name=name;o.parent=parent;o.data.body=text;o.data.align_x='CENTER';o.data.size=size;o.data.extrude=.0007;o.rotation_euler=rotation;o.data.materials.append(ivory);bpy.ops.object.convert(target='MESH');return bpy.context.object

# Deep window reveals, continuous piers and floor spandrels replace the solid
# texture-stretched shell. Internal backing keeps the unplayable interior dark.
box('Recessed structural core',(19.5,(Y-.24)/2,0),(8.90,Y-.24,8.90),dark,roof,.02)
box('Load bearing roof slab',(19.5,Y-.16,0),(10,.32,10),concrete,roof,.055)
for side in range(4):
    def point(u,y,d=0):
        if side==0:return (14.5+d,y,u)
        if side==1:return (24.5-d,y,u)
        if side==2:return (19.5+u,y,-5+d)
        return (19.5+u,y,5-d)
    def panel(name,u,y,width,height,depth=.28,inset=.14,mat=concrete):
        if side>=2:
            lo=max(u-width/2,-4.72);hi=min(u+width/2,4.72);u=(lo+hi)/2;width=hi-lo
        size=(depth,height,width) if side<2 else (width,height,depth)
        return box(name,point(u,y,inset),size,mat,roof,.018)
    for u in [-4.775,-2.5,0,2.5,4.775]:panel('Continuous concrete pier',u,(Y-.32)/2,.90 if abs(u)<4 else .45,Y-.32)
    lower=0
    for row in range(7):
        upper=1.95+row*3.12-.76 if row<6 else Y-.32
        # Butt into the vertical piers: overlapping coplanar concrete faces
        # cause black reflection artifacts at every beam/column intersection.
        for u in [-3.75,-1.25,1.25,3.75]:panel('Concrete spandrel bay',u,(upper+lower)/2,1.60,upper-lower)
        lower=1.95+row*3.12+.76
    for row in range(6):
        cy=1.95+row*3.12
        for col,u in enumerate([-3.75,-1.25,1.25,3.75]):
            for du in [-.80,.80]:panel('Window steel jamb',u+du,cy,.045,1.57,.045,.205,steel)
            for dy in [-.76,.76]:panel('Window header and sill',u,cy+dy,1.65,.055,.15,.17,steel)
            panel('Recessed window mullion',u,cy,.035,1.49,.045,.27,steel)
            if (row+col+side)%3!=0:panel('Broken window transom',u,cy+.20,1.59,.03,.04,.27,steel)
            if (row+col+side)%5==0:
                # A few retained boards; never a repeating filled-window wall.
                o=panel('Boarded damaged pane',u-.15,cy,1.05,.12,.035,.25,steel);o.rotation_euler.x=.16 if side<2 else 0;o.rotation_euler.y=.16 if side>=2 else 0

# Low irregular parapets preserve the original four-metre jump gap.
def parapet(name,a,b,height):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized();normal=Vector((-axis.z,0,axis.x))*.15;length=(b-a).length
    subdivisions=max(3,int(length/.55));verts=[];faces=[]
    for i in range(subdivisions+1):
        centre=a+(b-a)*i/subdivisions
        top=height-(.035+.075*rng.random())
        if i in [subdivisions-1,subdivisions] and 'rear' in name:top-=.15 if i==subdivisions else .31
        for n,h in [(-normal,0),(normal,0),(-normal,top),(normal,top)]:verts.append(xyz(centre+n+Vector((0,h,0))))
    for i in range(subdivisions):
        k=i*4
        faces.extend([(k,k+4,k+6,k+2),(k+1,k+3,k+7,k+5),(k+2,k+6,k+7,k+3),(k,k+1,k+5,k+4)])
    k=subdivisions*4;faces.extend([(0,2,3,1),(k,k+1,k+3,k+2)])
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);finish(o,name,concrete,roof,.018)
parapet('Near parapet south',(14.65,Y,2),(14.65,Y,5),1)
parapet('Near parapet north',(14.65,Y,-5),(14.65,Y,-2),1)
parapet('Northern parapet',(14.8,Y,-4.85),(24.2,Y,-4.85),1)
parapet('Southern parapet',(14.8,Y,4.85),(24.2,Y,4.85),1)
parapet('Damaged rear parapet',(24.35,Y,-5),(24.35,Y,5),1)
for z in [4.1,4.48,4.72]:
    cable('Exposed rear rebar',[(24.35,Y+.38,z),(24.35,Y+.84,z),(24.29,Y+.98,z)],.009,rust,roof)

# Separate roof screed pads, drainage and worn expansion joints.
for x in [16.1,19.35,22.6]:
    for z in [-3.25,0,3.25]:box('Roof screed bay',(x,Y+.004,z),(3.22,.008,3.21),concrete,roof,.002)
for z in [-4.55,4.55]:
    for x in [15.2,23.8]:
        box('Rainwater grate recess',(x,Y+.013,z),(.35,.012,.30),dark,roof,.01)
        for i in range(6):box('Drain grille',(x-.14+i*.056,Y+.023,z),(.014,.018,.28),steel,roof,.003)

# Blocked roof access: concrete enclosure, a framed steel leaf, actual hinges,
# overlapping restraint bars and a drip roof rather than a painted cube.
house=empty('BlockedStairHead',parent=equipment)
box('Stair head shell',(22.3,Y+1.2,0),(2.2,2.4,2.2),concrete,house,.045)
box('Door frame reveal',(21.18,Y+1.0,0),(.07,2.06,1.65),dark,house,.01)
box('Closed roof access leaf',(21.13,Y+1.01,0),(.065,1.98,1.51),steel,house,.02)
for z in [-.81,.81]:box('Steel jamb',(21.10,Y+1.02,z),(.12,2.10,.065),edge,house,.008)
box('Drip header',(21.06,Y+2.09,0),(.22,.065,1.80),steel,house,.012)
for y in [.35,1.0,1.70]:tube('Door hinge barrel',(21.07,Y+y-.075,.73),(21.07,Y+y+.075,.73),.025,edge,house,24)
for y in [.65,1.45]:
    box('Door cross brace',(21.04,Y+y,0),(.09,.09,1.80),rust,house,.012)
    for z in [-.75,.75]:tube('Brace fixing bolt',(20.975,Y+y,z),(21.003,Y+y,z),.026,edge,house,6)
box('Steel door lock housing',(21.027,Y+.98,-.51),(.08,.14,.065),edge,house,.018)
cable('Door pull handle',[(20.98,Y+.87,-.52),(20.92,Y+.91,-.52),(20.92,Y+1.08,-.52),(20.98,Y+1.12,-.52)],.013,edge,house)
box('Roof flashing',(22.3,Y+2.42,0),(2.39,.075,2.42),steel,house,.018)
for z in np.linspace(-1.1,1.1,15):box('Roof standing seam',(22.3,Y+2.47,float(z)),(2.35,.055,.025),steel,house,.009)
label('Exit identification','ROOF ACCESS',(21.083,Y+1.78,0),.092,(math.pi/2,0,-math.pi/2),house)

# A real vessel with smooth rolled profile, mounting shoes, seams, regulator,
# pressure gauge and joined plumbing. Move it outside the pursuer corridor.
tank=empty('SecuredServiceVessel',parent=equipment);tx,tz=20.7,3.80
profile=[(.10,.34),(.16,.43),(.24,.49),(.35,.51),(1.00,.51),(1.11,.49),(1.19,.40),(1.22,.28)]
verts=[];faces=[]
for y,r in profile:
    for i in range(64):
        a=i*math.tau/64;verts.append(xyz((tx+r*math.cos(a),Y+y,tz+r*math.sin(a))))
for j in range(len(profile)-1):
    for i in range(64):faces.append((j*64+i,j*64+(i+1)%64,(j+1)*64+(i+1)%64,(j+1)*64+i))
faces.extend([tuple(reversed(range(64))),tuple(range((len(profile)-1)*64,len(profile)*64))])
m=bpy.data.meshes.new('Formed tank shell');m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new('Rolled pressure vessel',m);bpy.context.collection.objects.link(o);finish(o,o.name,steel,tank)
for f in m.polygons:f.use_smooth=len(f.vertices)==4
for dx in [-.31,.31]:
    for dz in [-.28,.28]:
        box('Tank mounting shoe',(tx+dx,Y+.02,tz+dz),(.19,.04,.17),steel,tank,.01)
        tube('Tank welded foot',(tx+dx,Y+.04,tz+dz),(tx+dx,Y+.23,tz+dz),.035,steel,tank)
        tube('Foundation bolt',(tx+dx+.05,Y+.041,tz+dz),(tx+dx+.05,Y+.065,tz+dz),.018,edge,tank,6)
for y in [.33,.95]:ring('Tank restraint seam',(tx,Y+y,tz),.513,.015,edge,tank)
tube('Pressure relief neck',(tx,Y+1.2,tz),(tx,Y+1.34,tz),.055,edge,tank)
tube('Vent mushroom cap',(tx,Y+1.33,tz),(tx,Y+1.38,tz),.10,steel,tank)
cable('Tank supply pipe',[(tx-.36,Y+.38,tz-.35),(tx-.69,Y+.38,tz-.35),(tx-.79,Y+.25,tz-.35),(tx-.79,Y+.06,tz-.35)],.032,steel,tank)
tube('Roof pipe gland',(tx-.79,Y+.007,tz-.35),(tx-.79,Y+.06,tz-.35),.065,edge,tank)
tube('Gauge neck',(tx,Y+.84,tz-.44),(tx,Y+.84,tz-.59),.026,edge,tank)
tube('Gauge casing',(tx,Y+.85,tz-.565),(tx,Y+.85,tz-.615),.105,edge,tank,48)
tube('Gauge face',(tx,Y+.85,tz-.616),(tx,Y+.85,tz-.619),.087,ivory,tank,48)
for i in range(11):
    a=-math.pi*.2+i*math.pi*1.4/10
    cable('Gauge tick',[(tx+math.cos(a)*.063,Y+.85+math.sin(a)*.063,tz-.621),(tx+math.cos(a)*.076,Y+.85+math.sin(a)*.076,tz-.621)],.002,dark,tank)
cable('Pressure needle',[(tx,Y+.85,tz-.624),(tx-.028,Y+.902,tz-.624)],.003,dark,tank)
label('Vessel stencil','UTILITY / 04',(tx,Y+.52,tz-.517),.053,parent=tank)

# Weathered roof ventilation cabinet with supported fan/grille and service lid.
vent=empty('RooftopExtractor',parent=equipment);vx,vz=18.9,-3.50
box('Vent curb',(vx,Y+.07,vz),(1.18,.14,.88),concrete,vent,.025)
box('Vent body',(vx,Y+.32,vz),(1.12,.38,.80),steel,vent,.035)
box('Louvre shadow',(vx,Y+.32,vz+.407),(.92,.26,.015),dark,vent,.005)
for i in range(7):
    o=box('Vent louvre blade',(vx,Y+.212+i*.035,vz+.432),(.96,.023,.075),steel,vent,.007);o.rotation_euler.x=.35
box('Top fan shadow',(vx,Y+.516,vz),(.77,.01,.58),dark,vent,.06)
for i in range(15):box('Fan guard bar',(vx-.35+i*.05,Y+.54,vz),(.012,.022,.58),edge,vent,.004)
for z in [-.30,.30]:box('Guard fixing rail',(vx,Y+.537,vz+z),(.79,.024,.04),steel,vent,.006)
for dx in [-.48,.48]:
    for dz in [-.31,.31]:tube('Vent lid screw',(vx+dx,Y+.51,vz+dz),(vx+dx,Y+.527,vz+dz),.015,edge,vent,6)

# Mast foot is physically fixed to the roof; its cable ends at a junction box.
mast=empty('RoofRadioAntenna',parent=equipment);mx,mz=17.1,3.20
box('Antenna foundation',(mx,Y+.045,mz),(.35,.09,.35),concrete,mast,.015)
box('Antenna base plate',(mx,Y+.10,mz),(.30,.025,.30),steel,mast,.01)
tube('Antenna tapered support',(mx,Y+.11,mz),(mx,Y+1.65,mz),.032,steel,mast)
tube('Antenna whip',(mx,Y+1.65,mz),(mx,Y+2.45,mz),.008,edge,mast,12)
for y in [.34,.63,1.28]:ring('Antenna split clamp',(mx,Y+y,mz),.038,.008,edge,mast)
for y in [.60,1.20,1.62]:tube('Receiver element',(mx-.31,Y+y,mz),(mx+.31,Y+y,mz),.009,edge,mast,12)
for dx in [-.105,.105]:
    for dz in [-.105,.105]:tube('Antenna base bolt',(mx+dx,Y+.11,mz+dz),(mx+dx,Y+.135,mz+dz),.018,edge,mast,6)
box('Weatherproof junction box',(mx+.13,Y+.20,mz),(.13,.20,.12),steel,mast,.02)
cable('Secured antenna lead',[(mx+.12,Y+.18,mz),(mx+.13,Y+.46,mz),(mx+.03,Y+.62,mz),(mx+.03,Y+1.63,mz)],.008,dark,mast)

# Sparse small rubble stays against the far parapet and out of the actor lanes.
for i in range(18):
    at=(float(rng.uniform(15.2,24.0)),Y+.032,float(rng.choice([-1,1])*rng.uniform(4.43,4.58)))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=xyz(at));o=bpy.context.object;o.scale=(rng.uniform(.035,.12),rng.uniform(.03,.08),rng.uniform(.025,.045));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,'Parapet spall',concrete,roof)

empty('TakeoffLedge',(14.5,Y,0),root);empty('RoofLevel',(19.5,Y,0),root)
source_count=sum(o.type=='MESH' for o in root.children_recursive)
# World-metre projection keeps the same texture scale on the facade and fittings.
for obj in list(root.children_recursive):
    if obj.type!='MESH':continue
    mesh=obj.data;uv=mesh.uv_layers.active or mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        axis=max(range(3),key=lambda i:abs(face.normal[i]));a,b=[i for i in range(3) if i!=axis]
        for loop in face.loop_indices:
            p=mesh.vertices[mesh.loops[loop].vertex_index].co+obj.location
            uv.data[loop].uv=(p[a]/2,p[b]/2)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    tri=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.calc_area()<1e-9],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()

scene=bpy.context.scene;scene.name='Opening rooftop studio';scene.world=bpy.data.worlds.new('Rooftop neutral studio');scene.world.color=(.20,.20,.20)
bpy.ops.object.camera_add(location=xyz((8,29,14)));cam=bpy.context.object;target=xyz((19.3,Y+.45,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=15;scene.camera=cam
for at,power,size in [((12,31,4),9000,10),((27,25,-9),6000,8),((17,23,12),3500,8)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(at));o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'rooftop-studio.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'OpeningRooftop.blend'),compress=True)
bpy.ops.render.render(write_still=True)
cam.location=xyz((17.4,Y+2.8,.8));target=xyz((20.4,Y+.65,3.3));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=4.0;scene.render.filepath=str(OUT/'rooftop-fittings.png');bpy.ops.render.render(write_still=True)
for mat in [concrete,steel,edge,dark,rust,ivory]:
    meshes=[o for o in root.children_recursive if o.type=='MESH' and o.data.materials[0]==mat]
    if not meshes:continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();o=bpy.context.object;o.name='Rooftop_'+mat.name;o.parent=root
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for obj in root.children_recursive:obj.select_set(True)
path=ROOT/'godot/art/opening-rooftop.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
meshes=[o for o in root.children_recursive if o.type=='MESH']
for o in meshes:o.data.calc_loop_triangles()
report={'roofY':Y,'footprint':{'minX':14.5,'maxX':24.5,'minZ':-5,'maxZ':5},'gapHalfWidth':2,'editableParts':source_count,'triangles':sum(len(o.data.loop_triangles) for o in meshes),'batches':len(meshes),'bytes':path.stat().st_size,'equipment':{'tank':[tx,Y,tz],'vent':[vx,Y,vz],'mast':[mx,Y,mz]},'provenance':'Original Blender geometry and procedurally authored 1024 PBR maps. No downloaded meshes or imagery. Original rooftop dimensions and launch anchors preserved.'}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2));print('ROOFTOP_COMPLETE',json.dumps(report),flush=True)
