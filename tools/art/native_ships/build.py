"""Original detailed crossfire vessels; run only in an isolated Blender process.

The original staging deck is retained at Y=8.08, and existing crew/flag semantics
stay compatible. Metres, game Y-up through the project's geometry helpers.
"""
import bpy, math, json, sys, ast, struct, re
from pathlib import Path
from mathutils import Vector, Matrix
import numpy as np

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-ships';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c

# Reuse the project's original portable PBR recipe without executing its gun
# generator. Only this named function is compiled; its exact source is retained.
recipe=ast.parse((ROOT/'tools/art/native_weapons/build.py').read_text())
function=next(n for n in recipe.body if isinstance(n,ast.FunctionDef) and n.name=='wear_material')
exec(compile(ast.Module(body=[function],type_ignores=[]),'<project wear material>','exec'))
steel=wear_material('Convoy dark steel',(.071,.082,.081),.74,.67,531)
paint=wear_material('Convoy faded blue grey',(.24,.285,.28),.43,.75,532)
robot=wear_material('Order blackened armor',(.063,.077,.084),.66,.65,533)
rust=wear_material('Convoy oxide primer',(.23,.11,.062),.35,.85,534)
deck=wear_material('Scoured deck plate',(.18,.19,.175),.72,.71,535)
rubber=wear_material('Black heat insulation',(.028,.031,.027),.02,.94,536)
edge=c.flat('Exposed worn alloy',(.32,.335,.30),.85,.5)
dark=c.flat('Deep vent recess',(.010,.015,.015),.12,.87)
glass=c.flat('Smoked bridge glass',(.018,.055,.065),.35,.2)
letter=c.flat('Ship stencil ivory',(.62,.61,.49),0,.86)
human_trim=c.flat('Convoy blue trim',(.055,.19,.215),.55,.68)
robot_trim=c.flat('Order oxide trim',(.23,.045,.028),.6,.65)

def glow(name,color):
    mat=c.flat(name,color,.1,.42);s=mat.node_tree.nodes.get('Principled BSDF')
    s.inputs['Emission Color'].default_value=(*color,1);s.inputs['Emission Strength'].default_value=1.5
    return mat
cyan=glow('Convoy navigation cyan',(.025,.52,.68))
red=glow('Order navigation red',(.78,.045,.02))
amber=glow('Warm service lamps',(.85,.43,.12))

def box(name,at,size,mat,p,bevel=.035):return c.box(name,at,size,mat,p,bevel)
def bolt(at,p,axis=(1,0,0),radius=.052):
    a=Vector(at);b=a+Vector(axis)*(radius*.7)
    c.tube('Captive hex bolt',a,b,radius,edge,p,6)
def plate_bolts(x,y,z,width,height,p,angle=0):
    side=1 if x>0 else -1
    for yy in [-height*.36,height*.36]:
        for zz in [-width*.38,width*.38]:bolt((x+yy*math.sin(angle),y+yy*math.cos(angle),z+zz),p,(side*math.cos(angle),-abs(math.sin(angle)),0),.037)
def mesh(name,verts,faces,mat,p,bevel=0):
    data=bpy.data.meshes.new(name);data.from_pydata([c.xyz(v) for v in verts],[],faces);data.update()
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);c.finish(obj,name,mat,p,bevel)
    # Consistent face normals, including custom loft rings.
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    mod=obj.modifiers.new('Weighted planar normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj
def loft(p,mat):
    sections=[(-12.4,2.1,1.6,5.8,2.1),(-10.5,3.7,2.8,7.15,1.35),(-6.5,4,3.05,7.78,1.05),(5,4,3.05,7.78,1.05),(10.5,3.6,2.85,6.6,1.5),(12.2,2.75,2.3,5.4,2.0)]
    verts=[];faces=[]
    for z,w,b,top,bottom in sections:
        verts.extend([(-b,bottom,z),(b,bottom,z),(w,top-.6,z),(w-.16,top,z),(-w+.16,top,z),(-w,top-.6,z)])
    for row in range(len(sections)-1):
        for i in range(6):faces.append((row*6+i,row*6+(i+1)%6,(row+1)*6+(i+1)%6,(row+1)*6+i))
    faces.extend([tuple(reversed(range(6))),tuple(range((len(sections)-1)*6,len(sections)*6))])
    return mesh('Continuous tapered armored hull',verts,faces,mat,p,.13)
def ring(name,at,outer,inner,depth,p,mat=steel,axis='z'):
    verts=[];faces=[];n=48;x,y,z=at
    for along,r in [(-depth/2,outer),(depth/2,outer),(depth/2,inner),(-depth/2,inner)]:
        for i in range(n):
            a=i*math.tau/n
            verts.append((x+r*math.cos(a),y+r*math.sin(a),z+along) if axis=='z' else (x+r*math.cos(a),y+along,z+r*math.sin(a)))
    for row in range(4):
        for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,((row+1)%4)*n+(i+1)%n,((row+1)%4)*n+i))
    return mesh(name,verts,faces,mat,p)
