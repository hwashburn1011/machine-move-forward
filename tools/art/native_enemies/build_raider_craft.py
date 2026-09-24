"""Original native raider hover craft. Run only in an isolated Blender process."""
import ast, json, math, sys
from pathlib import Path
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from repair_tangents import repair
OUT=ROOT/'assets/native-raiders';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'));import common as c
tree=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material'],type_ignores=[]),'<project wear>','exec'))
steel=wear_material('Raider blackened steel',(.065,.077,.074),.76,.65,6401)
paint=wear_material('Raider oxide armor',(.20,.135,.09),.55,.72,6402)
deck=wear_material('Raider scoured deck',(.20,.22,.205),.73,.65,6403)
edge=c.flat('Raider machined alloy',(.29,.30,.265),.85,.43)
rubber=c.flat('Raider heat insulation',(.018,.023,.021),.04,.89)
black=c.flat('Raider deep recess',(.006,.009,.009),.05,.91)
letter=c.flat('Raider faded stencils',(.57,.54,.43),0,.81)
glass=c.flat('Raider sensor glass',(.012,.047,.052),.28,.23)
amber=c.flat('Raider service lens',(.72,.39,.12),.1,.3)
red=c.flat('Raider targeting lens',(.38,.018,.008),.1,.3)
for mat,color in [(amber,(.9,.52,.18)),(red,(.8,.025,.012))]:
    bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=.65
roots=[];root=None

def adopt(obj,parent):
    # Geometry is authored in root coordinates; articulated groups retain their
    # exact semantic origins without double-applying the parent translation.
    if parent!=root:obj.matrix_basis=parent.matrix_world.inverted()@obj.matrix_basis
    return obj
def box(name,at,size,mat=steel,p=None,bevel=.016):
    p=p or root;return adopt(c.box(name,at,size,mat,p,bevel),p)
def tube(name,a,b,r,mat=steel,p=None,n=24):
    p=p or root;return adopt(c.tube(name,a,b,r,mat,p,n),p)
def cable(name,points,r,mat=rubber,p=None):
    p=p or root;return adopt(c.cable(name,points,r,mat,p),p)
def marker(name,at,parent=None):
    p=parent or root;obj=c.empty(name,parent=p);bpy.context.view_layer.update()
    obj.location=p.matrix_world.inverted()@c.xyz(at);bpy.context.view_layer.update();return obj
