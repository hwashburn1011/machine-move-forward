"""Original close-shot industrial memory set, with editable moving assemblies.

Run in a separate Blender process. Godot supplies the existing animated actors
and camera edit; this file owns the set, disconnect lever and gloved hand.
"""
import bpy, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/opening-memory';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
rng=np.random.default_rng(74131)
def xyz(p):return Vector((p[0],-p[2],p[1]))
def empty(name,at=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=xyz(at);return o
def mat(name,color,metal=0,rough=.7,wear=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*color,1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough
 if wear:
  n=512;y,x=np.mgrid[0:n,0:n]/n;field=np.zeros((n,n))
  for k in range(1,7):field+=np.sin(x*math.tau*2**k+k)*np.cos(y*math.tau*2**(k-1)+k*.7)/(k*5)
  grain=rng.normal(0,.025,(n,n));chips=np.maximum(0,field-.20)*rng.random((n,n))
  pixels=np.ones((n,n,4),dtype=np.float32);pixels[:,:,:3]=np.clip(np.array(color)[None,None,:]*(.95+field[:,:,None]*.34+grain[:,:,None])*(1-chips[:,:,None])+np.array([.13,.075,.038])[None,None,:]*chips[:,:,None],0,1)
  image=bpy.data.images.new(name+' original wear',width=n,height=n);image.pixels.foreach_set(pixels.ravel());image.pack();node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;m.node_tree.links.new(node.outputs['Color'],s.inputs['Base Color'])
 return m
concrete=mat('Ash grey cast concrete',(.26,.28,.27),0,.92,True)
steel=mat('Blue graphite enamel',(.095,.14,.145),.55,.66,True)
edge=mat('Exposed burnished edges',(.24,.27,.25),.8,.42)
dark=mat('Dark rubber and shadow',(.025,.033,.03),.05,.91)
ochre=mat('Faded machinery ochre',(.35,.25,.105),.3,.71,True)
rust=mat('Oxide emergency enamel',(.28,.069,.043),.25,.76,True)
ivory=mat('Worn ivory stencil',(.64,.64,.53),0,.84)
cloth=mat('Canvas work sleeve',(.19,.235,.20),0,.98,True)
leather=mat('Worn leather glove',(.29,.26,.19),0,.86,True)
glass=mat('Smoked safety glass',(.12,.19,.19),.15,.22)
fracture=mat('Dull fractured glass edges',(.18,.23,.22),0,.90)
s=glass.node_tree.nodes.get('Principled BSDF');s.inputs['Alpha'].default_value=.055;glass.surface_render_method='DITHERED'
root=empty('OpeningMemory');fixed=empty('StaticSet',parent=root)
def finish(o,name,material,parent,bevel=0):
 o.name=name;o.parent=parent;o.data.materials.append(material)
 if bevel:
  b=o.modifiers.new('Manufactured edge radius','BEVEL');b.width=bevel;b.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name)
 for p in o.data.polygons:p.use_smooth=True
 return o
def box(name,at,size,material=steel,parent=fixed,bevel=.02):
 bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at));o=bpy.context.object;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,name,material,parent,bevel)
 n=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');n.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=n.name);return o
def tube(name,a,b,r,material=edge,parent=fixed,vertices=20):
 a,b=xyz(a),xyz(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);return finish(o,name,material,parent,min(.006,r*.15))
def cable(name,points,r,material=dark,parent=fixed):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=12;c.bevel_depth=r;c.bevel_resolution=3;s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for p,v in zip(s.bezier_points,points):p.co=xyz(v);p.handle_left_type=p.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.parent=parent;o.data.materials.append(material);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return o
def text(name,words,at,size,material=ivory,parent=fixed):
 bpy.ops.object.text_add(location=xyz(at));o=bpy.context.object;o.name=name;o.parent=parent;o.data.body=words;o.data.align_x='CENTER';o.data.size=size;o.data.extrude=.0004;o.rotation_euler=(math.pi/2,0,0);o.data.materials.append(material);bpy.ops.object.convert(target='MESH');return o