def side_text(text,x,y,z,p):
    bpy.ops.object.text_add(location=c.xyz((x,y,z)));o=bpy.context.object;o.name='Stamped '+text;o.parent=p
    o.data.body=text;o.data.size=.33;o.data.extrude=.001;o.data.align_x='CENTER';o.data.materials.append(letter)
    side=1 if x>0 else -1
    u=c.xyz((0,0,-side));v=c.xyz((side*math.sin(.155),math.cos(.155),0));normal=u.cross(v)
    o.rotation_euler=Matrix((u,v,normal)).transposed().to_euler()
    bpy.ops.object.convert(target='MESH')
def import_flag(faction,p):
    previous=set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/assets/runtime'/('battle-'+faction+'.glb')))
    incoming=set(bpy.context.scene.objects)-previous
    original=next(o for o in incoming if o.type=='MESH' and o.name.startswith('Mesh_64'))
    flag=original.copy();flag.data=original.data.copy();bpy.context.collection.objects.link(flag)
    matrix=original.matrix_world.copy();flag.parent=p;flag.matrix_world=matrix;flag.name='FactionFlag'
    for v in flag.data.vertices:
        # Keep the pole edge fixed; shape the existing subdivided cloth.
        t=(v.co.x-min(q.co.x for q in flag.data.vertices))/max(.001,original.dimensions.x)
        v.co.y+=.10*t*math.sin(t*7+v.co.z*2)
    for o in incoming:bpy.data.objects.remove(o,do_unlink=True)
    return flag