def mesh(name,verts,faces,mat=steel,p=None,bevel=.0):
    p=p or root;data=bpy.data.meshes.new(name);data.from_pydata([c.xyz(v) for v in verts],[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
    c.finish(obj,name,mat,p,bevel);adopt(obj,p)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    mod=obj.modifiers.new('Weighted formed normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False);return obj
def ring(name,at,outer,inner,depth,mat=edge,p=None,axis='z',n=36):
    x,y,z=at;verts=[];faces=[]
    for along,r in [(-depth/2,outer),(depth/2,outer),(depth/2,inner),(-depth/2,inner)]:
        for i in range(n):
            a=i*math.tau/n
            verts.append((x+r*math.cos(a),y+r*math.sin(a),z+along) if axis=='z' else (x+r*math.cos(a),y+along,z+r*math.sin(a)) if axis=='y' else (x+along,y+r*math.sin(a),z+r*math.cos(a)))
    for row in range(4):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,((row+1)%4)*n+(i+1)%n,((row+1)%4)*n+i))
    obj=mesh(name,verts,faces,mat,p)
    # Smooth around the bore while keeping its front/back shoulders crisp.
    for i,face in enumerate(obj.data.polygons):face.use_smooth=(i//n)%2==0
    return obj
def bolt(at,axis=(0,1,0),radius=.018,p=None):
    a=Vector(at);d=Vector(axis)
    tube('Captive washer',a,a+d*.005,radius,edge,p,16)
    tube('Hex retaining head',a+d*.005,a+d*.019,radius*.68,steel,p,6)
def label(value,at,size,normal=(1,0,0),p=None):
    p=p or root;normal=Vector(normal);up=Vector((0,1,0))
    if abs(normal.y)>.5:up=Vector((0,0,-1))
    right=up.cross(normal);up=normal.cross(right)
    bpy.ops.object.text_add(location=c.xyz(at));obj=bpy.context.object;obj.name='Stamped '+value;obj.parent=p
    obj.data.body=value;obj.data.size=size;obj.data.extrude=.0005;obj.data.align_x='CENTER';obj.data.materials.append(letter)
    obj.rotation_euler=Matrix((c.xyz(right),c.xyz(up),c.xyz(normal))).transposed().to_euler()
    bpy.ops.object.convert(target='MESH');adopt(obj,p)
def loft(sections,name):
    verts=[];faces=[]
    for z,width,lower,top,bottom in sections:
        verts.extend([(-lower,bottom,z),(lower,bottom,z),(width,top-.18,z),(width-.055,top,z),(-width+.055,top,z),(-width,top-.18,z)])
    for row in range(len(sections)-1):
        for i in range(6):faces.append((row*6+i,row*6+(i+1)%6,(row+1)*6+(i+1)%6,(row+1)*6+i))
    faces.extend([tuple(reversed(range(6))),tuple(range((len(sections)-1)*6,len(sections)*6))])
    return mesh(name,verts,faces,paint,bevel=.042)
def lift_unit(x,z,r,y):
    # Recessed rotor/plenum geometry explains the existing hovering motion.
    ring('Lift duct armored shell',(x,y+.16,z),r,r*.76,.42,steel,axis='y',n=40)
    ring('Lift outlet wear ring',(x,y-.045,z),r+.025,r*.76,.055,edge,axis='y',n=40)
    tube('Recessed lift motor',(x,y-.03,z),(x,y+.22,z),r*.24,steel,n=28)
    for i in range(9):
        a=i*math.tau/9;b=a+.25
        verts=[(x+r*.23*math.cos(a),y+.016,z+r*.23*math.sin(a)),(x+r*.72*math.cos(b),y+.028,z+r*.72*math.sin(b)),(x+r*.72*math.cos(b+.20),y+.052,z+r*.72*math.sin(b+.20)),(x+r*.23*math.cos(a+.31),y+.035,z+r*.23*math.sin(a+.31))]
        # Thin closed blades remain visible from either side of the duct.
        verts+= [(vx,vy+.006,vz) for vx,vy,vz in verts]
        mesh('Recessed lift impeller',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],edge)
    for a in [0,math.pi/2,math.pi,math.pi*1.5]:
        tube('Motor locating spoke',(x,y-.06,z),(x+r*.77*math.cos(a),y-.06,z+r*.77*math.sin(a)),.018,steel,n=12)
def lamp(at,side=1):
    x,y,z=at;box('Sealed headlamp case',at,(.28,.23,.17),steel,bevel=.035)
    box('Recessed amber lamp',(x,y,z-.09),(.21,.14,.025),amber,bevel=.018)
    for dx in [-.085,.085]:tube('Lamp guard rod',(x+dx,y-.1,z-.113),(x+dx,y+.1,z-.113),.012,edge,n=12)
def thruster(x,y,z,r,p=None):
    ring('Deep propulsion outlet',(x,y,z),r,r*.75,.24,steel,p,n=40)
    ring('Outlet rolled lip',(x,y,z+.125),r+.012,r*.75,.045,edge,p,n=40)
    tube('Black outlet depth',(x,y,z-.12),(x,y,z-.105),r*.76,black,p,n=32)
    tube('Exhaust centerbody',(x,y,z-.10),(x,y,z+.015),r*.20,steel,p,n=24)
    for i in range(8):
        a=i*math.tau/8
        tube('Exhaust guide vane',(x+r*.19*math.cos(a),y+r*.19*math.sin(a),z),(x+r*.73*math.cos(a+.18),y+r*.73*math.sin(a+.18),z),.017,edge,p,n=8)
def gun(prefix,y,z,heavy):
    yaw=marker(prefix+'GunYaw',(0,y-(.4 if heavy else 0),z))
    tube('Turret slewing pedestal',(0,y-.69,z),(0,y-.37,z),.44 if heavy else .22,steel,n=40)
    ring('Slewing race',(0,y-.39,z),.46 if heavy else .25,.35 if heavy else .17,.065,edge,yaw,'y',40)
    for x in [-.37,.37] if heavy else [-.23,.23]:
        box('Trunnion armor',(x,y-.05,z),(.15,.62 if heavy else .64,.51),paint,yaw,.04)
        tube('Elevation axle',(x-.09,y,z),(x+.09,y,z),.10 if heavy else .065,edge,yaw,n=28)
    pitch=marker(prefix+'GunPitch',(0,y,z),yaw)
    receiver=marker(prefix+'Recoil',(0,y,z),pitch)
    box('Dust sealed breech',(0,y,z+.015),(.50 if heavy else .32,.36 if heavy else .25,.70 if heavy else .48),steel,receiver,.045)
    box('Hinged top cover',(0,y+.19 if heavy else y+.135,z),(.48 if heavy else .30,.035,.65 if heavy else .43),paint,receiver,.012)
    muzzle=-3.5 if heavy else -3.05
    ring('Hollow cannon barrel',(0,y,(z-.24+muzzle+.06)/2),.082 if heavy else .051,.056 if heavy else .031,abs(muzzle+.06-z+.24),edge,receiver,n=40)
    ring('Recoil sleeve',(0,y,z-.46),.14 if heavy else .080,.087 if heavy else .056,.46 if heavy else .31,steel,receiver,n=40)
    for i in range(5):ring('Cooling jacket fin',(0,y,z-.30-i*.085),.16 if heavy else .094,.142 if heavy else .081,.025,paint,receiver,n=32)
    ring('Open muzzle brake',(0,y,muzzle+.09),.135 if heavy else .073,.057 if heavy else .032,.18,steel,receiver,n=40)
    for x in [-.25,.25] if heavy else [-.16,.16]:
        for zz in [z-.21,z+.22]:bolt((x,y+.08,zz),(1 if x>0 else -1,0,0),.012,receiver)
    box('Ammunition cassette',(.39 if heavy else .27,y-.05,z+.05),(.28 if heavy else .23,.32,.45),paint,receiver,.026)
    box('Fire control module',(0,y+.30 if heavy else y+.22,z+.10),(.18,.15,.23),steel,receiver,.025)
    box('Fire control optic',(0,y+.30 if heavy else y+.22,z-.023),(.105,.07,.016),red,receiver,.008)
    cable('Connected control harness',[(.25,y-.12,z+.27),(.27,y-.29,z+.40),(.15,y-.48,z+.29)],.018,p=yaw)
    marker(prefix+'Muzzle',(0,y,muzzle),receiver)
    return yaw,pitch

root=c.empty('RaiderSkiff');roots.append(root)
loft([(-2.82,.64,.46,1.11,.23),(-2.36,1.24,.82,1.18,.12),(-1.8,1.42,.99,1.18,.12),(1.75,1.42,.99,1.18,.12),(2.52,1.07,.77,1.12,.20),(2.70,.91,.71,.88,.26)],'Formed boarding hull')
box('Supported deck backing',(0,1.17,-.02),(2.63,.065,4.28),steel,bevel=.014)
for x in [-.87,0,.87]:
    for z in [-1.72,-.86,0,.86,1.72]:
        box('Flush traction plate',(x,1.211,z),(.85,.026,.835),deck,bevel=.004)
        for dx in [-.34,.34]:
            for dz in [-.34,.34]:
                # Flush countersunk heads preserve the authored standing plane.
                tube('Deck countersunk fastener',(x+dx,1.22,z+dz),(x+dx,1.224,z+dz),.012,steel,n=12)
for side in [-1,1]:
    for z in [-1.48,1.48]:lift_unit(side*1.1,z,.37,.13)
    for z in [-1.66,-.55,.56,1.67]:
        box('Replaceable hull cheek',(side*1.425,.79,z),(.055,.44,1.03),paint,bevel=.018)
        for dz in [-.4,.4]:
            for y in [.66,.94]:
                tube('Armor mounting spacer',(side*1.20,y,z+dz),(side*1.45,y,z+dz),.026,steel,n=16)
                bolt((side*1.457,y,z+dz),(side,0,0),.019)
    tube('Hull rubbing strake',(side*1.48,1.07,-2.03),(side*1.48,1.07,2.03),.045,rubber,n=24)
    for z in [-.90,.35,1.17]:
        box('Rail mounting shoe',(side*1.345,1.239,z),(.17,.03,.18),steel,bevel=.009)
        tube('Welded boarding stanchion',(side*1.37,1.25,z),(side*1.37,1.98,z),.027,steel,n=20)
        for dz in [-.055,.055]:bolt((side*1.32,1.255,z+dz),radius=.011)
    for y in [1.64,1.98]:tube('Boarding bay handrail',(side*1.37,y,-.90),(side*1.37,y,1.17),.028,edge,n=24)
    box('Recessed side identity',(side*1.458,.80,-.55),(.004,.24,.79),steel,bevel=.003)
    label('07 / BOARD', (side*1.462,.74,-.55),.10,(side,0,0))
    lamp((side*.56,1.10,-2.67))
    ring('Bow recovery eye',(side*.31,.65,-2.814),.105,.063,.075,edge)
    ring('Hull exhaust connection',(side*.54,.67,2.70),.265,.20,.17,steel,n=40)
    thruster(side*.54,.67,2.84,.27)
box('Aft engine cradle',(0,1.26,1.80),(1.96,.10,1.2),steel,bevel=.025)
box('Connected engine cowling',(0,1.51,1.91),(1.77,.44,1.14),paint,bevel=.075)
box('Engine service inset',(0,1.739,1.91),(1.50,.018,.91),black,bevel=.01)
for x in np.linspace(-.65,.65,12):box('Engine cooling louvre',(float(x),1.755,1.91),(.068,.028,.81),steel,bevel=.008)
for side in [-1,1]:
    for z in [1.46,2.34]:bolt((side*.78,1.74,z),radius=.017)
    cable('Terminated coolant line',[(side*.61,1.32,1.31),(side*.91,1.35,1.33),(side*.96,1.67,1.69),(side*.87,1.65,1.95)],.033)
    for z in [1.72,2.22]:box('Cowl hinge',(side*.88,1.62,z),(.05,.16,.16),edge,bevel=.014)
    ring('Hollow engine exhaust riser',(side*.68,1.91,2.22),.07,.048,.60,steel,axis='y',n=32)
    ring('Open exhaust rim',(side*.68,2.215,2.22),.079,.048,.055,edge,axis='y')
    tube('Recessed exhaust baffle',(side*.68,2.06,2.22),(side*.68,2.07,2.22),.05,black,n=24)
box('Remote pilot console',(0,1.55,-2.02),(.83,.66,.34),paint,bevel=.045)
box('Sealed control face',(0,1.65,-1.839),(.70,.35,.018),steel,bevel=.016)
box('Pilot status screen',(-.14,1.69,-1.826),(.28,.16,.013),glass,bevel=.012)
for x in [.10,.22]:
    tube('Selector stem',(x,1.65,-1.821),(x,1.65,-1.784),.025,edge,n=20)
    box('Selector paddle',(x,1.65,-1.77),(.035,.08,.025),rubber,bevel=.006)
label('REMOTE CMD',(0,1.45,-1.819),.055,(0,0,1))
for x in [-.59,.59]:marker('CrewSeatLeft' if x<0 else 'CrewSeatRight',(x,1.2,.35))
marker('PilotSeat',(0,1.2,-1.45));marker('SkiffDeckOrigin',(0,1.224,0));marker('SkiffEngineExhaust',(0,2.22,2.22))
gun('Skiff',2.04,-1.95,False)

root=c.empty('RaiderGunboat');roots.append(root)
loft([(-4.48,.48,.31,1.40,.48),(-3.50,1.39,.95,1.98,.23),(-2.65,1.63,1.19,2.11,.16),(2.80,1.63,1.19,2.11,.16),(3.77,1.36,.96,1.86,.22),(4.34,1.03,.79,1.45,.38)],'Sealed armored gunboat hull')
for side in [-1,1]:
    for z in [-2.75,0,2.75]:lift_unit(side*1.15,z,.46,.14)
    for z in [-2.25,-1.10,.05,1.20,2.35]:
        box('Raised armor cassette',(side*1.63,1.53,z),(.09,.72,1.065),paint,bevel=.028)
        for y in [1.28,1.78]:
            for dz in [-.40,.40]:
                tube('Cassette mounting spacer',(side*1.36,y,z+dz),(side*1.675,y,z+dz),.031,steel,n=16)
                bolt((side*1.674,y,z+dz),(side,0,0),.025)
    tube('Gunboat rub rail',(side*1.66,1.97,-2.80),(side*1.66,1.97,2.90),.044,rubber,n=28)
    for z in [-2.7,-.9,.9,2.7]:box('Rub rail saddle',(side*1.655,1.97,z),(.07,.16,.10),edge,bevel=.014)
    label('ORDER // 03',(side*1.678,1.46,.05),.145,(side,0,0))
    lamp((side*.64,1.72,-3.88))
    ring('Gunboat tow eye',(side*.34,.95,-4.01),.145,.09,.10,edge)
box('Turret deck foundation',(0,2.13,-.60),(2.59,.12,4.75),steel,bevel=.032)
loft([(-2.50,.78,.99,2.39,2.11),(-1.93,1.12,1.08,2.90,2.10),(.80,1.12,1.08,3.02,2.10),(1.40,.84,1.05,2.69,2.10)],'Folded unmanned citadel')
for side in [-1,1]:
    for z in [-1.25,-.43,.39]:
        box('Citadel service panel',(side*1.14,2.62,z),(.045,.42,.72),steel,bevel=.022)
        for dz in [-.27,.27]:bolt((side*1.17,2.65,z+dz),(side,0,0),.021)
    for z in [-1.78,.98]:cable('Citadel handhold',[(side*1.15,2.40,z),(side*1.24,2.43,z),(side*1.24,2.80,z),(side*1.15,2.83,z)],.023,edge)
box('Forward access hatch',(0,2.04,-3.17),(.94,.06,.90),steel,bevel=.035)
for x in [-.34,.34]:
    for z in [-3.5,-2.85]:bolt((x,2.079,z),radius=.022)
box('Navigation sensor pedestal',(0,2.23,-3.19),(.33,.32,.35),paint,bevel=.037)
box('Shielded navigation camera',(0,2.48,-3.19),(.51,.27,.32),steel,bevel=.052)
ring('Camera lens bezel',(0,2.48,-3.36),.092,.062,.05,edge)
tube('Dark camera lens',(0,2.48,-3.36),(0,2.48,-3.374),.062,glass,n=32)
for x in [-.16,.16]:box('Camera IR illuminator',(x,2.48,-3.355),(.05,.05,.018),red,bevel=.008)
for x in [-.68,.68]:
    for z in [2.05,3.46]:box('Engine supporting pillar',(x,2.27,z),(.20,.90,.22),steel,bevel=.025)
box('Rear engine foundation',(0,2.705,2.80),(1.74,.15,1.99),steel,bevel=.043)
for x in [-.43,.43]:
    tube('Turbine pressure jacket',(x,3.18,1.96),(x,3.18,3.52),.375,paint,n=48)
    for z in [2.05,2.48,2.91,3.34]:ring('Turbine retaining strap',(x,3.18,z),.39,.376,.065,edge,n=40)
    thruster(x,3.18,3.65,.30)
    for z in [2.15,3.24]:
        box('Jacket saddle',(x,2.84,z),(.73,.13,.21),steel,bevel=.03)
        for dx in [-.27,.27]:bolt((x+dx,2.92,z),radius=.018)
    cable('Terminated turbine supply',[(x,3.45,2.08),(x,3.67,2.18),(x,3.67,3.18),(x,3.47,3.34)],.038,rubber)
box('Drive service spine',(0,3.43,2.80),(.23,.27,1.58),steel,bevel=.037)
for z in np.linspace(2.22,3.38,8):box('Spine cooling rib',(0,3.584,float(z)),(.23,.035,.055),edge,bevel=.008)
box('Drive status recess',(0,3.608,2.8),(.17,.020,.55),black,bevel=.008)
indicator=marker('EngineStateLamp',(0,3.622,2.8))
box('Drive status lens',(0,3.622,2.8),(.085,.012,.40),red,indicator,.005)
gun('Gunboat',3.6,-1.7,True)
marker('WeaponDamageAnchor',(0,3.4,-1.7));marker('EngineDamageAnchor',(0,3.2,2.8));marker('EngineExhaust',(0,3.18,3.8))
for name,at in [('WeaponDisabled',(0,3.4,-1.7)),('EngineDisabled',(0,3.2,2.8))]:marker(name,at)

manifest={'source':'Original fictional hover craft; no external meshes or textures','units':'metres','up':'+Y','models':[]}
for model in roots:
    parts=[o for o in model.children_recursive if o.type=='MESH']
    for obj in parts:
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        # Beveled short cylinders can contain coincident cap triangles. Remove
        # only zero/microscopic faces before creating portable tangent buffers.
        bm=bmesh.new();bm.from_mesh(obj.data)
        tiny=[f for f in bm.faces if f.calc_area()<1e-10]
        if tiny:bmesh.ops.delete(bm,geom=tiny,context='FACES_ONLY')
        loose=[v for v in bm.verts if not v.link_faces]
        if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
        bm.to_mesh(obj.data);bm.free();obj.data.update();obj.data.calc_loop_triangles()
        uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
        for face in obj.data.polygons:
            points=[obj.data.vertices[i].co for i in face.vertices]
            normal=(points[1]-points[0]).cross(points[2]-points[0])
            axis=max(range(3),key=lambda i:abs(normal[i]));a,b=[i for i in range(3) if i!=axis]
            for loop in face.loop_indices:
                point=obj.data.vertices[obj.data.loops[loop].vertex_index].co;uv.data[loop].uv=(point[a]*1.45,point[b]*1.45)
    manifest['models'].append({'name':model.name,'editableParts':len(parts),'triangles':sum(len(o.data.loop_triangles) for o in parts)})
scene=bpy.context.scene;scene.name='Raider hover craft review';scene.world=bpy.data.worlds.new('Raider studio');scene.world.color=(.16,.16,.16)
roots[0].location=c.xyz((-2.7,0,-.7));roots[1].location=c.xyz((2.4,0,1.3))
bpy.ops.object.camera_add(location=c.xyz((13,12,-17)));camera=bpy.context.object;target=c.xyz((0,1.2,.4));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=14.4;scene.camera=camera
for at,power,size in [((2,-5,10),1700,8),((-8,-1,6),1200,7),((4,8,8),1900,7)]:
    bpy.ops.object.light_add(type='AREA',location=at);obj=bpy.context.object;obj.data.energy=power;obj.data.size=size;obj.rotation_euler=(target-obj.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=40;scene.render.resolution_x=1800;scene.render.resolution_y=1300;scene.render.resolution_percentage=100;scene.render.filepath=str(OUT/'raider-craft.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'RaiderCraft.blend'),compress=True)
if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)
for model in roots:
    model.location=(0,0,0)
    for parent in [model,*[o for o in model.children_recursive if o.type=='EMPTY']]:
        parts=[o for o in parent.children if o.type=='MESH']
        if not parts:continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in parts:obj.select_set(True)
        bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=bpy.context.object
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);obj.name=parent.name+'Mesh'
        old=list(obj.data.materials);mats=list(dict.fromkeys(old));indices=[mats.index(old[p.material_index]) for p in obj.data.polygons];obj.data.materials.clear()
        for mat in mats:obj.data.materials.append(mat)
        for poly,index in zip(obj.data.polygons,indices):poly.material_index=index
bpy.ops.object.select_all(action='DESELECT')
for model in roots:
    model.select_set(True)
    for obj in model.children_recursive:obj.select_set(True)
path=ROOT/'godot/art/raider-craft.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True,export_cameras=False,export_lights=False)
manifest['repairedTangents']=repair(path)
manifest['bytes']=path.stat().st_size;(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));print('RAIDER_CRAFT_COMPLETE',manifest,flush=True)