def loft(name,sections,material,parent,segments=32,folds=0):
 vertices=[];faces=[]
 for k,(cx,cy,z,rx,ry) in enumerate(sections):
  for j in range(segments):
   angle=j*math.tau/segments
   wrinkle=1+folds*math.sin(k*2.4+angle*3)*math.sin(math.pi*k/(len(sections)-1))
   vertices.append(xyz((cx+math.cos(angle)*rx*wrinkle,cy+math.sin(angle)*ry*wrinkle,z)))
 for k in range(len(sections)-1):
  for j in range(segments):
   a=k*segments+j;b=k*segments+(j+1)%segments;faces.append((a,b,b+segments,a+segments))
 faces.extend([tuple(reversed(range(segments))),tuple((len(sections)-1)*segments+j for j in range(segments))])
 if sections[-1][2]<sections[0][2]:faces=[tuple(reversed(f)) for f in faces]
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
 o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
 # Continuous cloth/leather UVs; face-wise box projection creates visible
 # triangular patches on a close-up curved sleeve.
 uv=mesh.uv_layers.new(name='UVMap');o['continuous_uv']=True
 for f in mesh.polygons:
  if f.index<(len(sections)-1)*segments:
   row,col=divmod(f.index,segments)
   values=[(col/segments,row/(len(sections)-1)),((col+1)/segments,row/(len(sections)-1)),((col+1)/segments,(row+1)/(len(sections)-1)),(col/segments,(row+1)/(len(sections)-1))]
   if sections[-1][2]<sections[0][2]:values.reverse()
   for loop,value in zip(f.loop_indices,values):uv.data[loop].uv=value
 return finish(o,name,material,parent)

box('Continuous factory slab',(0,-.15,0),(18,.3,24),concrete,bevel=.04)
box('Rear load wall',(0,3,-10),(18,6,.4),concrete)
for x in [-8.5,8.5]:
 box('Lower perimeter wall',(x,1.4,0),(.3,2.8,20),concrete)
 for z in [-8,-2,4,10]:
  box('Column web',(x,3,z),(.18,6,.32),steel)
  for dx in [-.17,.17]:box('Column flange',(x+dx,3,z),(.06,6,.48),steel)
  box('Foot casting',(x,.16,z),(.65,.3,.7),edge)
  for dz in [-.23,.23]:tube('Anchor bolt',(x-.22,.30,z+dz),(x-.22,.35,z+dz),.036,dark,vertices=6)
for z in [-8,-2,4,10]:
 box('Roof cross girder',(0,5.9,z),(17.3,.28,.24),steel)
 for x in [-6,-2,2,6]:tube('Roof diagonal',(x-2,5.3,z),(x+2,5.9,z),.044,steel)
for x in [-6,-3,0,3,6]:box('Roof folded bay',(x,6.13,0),(2.88,.1,20),steel)
for x in [-7.9,7.9]:
 tube('Main pressure pipe',(x,4.7,-9),(x,4.7,9),.13,edge)
 for z in [-7,-1,5]:box('Pipe wall cleat',(x,4.72,z),(.4,.36,.09),steel)
for x in [-7.4,-7.1]:tube('Service riser',(x,.35,-9.65),(x,4.7,-9.65),.055,edge)
text('Bay number','04',(-5,3.9,-9.76),1.0)
text('Hall stencil','TRANSFER HALL',(1.3,4.6,-9.77),.38)
for x in [-4.2,4.2]:
 for z in range(-8,9,2):box('Faded lane paint',(x,.008,z),(.055,.008,1.5),ochre,bevel=.002)
for x,z in [(-6,-4),(-6,0),(6,-6)]:
 box('Skid feet',(x,.10,z),(2.1,.2,1.1),dark)
 box('Ribbed motor crate',(x,.65,z),(2,1.0,1),steel,bevel=.08)
 for dz in [-.38,-.12,.14,.40]:box('Crate band',(x,.68,z+dz),(2.025,1.06,.035),edge,bevel=.008)
for z in [-6.5,1.5]:
 for x in [-3.4,3.4]:box('Gantry upright',(x,2.4,z),(.28,4.8,.35),ochre)
 box('Gantry track',(0,4.9,z),(7.3,.3,.35),ochre)
for x in [-3.4,3.4]:box('Longitudinal rail',(x,4.9,-2.5),(.15,.18,8.3),edge)
box('Hoist trolley',(0,4.65,-4.9),(1.6,.4,.8),steel)
load=empty('SuspendedMotor',(0,4.45,-4.9),root)
for x in [-.65,.65]:tube('Hanging chain',(x,0,0),(x,-2.25,0),.027,edge,load)
box('Motor housing',(0,-2.75,0),(1.55,.85,1.2),steel,load,.12)
for x in np.linspace(-.6,.6,9):box('Cooling fin',(float(x),-2.75,0),(.035,1.0,1.32),edge,load,.007)
cart=empty('ServiceCart',(-2.55,0,-3.35),root)
for x in [-.44,.44]:
 for z in [-.34,.34]:
  tube('Rubber castor',(x-.035,.085,z),(x+.035,.085,z),.085,dark,cart)
  box('Castor fork',(x,.16,z),(.10,.11,.07),edge,cart,.012)
  box('Cart upright',(x,.52,z),(.043,.67,.043),steel,cart,.009)