roots=[];source_counts=[]
for faction in ['human','robot']:
    p=c.empty('HumanConvoy' if faction=='human' else 'RobotWarship');roots.append(p)
    coat=paint if faction=='human' else robot;trim=human_trim if faction=='human' else robot_trim;light=cyan if faction=='human' else red
    loft(p,coat)
    # Structural keel, armored belt and recessed lower propulsion bays.
    box('Longitudinal keel',(0,1.15,-.1),(4.8,.6,21.7),steel,p,.17)
    for side in [-1,1]:
        box('Hull belt frame',(side*3.72,4.5,-.4),(.30,.30,19.8),steel,p,.09)
        box('Upper rubbed edge',(side*3.96,7.66,-.9),(.23,.23,12.8),edge,p,.065)
        for z in [-8.5,-5.4,-2.3,.8,3.9,7.0]:
            x=side*(3.86 if abs(z)<7 else 3.68)
            # Armor wraps down toward the narrow keel rather than hovering off it.
            panel=box('Replaceable upper armor',(x,6.23,z),(.12,2.42,2.96),coat,p,.06)
            panel.rotation_euler.y=side*.155
            plate_bolts(x+side*.075,6.23,z,2.96,2.42,p,side*.155)
            box('Side machinery recess',(side*3.72,3.16,z),(.28,1.78,2.65),dark,p,.07)
            for y in [2.48,2.76,3.04,3.32,3.60,3.88]:
                vane=box('Angled cooling louvre',(side*3.91,y,z),(.32,.12,2.48),steel,p,.025)
                vane.rotation_euler.y=side*.25
            for zz in [z-1.3,z+1.3]:box('Vent frame upright',(side*3.96,3.16,zz),(.22,1.98,.12),trim,p,.025)
            box('Inset navigation strip',(side*3.99,4.28,z),(.06,.065,1.80),light,p,.018)
            box('Lamp protective eyebrow',(side*4.06,4.40,z),(.2,.09,1.91),steel,p,.018)
            for zz in [z-.70,z+.70]:
                c.tube('Propulsion duct clamp',(side*3.25,1.68,zz),(side*3.25,2.14,zz),.15,edge,p,16)
        c.cable('External armored cable',[(side*4.08,5.1,-7.7),(side*4.15,4.9,-5),(side*4.15,4.95,3),(side*3.8,5.1,8.5)],.07,rubber,p)
        for z in [-6,-2,2,6]:box('Cable saddle',(side*4.19,4.98,z),(.11,.23,.13),edge,p,.025)
        side_text('HUMAN CONVOY' if faction=='human' else 'MACHINE ORDER',side*3.92,6.12,-1.0,p)
        side_text('04' if faction=='human' else '03',side*3.73,6.07,7,p)
    for x in [-.84,.84]:
        box('Bow collision armor',(x,4.0,-12.44),(1.55,2.4,.12),coat,p,.075)
        for xx in [x-.59,x+.59]:
            for y in [3.05,4.95]:bolt((xx,y,-12.52),p,(0,0,-1),.04)
    for x in [-1.52,1.52]:
        box('Bow headlamp mount',(x,5.46,-12.42),(.48,.40,.25),steel,p,.075)
        box('Protected bow lens',(x,5.48,-12.56),(.33,.22,.045),amber,p,.035)
    box('Tow eye backing',(0,2.65,-12.39),(.55,.55,.2),steel,p,.06)
    ring('Open tow eye',(0,2.65,-12.56),.22,.115,.24,p,edge)
    # Four lift plenum outlets beneath the ship, seated in structural saddles.
    for x in [-2.25,2.25]:
        for z in [-7.4,7.4]:
            c.tube('Lift plenum',(x,1.05,z),(x,2.15,z),1.02,steel,p,48)
            ring('Open lift outlet',(x,.92,z),1.09,.80,.22,p,edge,'y')
            c.tube('Dark outlet depth',(x,1.15,z),(x,1.25,z),.81,dark,p,40)
            for j in range(8):
                a=j*math.tau/8
                c.tube('Radial outlet vane',(x+.23*math.cos(a),1.10,z+.23*math.sin(a)),(x+.76*math.cos(a+.12),1.10,z+.76*math.sin(a+.12)),.045,steel,p,8)
    # Identical staging plane, clear where the original five actors stand.
    box('Original staging deck',(0,7.89,-1),(8,.3,11),steel,p,.045)
    for x in [-3,-1,1,3]:
        for z in [-5.5,-3.5,-1.5,.5,2.5]:
            box('Inset tread panel',(x,8.066,z),(1.94,.028,1.94),deck,p,.012)
            for xx in [x-.80,x+.80]:
                for zz in [z-.78,z+.78]:bolt((xx,8.085,zz),p,(0,1,0),.025)
    for side in [-1,1]:
        x=side*3.9
        for z in [-5.8,-3.5,.4,3.8]:
            box('Welded rail mounting foot',(x,8.12,z),(.36,.08,.34),steel,p,.028)
            c.tube('Tubular guard post',(x,8.12,z),(x,9.1,z),.061,steel,p,20)
            for dx in [-.115,.115]:bolt((x+dx,8.17,z),p,(0,1,0),.025)
        for y in [8.62,9.10]:c.tube('Continuous guardrail',(x,y,-6),(x,y,4),.051,trim,p,24)
        box('Toe kick',(x,8.20,-1),(.07,.20,10),coat,p,.012)
        for z in [-4.5,.0,3.4]:
            box('Caged deck light',(side*4.0,7.72,z),(.25,.31,.5),steel,p,.05)
            box('Amber service lens',(side*4.14,7.74,z),(.045,.17,.35),amber,p,.018)
    # Low, armored bridge with connected glass frames and rear access hardware.
    box('Bridge foundation',(0,8.18,3),(3.14,.20,2.66),steel,p,.08)
    box('Bridge cabin',(0,9.15,3),(2.85,1.84,2.34),coat,p,.18)
    box('Bridge visor',(0,10.12,2.98),(3.23,.20,2.77),steel,p,.08)
    box('Recessed front glass',(0,9.53,1.805),(2.5,.68,.035),glass,p,.02)
    for x in [-1.32,-.44,.44,1.32]:box('Bridge window mullion',(x,9.53,1.75),(.075,.86,.13),edge,p,.025)
    for y in [9.14,9.94]:box('Bridge window sill',(0,y,1.75),(2.76,.08,.15),steel,p,.024)
    for side in [-1,1]:
        box('Bridge side glass',(side*1.44,9.55,2.75),(.04,.62,1.46),glass,p,.035)
        c.cable('External handhold',[(side*1.53,8.8,3.7),(side*1.65,8.8,3.7),(side*1.65,9.6,3.7),(side*1.53,9.6,3.7)],.028,edge,p)
    box('Rear bridge door',(0,9.02,4.185),(1.20,1.65,.07),steel,p,.06)
    for y in [8.6,9.4]:c.tube('Door hinge',(-.64,y-.1,4.22),(-.64,y+.1,4.22),.045,edge,p,16)
    c.tube('Door lock',(.41,8.96,4.24),(.41,9.23,4.24),.035,edge,p,16)
    # Paired stern machinery with actual annular outlets, rings and connected pipes.
    for x in [-1.7,1.7]:
        for z in [6.0,9.8]:box('Engine saddle',(x,6.35,z),(2.08,.45,.42),steel,p,.06)
        c.tube('Rounded engine casing',(x,7.22,5.35),(x,7.22,10.25),.93,coat,p,64)
        for z in [5.5,6.8,8.1,9.5]:ring('Engine retaining band',(x,7.22,z),.98,.935,.12,p,edge)
        ring('Open exhaust rim',(x,7.22,10.4),.98,.73,.3,p,steel)
        c.tube('Exhaust recess',(x,7.22,9.99),(x,7.22,10.03),.74,dark,p,48)
        for j in range(12):
            a=j*math.tau/12
            c.tube('Exhaust stator blade',(x+.23*math.cos(a),7.22+.23*math.sin(a),10.13),(x+.69*math.cos(a+.15),7.22+.69*math.sin(a+.15),10.13),.037,steel,p,8)
        c.cable('Engine service line',[(x,8.02,5.9),(x+.30,8.38,6.1),(x+.30,8.38,9.6),(x,8.06,9.8)],.095,rust,p)
        for z in [6.1,9.6]:ring('Pipe flange',(x+.30,8.38,z),.16,.095,.06,p,edge)
    # Bow gun is presentation only: hollow muzzles, cooling sleeve and cradle.
    c.tube('Turret base',(0,7.12,-8.45),(0,7.57,-8.45),1.13,steel,p,48)
    box('Turret rotating mantle',(0,8.00,-8.5),(2.06,1.05,1.92),coat,p,.16)
    for x in [-.33,.33]:
        c.tube('Barrel heat sleeve',(x,8.2,-8.9),(x,8.2,-10.85),.16,steel,p,32)
        ring('Hollow barrel',(x,8.2,-11.77),.12,.078,1.85,p,edge)
        ring('Muzzle collar',(x,8.2,-12.61),.18,.08,.26,p,steel)
        for z in [-9.2,-9.55,-9.9,-10.25,-10.6]:ring('Cooling sleeve fin',(x,8.2,z),.22,.16,.065,p,coat)
    # The existing faction flag and pole location are retained.
    for y in [8.1,10.6,12.9]:ring('Mast collar',(2.2,y,3.1),.16,.09,.13,p,edge,'y')
    c.tube('Flag mast',(2.2,7.70,3.1),(2.2,13.7,3.1),.085,steel,p,32)
    c.cable('Mast guy cable',[(2.2,12.7,3.1),(3.6,8.18,3.8)],.025,edge,p)
    import_flag(faction,p)
    # Human ship has service equipment; robot ship has compact armored sensors.
    if faction=='human':
        for x in [-.8,.8]:
            box('Roof equipment saddle',(x,10.30,3),(.30,.23,1),steel,p,.045)
            c.tube('Roof receiver canister',(x,10.47,2.65),(x,10.47,3.4),.18,rust,p,32)
        for z in [-10.7,10.8]:
            for x in [-2.3,2.3]:
                box('Mooring pedestal',(x,6.7,z),(.58,.25,.63),steel,p,.08)
                c.tube('Mooring bollard',(x,6.7,z),(x,7.06,z),.14,edge,p,24)
                c.tube('Bollard crossbar',(x-.25,7.06,z),(x+.25,7.06,z),.1,steel,p,24)
    else:
        box('Sensor mount',(0,10.34,3),(1.38,.25,.9),steel,p,.09)
        box('Armored sensor',(0,10.71,3),(1.23,.60,.72),coat,p,.14)
        for x in [-.36,0,.36]:
            c.tube('Sensor socket',(x,10.73,2.6),(x,10.73,2.58),.105,dark,p,32)
            c.tube('Red sensor lens',(x,10.73,2.56),(x,10.73,2.54),.07,red,p,32)
        for x in [-1.25,1.25]:c.tube('Signal antenna',(x,10.2,3.6),(x,11.55,3.6),.028,edge,p,16)
    # Semantic anchors keep native effects/crew placement auditable.
    c.empty('DeckOrigin',(0,8.08,-1),p);c.empty('FireAnchor',(2,7.95,3),p)
    source_counts.append(len(p.children_recursive))
    print('SHIP_AUTHORED',faction,len(p.children_recursive),flush=True)