for y in [.25,.92]:
 box('Pressed trolley tray',(0,y,0),(1.02,.06,.86),steel,cart,.018)
 for z in [-.41,.41]:box('Tray retaining lip',(0,y+.052,z),(1.02,.06,.023),edge,cart,.008)
box('Cart repair side panel',(-.48,.58,0),(.027,.5,.69),ochre,cart,.009)
for z in [-.34,.34]:tube('Cart push handle',(-.45,.9,z),(-.45,1.13,z),.025,edge,cart)
tube('Cart push grip',(-.45,1.13,-.34),(-.45,1.13,.34),.032,dark,cart)
spool=empty('EjectedSpool',(-2.43,1.11,-3.08),root)
tube('Wound cable spool',(-.105,0,0),(.105,0,0),.123,dark,spool)
for x in [-.118,.118]:tube('Spool cheek',(x-.012,0,0),(x+.012,0,0),.16,edge,spool)
for x in [-.09,-.045,0,.045,.09]:tube('Cable winding',(x-.008,0,0),(x+.008,0,0),.128,steel,spool)
for z in [-4,0]:
 for x in [-2.9,2.9]:tube('Lane guard',(x,.4,z),(x,1.1,z),.045,ochre)
 for x in [-2.9,2.9]:tube('Lane rail',(x,1.1,z),(x,1.1,z+1.5),.045,ochre)

# Disconnect cabinet. Every detail faces +Z for the close camera.
box('Disconnect pedestal',(-3.6,.58,2.4),(.66,1.16,.4),steel,bevel=.065)
box('Disconnect cabinet',(-3.6,1.48,2.4),(.72,.92,.35),steel,bevel=.055)
box('Inset rubber gasket',(-3.6,1.48,2.585),(.62,.82,.018),dark,bevel=.023)
box('Removable faceplate',(-3.6,1.48,2.599),(.575,.775,.018),edge,bevel=.016)
for dx in [-.245,.245]:
 for y in [1.16,1.80]:tube('Captive screw',(-3.6+dx,y,2.61),(-3.6+dx,y,2.63),.014,dark,vertices=12)
text('Disconnect identifier','MAIN FEED / 04',(-3.6,1.70,2.622),.050)
text('Disconnect action','ISOLATE',(-3.6,1.19,2.623),.065)
box('Switch travel slot',(-3.6,1.47,2.632),(.13,.31,.025),dark,bevel=.025)
lever=empty('DisconnectLever',(-3.6,1.49,2.65),root)
tube('Steel lever stem',(0,0,0),(0,.12,.115),.025,edge,lever)
box('Gripped handle',(0,.15,.12),(.25,.065,.075),rust,lever,.025)
for dx in [-.10,-.06,-.02,.02,.06,.10]:box('Handle grip groove',(dx,.153,.159),(.009,.038,.006),dark,lever,.002)
cable('Flex conduit',[(-3.8,1.1,2.35),(-4,.8,2.32),(-3.95,.2,2.1),(-4.6,.06,1.3)],.027,dark)
for x in [-3.8,-3.4]:box('Moulded switch guard',(x,1.50,2.69),(.034,.43,.12),ochre,bevel=.012)

# Separate knuckles, finger joints, wrist and two sleeve segments let the
# performance establish a grip, preload the switch, pull and release it.
hand=empty('HumanGlove',(-3.38,1.32,2.91),root)
loft('Tailored glove palm',[(0,0,-.057,.038,.019),(0,0,-.038,.048,.024),(0,-.002,0,.05,.026),(0,-.004,.037,.042,.022),(0,-.005,.073,.032,.022)],leather,hand)
box('Soft knuckle reinforcement',(0,.023,-.032),(.083,.016,.037),leather,hand,.007)
for x in [-.038,.038]:cable('Glove side stitching',[(x,.012,-.048),(x*1.2,.02,0),(x*.75,.012,.064)],.0012,dark,hand)
finger_groups=[]
for i,x in enumerate([-.036,-.012,.013,.037]):
 lengths=[.030,.024,.019] if i==0 else [.038,.027,.022] if i in [1,2] else [.034,.025,.020]
 parent=hand
 for j,length in enumerate(lengths):
  part=empty(f'Finger{i}_{j}',(x,0,-.051) if j==0 else (0,0,-lengths[j-1]),parent);finger_groups.append(part)
  radius=.0095 if i==0 else .0105
  loft('Glove finger',[(0,0,0,radius,.011),(0,.001,-length*.22,radius*1.06,.012),(0,0,-length*.72,radius,.010),(0,-.001,-length,radius*.78,.008)],leather,part,24)
  cable('Finger seam',[(-radius*.72,.007,-length*.15),(-radius*.80,.008,-length*.55),(-radius*.64,.006,-length*.87)],.0009,dark,part)
  parent=part
thumb=empty('OpposedThumb',(.038,-.001,-.008),hand)
cable('Glove thumb',[(0,0,0),(.028,-.018,-.019),(.026,-.050,-.041),(.006,-.087,-.050)],.015,leather,thumb)
cable('Thumb stitching',[(.008,.014,0),(.034,-.006,-.018),(.034,-.040,-.040),(.015,-.074,-.050)],.001,dark,thumb)
loft('Wrist cuff',[(0,-.005,.065,.033,.024),(0,-.005,.084,.039,.030),(0,-.005,.110,.040,.031)],leather,hand)
upper=empty('UpperSleeve',parent=root);forearm=empty('ForeSleeve',parent=root)
for group,length,start_r,end_r in [(upper,.34,.078,.062),(forearm,.29,.063,.043)]:
 sections=[]
 for k in range(33):
  t=k/32;radius=start_r*(1-t)+end_r*t
  sections.append((.007*math.sin(math.pi*t),-.008*math.sin(math.pi*t),length*t,radius,radius*.86))
 loft('Tailored canvas sleeve',sections,cloth,group,48,.025)
 cable('Sleeve longitudinal seam',[(0,start_r*.86,0),(.005,(start_r+end_r)*.44,length*.5),(0,end_r*.86,length)],.0013,dark,group)
for z in [.018,.030,.046]:
 cable('Elbow compressed fold',[(-.049,.026,z),(0,.053,z+.008),(.047,.027,z)],.002,cloth,forearm)
bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,radius=1)
o=bpy.context.object;o.scale=(.063,.066,.055);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,'Soft elbow gusset',cloth,forearm)

# A real framed safety partition, with localized fracture lines at the edge.
for x in [-2.7,3.4]:box('Safety glass mullion',(x,1.7,3.15),(.075,3.4,.10),steel)
for y in [.14,3.35]:box('Safety glass transom',(.35,y,3.15),(6.17,.08,.10),steel)
box('Retained safety glass',(.35,1.75,3.15),(6.04,3.13,.013),glass,bevel=.001)
cracks=empty('GlassFractures',parent=root)
for i in range(9):
 angle=i*math.tau/9+float(rng.uniform(-.18,.18));origin=Vector((2.85,2.85,3.169));length=float(rng.uniform(.10,.48));end=origin+Vector((math.cos(angle)*length,math.sin(angle)*length,0));middle=origin.lerp(end,.55)+Vector((.023,-.015,0));tube('Glass fracture',origin,middle,.0008,fracture,cracks,6);tube('Glass fracture branch',middle,end,.0006,fracture,cracks,6)
for i in range(8):
 x=float(rng.uniform(-7,7));z=float(rng.uniform(-8,8));box('Expansion joint',(x,.008,z),(.018,.007,1.6),dark,bevel=.001)

# Stable world-metre texture scale and material batches for the static set.
source_parts=len([o for o in root.children_recursive if o.type=='MESH'])
for o in root.children_recursive:
 if o.type!='MESH':continue
 if o.get('continuous_uv'):continue
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for f in o.data.polygons:
  axis=max(range(3),key=lambda i:abs(f.normal[i]));a,b=[i for i in range(3) if i!=axis]
  for loop in f.loop_indices:
   p=o.data.vertices[o.data.loops[loop].vertex_index].co+o.location;uv.data[loop].uv=(p[a]/1.3,p[b]/1.3)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'OpeningMemory.blend'),compress=True)
for group in [fixed,hand,lever,load,cracks,cart,spool,upper,forearm,thumb]+finger_groups:
 for material in list(bpy.data.materials):
  meshes=[o for o in group.children if o.type=='MESH' and o.data.materials[0]==material]
  if not meshes:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in meshes:o.select_set(True)
  bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();o=bpy.context.object;o.name=group.name+'_'+material.name
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
path=ROOT/'godot/art/opening-memory.glb'
for o in root.children_recursive:
 if o.type=='MESH':
  bpy.context.view_layer.objects.active=o;tri=o.modifiers.new('Portable triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_tangents=True)
meshes=[o for o in root.children_recursive if o.type=='MESH']
for o in meshes:o.data.calc_loop_triangles()
report={'editable_parts':source_parts,'batches':len(meshes),'triangles':sum(len(o.data.loop_triangles) for o in meshes),'bytes':path.stat().st_size,'moving_roots':['HumanGlove','UpperSleeve','ForeSleeve','DisconnectLever','SuspendedMotor','ServiceCart','EjectedSpool','GlassFractures'],'articulated_finger_joints':12,'sleeve_lengths_m':[.34,.29],'provenance':'Original beveled Blender geometry and deterministic painted wear. Existing game actors are staged separately in Godot.'}
(OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n');print('OPENING_MEMORY_COMPLETE',json.dumps(report),flush=True)