# Portable UVs on every new hard-surface part; preserve the inherited flag UVs.
for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH' or obj.name.startswith('FactionFlag'):continue
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.01);bpy.ops.object.mode_set(mode='OBJECT')
    tri=obj.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
print('UVS_COMPLETE',flush=True)

# Save the source with every fastener, rail and hull panel separately editable.
roots[0].location=c.xyz((-6.1,0,0));roots[1].location=c.xyz((6.1,0,0))
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('Neutral ship studio');scene.world.color=(.18,.18,.18)
bpy.ops.object.camera_add(location=(33,40,27));cam=bpy.context.object;target=Vector((0,0,6.3));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=37;scene.camera=cam
for at,power,size in [((4,9,30),18000,16),((-17,-5,18),12000,14),((10,-20,20),16000,12)]:
    bpy.ops.object.light_add(type='AREA',location=at);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1800;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'crossfire-ships.png')
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'CrossfireShips.blend'))
bpy.ops.render.render(write_still=True)

# Batch exports per material; source file above remains individually editable.
report={'sourceParts':source_counts,'assemblies':[],'deckHeightM':8.08,'provenance':'Original authored geometry and project-owned PBR recipe; inherited original faction flag textures. No downloaded meshes or textures.'}
for i,p in enumerate(roots):
    p.location=(0,0,0)
    for mat in list(bpy.data.materials):
        pieces=[o for o in p.children if o.type=='MESH' and not o.name.startswith('FactionFlag') and len(o.data.materials)==1 and o.data.materials[0]==mat]
        if not pieces:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in pieces:o.select_set(True)
        bpy.context.view_layer.objects.active=pieces[0]
        if len(pieces)>1:bpy.ops.object.join()
        bpy.context.object.name=p.name+'_'+mat.name
    bpy.ops.object.select_all(action='DESELECT');p.select_set(True)
    for obj in p.children_recursive:obj.select_set(True)
    path=ROOT/'godot/art'/('crossfire-human.glb' if i==0 else 'crossfire-robot.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
    # Blender suffixes duplicate semantic names in the two-ship studio; each
    # independent runtime asset should expose the same anchor/flag names.
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
    for node in doc['nodes']:node['name']=re.sub(r'\.\d+$','',node.get('name',''))
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);tail=raw[20+length:]
    path.write_bytes(struct.pack('<4sIIII',b'glTF',2,20+len(encoded)+len(tail),len(encoded),0x4E4F534A)+encoded+tail)
    meshes=[o for o in p.children_recursive if o.type=='MESH']
    for obj in meshes:obj.data.calc_loop_triangles()
    report['assemblies'].append({'name':p.name,'triangles':sum(len(o.data.loop_triangles) for o in meshes),'meshes':len(meshes),'bytes':path.stat().st_size})
(OUT/'manifest.json').write_text(json.dumps(report,indent=2));print('SHIPS_COMPLETE',json.dumps(report),flush=True)
