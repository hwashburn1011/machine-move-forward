"""Twenty-five complete original story assemblies; metres, +Y up, +Z service face.

Source parts remain individually editable. Runtime parts are batched by material;
explicit physical shapes preserve open legs, arches, cradle voids and round shells.
"""
import ast, bpy, bmesh, json, math, sys
import numpy as np
from mathutils import Vector, Matrix
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/art200/story';OUT.mkdir(parents=True,exist_ok=True)
TEX=OUT/'textures';TEX.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0

def rgb(hexvalue):return tuple(int(hexvalue[i:i+2],16)/255 for i in [1,3,5])
def linear(color):return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in color)
def flat(name,color,metal=0,rough=.6):
 m=bpy.data.materials.new('A200 '+name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF')
 s.inputs['Base Color'].default_value=(*linear(color),1);s.inputs['Metallic'].default_value=metal;s.inputs['Roughness'].default_value=rough
 return m
def image(name,pixels,color=True):
 h,w,_=pixels.shape;im=bpy.data.images.new(name,width=w,height=h)
 im.colorspace_settings.name='sRGB' if color else 'Non-Color';im.pixels.foreach_set(pixels.ravel())
 im.filepath_raw=str(TEX/(name+'.png'));im.file_format='PNG';im.save()
 loaded=bpy.data.images.load(im.filepath_raw,check_existing=False);loaded.name=name+' packed portable'
 loaded.colorspace_settings.name='sRGB' if color else 'Non-Color';loaded.pack();bpy.data.images.remove(im);return loaded
palette=json.loads((ROOT/'assets/art200/palette.json').read_text())
rng=np.random.default_rng(7201);N=512;y,x=np.mgrid[0:N,0:N]/N
grain=rng.uniform(-1,1,(N,N));field=(np.sin(x*37+np.sin(y*17))*.45+np.sin(y*63)*.25+grain*.3)
roughmap=np.ones((N,N,4),np.float32);roughmap[:,:,0]=1;roughmap[:,:,1]=.61+field*.025;roughmap[:,:,2]=.28
orm=image('story-aged-enamel-ORM',roughmap,False)
normal=np.ones((N,N,4),np.float32);normal[:,:,0]=.5+grain*.012;normal[:,:,1]=.5+np.roll(grain,1,0)*.012
norm=image('story-aged-enamel-Normal',normal,False)
families={}
for p in palette['families']:
 base=np.array(rgb(p['paint']));pixels=np.ones((N,N,4),np.float32);pixels[:,:,:3]=np.clip(base[None,None,:]*(1+field[:,:,None]*.045),0,1)
 im=image('story-'+p['id']+'-Base',pixels)
 m=flat(p['id']+' enamel',rgb(p['paint']),.28,.61);nodes=m.node_tree.nodes;links=m.node_tree.links;s=nodes.get('Principled BSDF')
 t=nodes.new('ShaderNodeTexImage');t.image=im;links.new(t.outputs['Color'],s.inputs['Base Color'])
 t=nodes.new('ShaderNodeTexImage');t.image=orm;sep=nodes.new('ShaderNodeSeparateColor');links.new(t.outputs['Color'],sep.inputs[0]);links.new(sep.outputs[1],s.inputs['Roughness']);links.new(sep.outputs[2],s.inputs['Metallic'])
 t=nodes.new('ShaderNodeTexImage');t.image=norm;n=nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.2;links.new(t.outputs['Color'],n.inputs['Color']);links.new(n.outputs[0],s.inputs['Normal'])
 families[p['id']]={'paint':m,'secondary':flat(p['id']+' service inset',rgb(p['secondary']),.22,.67),'letter':flat(p['id']+' ceramic stencil',rgb(p['letter']),0,.78)}
steel=flat('weathered load steel',rgb(palette['substrates']['steel']),.73,.49)
metal=flat('aged brushed alloy',rgb(palette['substrates']['aged_aluminium']),.82,.35)
dark=flat('vulcanized rubber',rgb(palette['substrates']['rubber']),.02,.87)
rust=flat('local seam oxide',rgb(palette['substrates']['rust']),.12,.88)
cream=families['stone']['secondary'];leaf=flat('dormant grey sage foliage',(.30,.36,.25),0,.84)
glass=flat('smoked instrument glazing',(.16,.22,.23),.24,.26)
clear=flat('aged enclosure glass',(.43,.48,.44),.02,.22);clear.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.24
clear.surface_render_method='DITHERED'
cyan=flat('unlit instrument ink',(.33,.40,.38),.05,.65);amber=flat('ivory gauge needle',(.61,.55,.43),.12,.61)
ochre=families['clay']['paint'];red=families['oxblood']['paint'];paint=families['petrol']['paint']

# Retain the proven metre/UV/bevel primitives, not any existing assembled model.
tree=ast.parse((ROOT/'tools/art/art100_story_robots/build.py').read_text())
names={'xyz','empty','finish','box','tube','cable','ring','profile','text','bolt','badge','feet','panel','dial','radiator','leaf_blade'}
for fn in tree.body:
 if isinstance(fn,ast.FunctionDef) and fn.name in names:exec(compile(ast.Module(body=[fn],type_ignores=[]),'<shared geometry primitives>','exec'))
def cable(n,pts,rad,m,r):
 curve=bpy.data.curves.new(n,'CURVE');curve.dimensions='3D';curve.resolution_u=5;curve.bevel_depth=rad;curve.bevel_resolution=2
 spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(pts)-1)
 coords=[xyz(at) for at in pts]
 for i,p in enumerate(spline.bezier_points):
  at=coords[i];p.co=at;p.handle_left_type=p.handle_right_type='FREE'
  if i==0:tangent=(coords[1]-at)/3
  elif i==len(coords)-1:tangent=(at-coords[i-1])/3
  else:
   a=at-coords[i-1];b=coords[i+1]-at
   tangent=Vector(tuple(math.copysign(min(abs(a[k]),abs(b[k]))/3,a[k]) if a[k]*b[k]>0 else 0 for k in range(3)))
  p.handle_left=at-tangent;p.handle_right=at+tangent
 o=bpy.data.objects.new(n,curve);bpy.context.collection.objects.link(o);o.parent=r;o.data.materials.append(m)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');return o
roots=[];manifest=[];entry=None;P=None;S=None

def root(id,title,family,target,description):
 global entry,P,S,cream
 r=empty('Story2'+id);roots.append(r);P=families[family]['paint'];S=families[family]['secondary'];cream=families[family]['letter']
 entry={'id':r.name,'root':r.name,'title':title,'status':'new','counting_unit':'complete assembled model','paint_family':family,'runtime_target':target,'description':description,'collision_shapes':[],'source':'assets/art200/story/Story200-editable.blend'}
 manifest.append(entry);return r
def B(n,p,d,m,r,solid=False,b=.012):
 o=box(n,p,d,m,r,b)
 if solid:entry['collision_shapes'].append({'type':'box','at':list(p),'size':list(d)})
 return o
def T(n,a,b,rad,m,r,solid=False,N=32):
 o=tube(n,a,b,rad,m,r,N)
 if solid:entry['collision_shapes'].append({'type':'cylinder','a':list(a),'b':list(b),'radius':rad})
 return o
def lathe(n,at,section,m,r,N=48):
 x,y,z=at;vs=[xyz((x+rad*math.cos(i*math.tau/N),y+h,z+rad*math.sin(i*math.tau/N))) for rad,h in section for i in range(N)]
 fs=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(len(section)-1) for i in range(N)]
 mesh=bpy.data.meshes.new(n);mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new(n,mesh);bpy.context.collection.objects.link(o);return finish(o,n,m,r,.003)
def coil(n,at,rad,pitch,turns,thickness,m,r):
 vs=[];fs=[];steps=int(turns*36);sides=10
 for i in range(steps+1):
  angle=i/steps*turns*math.tau;radial=Vector((math.cos(angle),0,math.sin(angle)))
  tangent=Vector((-rad*math.sin(angle),pitch/math.tau,rad*math.cos(angle))).normalized();across=tangent.cross(radial).normalized()
  center=Vector(at)+Vector((rad*math.cos(angle),i/steps*turns*pitch,rad*math.sin(angle)))
  for j in range(sides):vs.append(xyz(center+thickness*(math.cos(j*math.tau/sides)*radial+math.sin(j*math.tau/sides)*across)))
 for i in range(steps):
  for j in range(sides):fs.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
 fs.extend([tuple(reversed(range(sides))),tuple(steps*sides+j for j in range(sides))])
 mesh=bpy.data.meshes.new(n);mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new(n,mesh);bpy.context.collection.objects.link(o);return finish(o,n,m,r)
def plinth(r,w,d,h=.12):B('Grounded load plinth',(0,h/2,0),(w,h,d),steel,r,True,.025)
def legs(r,w,d,h,top=.08):
 for x in [-w/2,w/2]:
  for z in [-d/2,d/2]:
   B('Broad isolation shoe',(x,.025,z),(.17,.05,.17),dark,r,True)
   T('Tubular support leg',(x,.05,z),(x,h,z),.032,steel,r,True)
 B('Folded tray',(0,h+top/2,0),(w+.16,top,d+.16),P,r,True,.024)
def wheel(r,at,rad=.17,width=.10,axis='x'):
 x,y,z=at;v=Vector((width/2,0,0) if axis=='x' else (0,0,width/2));a=Vector(at)-v;b=Vector(at)+v
 T('Solid resilient tyre',a,b,rad,dark,r,True,40);T('Pressed hub',a-v*.03,b+v*.03,rad*.56,metal,r,False,32)
 for sign in [-1,1]:
  q=Vector(at)+v*sign*1.08;T('Axle lock',q,q+v*.13*sign,rad*.18,steel,r)
def vessel(r,at,rad,h,m=None):
 x,y,z=at;m=m or P
 T('Formed pressure shell',(x,y+.08,z),(x,y+h-.07,z),rad,m,r,True,40)
 for yy in [y+.08,y+h-.07]:T('Rolled seam band',(x,yy-.022,z),(x,yy+.022,z),rad*1.035,metal,r)
 lathe('Dished pressure crown',(x,y+h-.07,z),[(rad,0),(rad*.9,.04),(rad*.65,.075),(.025,.09),(0,.09)],m,r)
 for xx in [x-rad*.66,x+rad*.66]:B('Pressure shell foot',(xx,y+.055,z),(.13,.11,rad*.85),steel,r,True)
def wire(r,pts,rad=.013):return cable('Clipped service loom',pts,rad,dark,r)
def hinge(r,at,h=.15):
 x,y,z=at;T('Pinned hinge',(x,y-h/2,z),(x,y+h/2,z),.026,metal,r);B('Hinge mounting leaf',(x+.035,y,z-.012),(.08,h*.8,.028),steel,r)
def vent(r,at,w,h):
 x,y,z=at;B('Recessed ventilation panel',at,(w,h,.015),dark,r)
 for j in range(max(3,int(h/.055))):B('Formed vent louver',(x,y-h*.39+j*.055,z+.017),(w*.86,.02,.022),P,r,b=.003)
def label(r,title,at,w):badge(title,at,w,r)
def globe(r,at,rad,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=rad,location=xyz(at));return finish(bpy.context.object,'Cast spherical joint',m,r)
def flange(r,a,b,rad,m=None):
 T('Flanged coupling',a,b,rad,m or metal,r)
 v=Vector(b)-Vector(a);q=(Vector(a)+Vector(b))/2
 # Small visible captive fastening heads on the public service face.
 if abs(v.z)>abs(v.x) and abs(v.z)>abs(v.y):
  for angle in range(0,360,60):
   aa=math.radians(angle);bolt((q.x+rad*.74*math.cos(aa),q.y+rad*.74*math.sin(aa),max(a[2],b[2])),r,radius=.012)

# WRECK: service evidence and a substantial shelter, all original silhouettes.
r=root('ScoutRepairStand','Dormant scout on a split repair cradle','petrol','wreck-one','A single-track survey courier hangs safely on a visibly bolted maintenance fork; static evidence, no AI.')
plinth(r,1.2,.82,.10)
for x in [-.43,.43]:B('Cradle fork upright',(x,.43,-.06),(.14,.72,.26),steel,r,True)
T('Repair cross axle',(-.54,.68,0),(.54,.68,0),.074,metal,r,True)
wheel(r,(0,.66,0),.33,.24)
B('Folded scout upper hull',(0,1.01,0),(.66,.36,.53),P,r,True,.07)
B('Replaceable face shroud',(0,1.08,.29),(.52,.16,.08),S,r)
for x in [-.14,.14]:T('Unlit optical well',(x,1.10,.30),(x,1.10,.36),.067,glass,r)
T('Survey neck',(0,1.19,0),(0,1.45,0),.047,metal,r,True)
B('Narrow survey head',(0,1.49,.02),(.37,.15,.27),P,r,True,.05)
wire(r,[(-.29,.95,-.1),(-.37,.72,-.16),(-.34,.38,-.20),(0,.2,-.2)])
label(r,'SCOUT / SERVICE 04',(0,.055,.416),.78)
for x in [-.47,.47]:bolt((x,.101,.27),r,'Y',.02)

r=root('CargoManifestLectern','Cargo record suitcase lectern','oxblood','wreck-one','An opened itinerary case holds stamped cargo tags and paper evidence on a connected reading pedestal.')
plinth(r,.76,.61,.08);T('Offset reader pedestal',(-.16,.08,0),(-.16,.82,0),.10,steel,r,True)
B('Case lower tray',(0,.87,0),(.89,.16,.62),P,r,True,.045)
B('Raised rear lid',(0,1.23,-.24),(.89,.60,.07),P,r,True,.045)
B('Linen record insert',(0,1.24,-.193),(.75,.46,.012),S,r)
for j in range(5):B('Stamped route divider',(-.20+j*.1,1.24,-.183),(.07,.33,.01),cream,r)
for x in [-.31,.31]:hinge(r,(x,.96,-.22),.09)
for j in range(3):B('Filed consignment card',(-.18+j*.14,.964+j*.003,.06),(.18,.009,.28),cream,r)
wire(r,[(-.40,.94,-.17),(-.40,1.1,-.13),(-.40,1.34,-.22)],.018)
label(r,'CARGO / ROUTE REGISTER',(0,.867,.319),.69)

r=root('SplitDriveAxle','Recovered split differential axle','clay','wreck-one','A heavy differential with one opened hub and a broken drive stub rests on permanent recovery shoes.')
for x in [-.82,.82]:B('Axle recovery shoe',(x,.10,0),(.34,.20,.64),steel,r,True,.035)
T('Long drive casing',(-1.09,.43,0),(1.09,.43,0),.15,P,r,True,40)
globe(r,(0,.43,0),.34,P);entry['collision_shapes'].append({'type':'sphere','at':[0,.43,0],'radius':.34})
for x in [-1.05,1.05]:T('Braked wheel hub',(x-.11,.43,0),(x+.11,.43,0),.36,metal,r,True,48)
T('Exposed torsion spline',(-1.47,.43,0),(-1.15,.43,0),.092,steel,r,True)
for j in range(12):
 a=j*math.tau/12;T('Axle spline ridge',(-1.45,.43+math.cos(a)*.088,math.sin(a)*.088),(-1.19,.43+math.cos(a)*.088,math.sin(a)*.088),.009,metal,r,N=10)
flange(r,(0,.43,.25),(0,.43,.40),.21)
label(r,'DRIVE / ISOLATED',(0,.47,.415),.31)

r=root('EmergencyShadeStation','Emergency rest canopy and supply bench','denim','wreck-one','A low fabric shade stretched on two continuous curved frames shelters a fixed rest bench and water box.')
for x in [-1.15,1.15]:
 for z in [-.73,.73]:B('Canopy anchored foot',(x,.035,z),(.27,.07,.25),steel,r,True)
 for z in [-.64,.64]:T('Canopy upright',(x,.07,z),(x,2.16,z),.052,steel,r,True)
 wire(r,[(x,2.08,-.64),(x,2.35,0),(x,2.08,.64)],.057)
T('Roof ridge',(-1.15,2.34,0),(1.15,2.34,0),.035,metal,r)
for z in [-.64,.64]:T('Eave tension spar',(-1.15,2.1,z),(1.15,2.1,z),.032,steel,r)
vs=[xyz((x,2.10+.24*(1-abs(z/.65)),z)) for x in [-1.24,1.24] for z in [-.68,-.34,0,.34,.68]]
mesh=bpy.data.meshes.new('Tensioned canopy cloth');mesh.from_pydata(vs,[],[(i,i+1,i+6,i+5) for i in range(4)]);mesh.update();o=bpy.data.objects.new('Tensioned weather cloth',mesh);bpy.context.collection.objects.link(o);finish(o,o.name,P,r)
mod=o.modifiers.new('Fabric thickness','SOLIDIFY');mod.thickness=.008;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
for x in [-.76,.76]:B('Bench support',(x,.22,-.35),(.17,.44,.39),steel,r,True)
for z in [-.52,-.35,-.18]:B('Ash composite bench slat',(0,.465,z),(1.86,.065,.15),S,r,True)
B('Captive emergency water box',(.68,.69,-.33),(.42,.38,.34),P,r,True,.04)
label(r,'REST / WATER / CHECK IN',(0,2.05,.67),1.58)

# FOUNDRY: robot fabrication machinery with distinct functional massing.
r=root('ServoPress','Open-throat servo forging press','oxblood','relay-foundry','A substantial C-frame press exposes a realistic work throat, ram guide and reaction bed.')
plinth(r,1.62,1.22,.16)
for x in [-.49,.49]:
 profile('Continuous C reaction cheek',[(x-.15,.15),(x-.15,2.5),(x+.17,2.5),(x+.17,2.15),(x+.02,2.15),(x+.02,.7),(x+.17,.7),(x+.17,.15)],-.21,.66,P,r)
 B('Rear reaction column',(x,1.26,-.34),(.31,2.24,.39),P,r,True,.028)
B('Upper ram bridge',(0,2.31,-.04),(1.28,.40,.93),P,r,True,.05)
B('Fixed reaction bed',(0,.58,.04),(1.37,.29,.91),steel,r,True,.04)
T('Polished servo ram',(0,1.29,.1),(0,2.17,.1),.135,metal,r,True)
B('Ram tool shoe',(0,1.23,.1),(.62,.14,.53),steel,r,True,.025)
vessel(r,(.98,0,-.24),.20,1.41,S)
wire(r,[(.98,1.46,-.2),(.84,1.84,-.28),(.53,2.25,-.28)],.037)
B('Connected control-panel stay',(-.50,1.14,.245),(.08,.08,.29),metal,r)
panel(r,(-.50,1.14,.395),.33,.28);label(r,'SERVO / REACTION 12',(0,2.32,.44),.96)

r=root('LimbAssemblyJig','Twin-joint robot limb alignment jig','celadon','relay-foundry','An asymmetric robot forearm and hand are mechanically pinned to a wheeled repair jig, not a new enemy.')
for x in [-.62,.62]:
 for z in [-.37,.37]:wheel(r,(x,.12,z),.12,.08)
B('Mobile jig load frame',(0,.30,0),(1.28,.17,.75),steel,r,True)
for x in [-.44,.44]:B('Adjustable jig upright',(x,.69,-.10),(.10,.77,.13),metal,r,True)
B('Limb fixture bridge',(0,1.08,-.1),(1.03,.09,.16),steel,r,True)
T('Forearm structural shaft',(-.45,1.16,0),(.25,1.16,0),.085,steel,r,True)
B('Forearm cast cover',(-.14,1.20,0),(.66,.24,.29),P,r,True,.075)
T('Wrist bearing',(.25,1.16,0),(.44,1.16,0),.14,metal,r)
B('Service hand palm',(.52,1.16,0),(.24,.17,.28),P,r,True,.04)
for z in [-.1,0,.1]:
 T('Folded manipulator digit',(.61,1.16,z),(.78,1.09,z),.028,metal,r)
 T('Rounded grip end',(.78,1.09,z),(.79,1.02,z),.026,dark,r)
for x in [-.42,.21]:B('Jig hold-down clamp',(x,1.335,0),(.09,.05,.39),S,r)
label(r,'LIMB / ALIGNMENT',(0,.41,.39),.95)
wire(r,[(-.34,1.28,-.12),(-.52,.85,-.22),(-.31,.4,-.23)],.018)

r=root('QuenchManifold','Three-bank quench and return manifold','slate','relay-foundry','Three unequal vessels connect through a continuous return manifold and a guarded manual bypass.')
plinth(r,1.9,.9,.10)
for x,h,rad in [(-.59,1.7,.23),(0,1.34,.26),(.61,1.48,.23)]:
 vessel(r,(x,.10,0),rad,h,P if x else S)
 T('Quench return branch',(x,.47,.10),(x,.47,.39),.045,metal,r)
 dial(r,(x,1.00,rad+.01),.068)
T('Continuous return header',(-.75,.47,.39),(.82,.47,.39),.055,steel,r,True)
for x in [-.56,.58]:flange(r,(x,.47,.38),(x,.47,.44),.083)
label(r,'QUENCH / CLOSED RETURN',(0,.14,.464),1.43)
wire(r,[(-.60,1.82,0),(-.60,2.04,0),(.61,2.04,0),(.61,1.59,0)],.031)

r=root('MagneticSortingDrum','Hand-fed magnetic salvage separator','umber','relay-foundry','A broad horizontal sorting drum turns inside a supported capture frame with separate feed and discharge trays.')
legs(r,1.10,.68,.62)
for x in [-.54,.54]:B('Drum bearing cheek',(x,1.05,0),(.13,.74,.65),P,r,True,.04)
T('Sorting drum',(-.50,1.16,0),(.50,1.16,0),.37,metal,r,True,48)
for j in range(10):
 a=j*math.tau/10;T('Raised separation rib',(-.47,1.16+.373*math.cos(a),.373*math.sin(a)),(.47,1.16+.373*math.cos(a),.373*math.sin(a)),.021,steel,r,N=12)
B('Lower discharge tray',(0,.77,.47),(1.04,.07,.63),S,r,True)
for x in [-.50,.50]:B('Discharge retaining lip',(x,.86,.48),(.045,.16,.62),P,r)
B('Hopper backstop',(0,1.61,-.36),(.94,.27,.065),P,r,True)
for x in [-.45,.45]:B('Connected hopper retaining stay',(x,1.51,-.35),(.055,.40,.08),steel,r)
T('Crank axle',(.58,1.16,0),(.75,1.16,0),.048,metal,r)
T('Manual crank arm',(.75,1.16,0),(.75,1.40,0),.025,metal,r)
T('Insulated crank grip',(.75,1.40,0),(.93,1.40,0),.038,dark,r)
B('Identification cross stay',(0,.43,.397),(1.14,.12,.10),P,r)
label(r,'FERROUS / SORT 03',(0,.43,.434),.78)

# QUIET ARRAY: receiver archaeology and readable radio silhouettes.
r=root('AzimuthTrackingDish','Offset azimuth listening dish','petrol','quiet-array','A deep dished reflector on a real fork gimbal, counterweight, elevation axle and anchored pedestal.')
plinth(r,1.27,1.06,.14)
T('Bolted azimuth pedestal',(0,.14,0),(0,1.45,0),.15,P,r,True)
T('Azimuth bearing',(0,1.19,0),(0,1.45,0),.26,metal,r)
for x in [-.51,.51]:B('Continuous dish support fork',(x,1.75,-.06),(.12,.96,.21),steel,r,True)
T('Elevation axle',(-.63,2.06,-.03),(.63,2.06,-.03),.068,metal,r,True)
q=empty('Reflector gimbal',(0,2.04,.03),r)
# Lathe about Y, then rotate dish axis to face +Z with a restrained upward tilt.
o=lathe('Spun parabolic reflector',(0,0,0),[(0,-.20),(.18,-.18),(.4,-.12),(.67,0),(.85,.13),(.89,.17),(.895,.185),(.875,.185),(.83,.14),(.64,.02),(.39,-.10),(.17,-.165),(0,-.17)],S,q,64)
q.rotation_euler.x=math.radians(68)
for x in [-.48,.48]:T('Reflector feed brace',(x,2.15,.24),(0,2.18,.85),.019,steel,r)
T('Feed horn',(0,2.18,.72),(0,2.18,.91),.081,P,r)
B('Elevation counterweight',(0,1.82,-.39),(.44,.25,.29),P,r,True,.04)
wire(r,[(0,2.04,-.22),(.22,1.70,-.20),(.20,.71,-.18),(0,.26,-.14)],.018)
entry['collision_shapes'].append({'type':'box','at':[0,2.12,.08],'size':[1.74,1.78,.63]})
label(r,'LISTEN / AZIMUTH',(0,.49,.157),.26)

r=root('FerriteTuningBench','Ferrite lattice tuning workbench','plum','quiet-array','A row of supported adjustable ferrite coils shares a grounded bench with an analog comparison bridge.')
legs(r,1.42,.61,.77)
for x in [-.45,-.15,.15,.45]:
 T('Ferrite ceramic former',(x,.86,-.06),(x,1.34,-.06),.065,S,r,True)
 coil('Continuous ferrite winding',(x,.91,-.06),.075,.054,6,.011,metal,r)
 T('Tuning slug',(x,1.3,-.06),(x,1.43,-.06),.025,steel,r)
 B('Guarded tuning thumbwheel',(x,1.435,-.06),(.10,.034,.09),P,r)
B('Bridge instrument housing',(0,.99,.27),(1.21,.27,.16),P,r,True)
for x in [-.39,0,.39]:dial(r,(x,1.015,.357),.087)
B('Bench identification cross stay',(0,.64,.35),(1.45,.14,.08),P,r)
label(r,'REFERENCE / FERRITE',(0,.64,.39),1.03)
wire(r,[(-.56,.89,-.14),(-.65,.95,-.14),(-.65,.89,.22)],.018)

r=root('ReceiverRepairBot','Folded three-foot receiver custodian','celadon','quiet-array','A dormant receiver custodian braces itself on three articulated feet; a folded tool visibly connects to the body.')
for x,z in [(-.45,.32),(.45,.32),(0,-.48)]:
 B('Custodian foot',(x,.035,z),(.26,.07,.29),dark,r,True,.04)
 T('Articulated lower support',(x,.055,z),(x*.7,.46,z*.7),.055,metal,r,True)
 T('Upper tripod support',(x*.7,.46,z*.7),(x*.26,.69,z*.26),.075,P,r,True)
 globe(r,(x*.7,.46,z*.7),.077,steel)
T('Receiver bot body',(0,.60,0),(0,1.20,0),.29,P,r,True,48)
lathe('Domed custodian crown',(0,1.2,0),[(.29,0),(.26,.10),(.16,.18),(0,.22)],S,r)
panel(r,(0,1.06,.284),.36,.21)
T('Articulated tool shoulder',(-.29,.99,0),(-.45,.99,0),.08,metal,r)
T('Folded service arm',(-.45,.99,0),(-.49,.63,.17),.052,P,r,True)
T('Attached service claw',(-.49,.63,.17),(-.36,.66,.23),.036,metal,r)
wire(r,[(-.27,.92,-.06),(-.51,.88,.06),(-.48,.66,.17)],.016)
label(r,'CUSTODIAN / 09',(0,.77,.291),.43)

r=root('CableRoutingArch','Open cable routing portal','denim','quiet-array','A deliberately walkable 2.4 metre clear cable portal carries four continuous insulated runs above head height.')
for x in [-1.30,1.30]:
 B('Portal load foot',(x,.065,0),(.41,.13,.60),steel,r,True,.027)
 B('Portal vertical rail',(x,1.47,0),(.15,2.82,.25),P,r,True,.023)
 for y in [.24,1.12,2.1]:B('Attached service cleat',(x,y,.18),(.19,.13,.14),S,r)
B('Overhead carrier',(0,2.84,0),(2.80,.21,.34),P,r,True,.024)
for z in [.20,.265,.330,.395]:
 cable('Continuous overhead cable',[(-1.30,.15,z),(-1.30,2.47,z),(-1.13,2.78,z),(1.13,2.78,z),(1.30,2.47,z),(1.30,.15,z)],.026,dark,r)
for x in [-1.3,1.3]:
 for y in [.24,1.12,2.1,2.72]:B('Bundle retaining stand-off',(x,y,.29),(.19,.045,.29),metal,r)
for x in [-.90,-.45,0,.45,.90]:B('Clipped cross strap',(x,2.86,0),(.042,.045,.46),metal,r)
label(r,'ROUTE / KEEP PASSAGE CLEAR',(0,2.85,.181),1.78)
entry['clear_opening_m']={'width':2.45,'height':2.735}

# ORCHARD: functional propagation hardware and human-scale civilian evidence.
r=root('PneumaticSeedSorter','Twin-hopper pneumatic seed classifier','verdigris','glass-orchard','Two gravity hoppers feed a glazed separator and a pair of captured collection drawers.')
legs(r,.99,.62,.62)
for x in [-.29,.29]:
 lathe('Spun seed hopper',(x,1.03,-.02),[(.09,0),(.09,.14),(.22,.38),(.24,.55),(.24,.58),(.215,.58),(.215,.40),(.07,.14),(.07,0)],P,r)
 T('Hopper throat',(x,.71,-.02),(x,1.05,-.02),.086,metal,r,True)
 entry['collision_shapes'].append({'type':'cylinder','a':[x,1.03,-.02],'b':[x,1.60,-.02],'radius':.24})
B('Classifier body',(0,.93,.26),(1.05,.43,.30),S,r,True,.04)
for x in [-.27,.27]:B('Captured seed drawer',(x,.51,.29),(.42,.19,.27),P,r,True);B('Drawer pull',(x,.53,.45),(.18,.027,.032),metal,r)
for x in [-.27,.27]:panel(r,(x,.965,.419),.32,.20)
wire(r,[(-.44,.83,-.26),(-.64,1.20,-.23),(-.43,1.45,-.20)],.035)
label(r,'VIABLE / HUSK',(0,.775,.419),.81)

r=root('ClimateBellChamber','Botanical climate bell enclosure','stone','glass-orchard','A clear bell enclosure protects a small living specimen on a continuously supported cultivation pedestal.')
plinth(r,.94,.94,.10);T('Cylindrical climate cabinet',(0,.10,0),(0,.60,0),.36,P,r,True,48)
ring('Bell receiving seat',(0,.63,0),.44,.34,.10,metal,r,48)
lathe('Curved clear climate bell',(0,.68,0),[(.39,0),(.39,.62),(.35,.84),(.25,1.0),(.09,1.10),(0,1.12)],clear,r,64)
entry['collision_shapes'].append({'type':'cylinder','a':[0,.65,0],'b':[0,1.81,0],'radius':.39})
T('Specimen pot',(0,.65,0),(0,.85,0),.19,S,r,True)
T('Rooted specimen stem',(0,.84,0),(0,1.39,0),.018,leaf,r)
for j in range(8):leaf_blade((0,.89+j*.06,0),(math.cos(j*2.4),.10,math.sin(j*2.4)),.22,.057,r)
for angle in range(0,360,120):
 a=math.radians(angle);x=.405*math.cos(a);z=.405*math.sin(a);T('External bell guard',(x,.65,z),(x,1.45,z),.018,metal,r)
dial(r,(0,.38,.362),.077);label(r,'CULTURE / 17',(0,.17,.367),.41)

r=root('FamilyMemorialTableau','Family waiting bench and planted memorial','rose','glass-orchard','A modest bench holds a weathered family nameplate and three planted keepsake containers, civilian environmental storytelling.')
for x in [-.64,.64]:B('Bench cast support',(x,.225,0),(.15,.45,.51),steel,r,True,.027)
for z in [-.18,0,.18]:B('Restored composite bench slat',(0,.485,z),(1.65,.07,.165),S,r,True)
for x in [-.70,.70]:T('Bench back upright',(x,.34,-.25),(x,.98,-.25),.034,steel,r,True)
for y in [.73,.91]:B('Backrest slat',(0,y,-.25),(1.53,.13,.05),P,r,True)
label(r,'SERA / IVO / NELL',(0,.915,-.216),1.16)
for i in range(3):
 x=-.36+i*.34;T('Keepsake planter',(x,.52,.02),(x,.73,.02),.125,P if i!=1 else S,r,True)
 T('Rooted keepsake plant',(x,.72,.02),(x,.93,.02),.008,leaf,r)
 for j in range(3):leaf_blade((x,.76+j*.045,.02),((-1)**j,.08,.36),.13,.034,r)

r=root('RootIrrigationCart','Manual root irrigation carriage','olive','glass-orchard','A compact broad-wheel carriage connects a horizontal water tank, pressure gauge and continuously wound delivery hose.')
for x in [-.46,.46]:
 for z in [-.39,.39]:wheel(r,(x,.18,z),.18,.10)
B('Cart bearer frame',(0,.28,0),(.88,.11,.91),steel,r,True)
T('Horizontal irrigation tank',(0,.62,-.36),(0,.62,.36),.30,P,r,True,48)
for z in [-.27,.27]:
 T('Tank cradle post',(0,.29,z),(0,.41,z),.16,steel,r,True)
 flange(r,(0,.62,z-.025),(0,.62,z+.025),.315,metal)
for x in [-.39,.39]:T('Continuous cart handle',(x,.27,-.43),(x,1.12,-.54),.029,metal,r,True)
T('Padded push bar',(-.39,1.12,-.54),(.39,1.12,-.54),.036,dark,r)
B('Connected hose receiving saddle',(0,.932,0),(.48,.025,.48),metal,r)
coil('Continuous captured irrigation hose',(0,.946,0),.209,.029,4,.012,dark,r)
wire(r,[(.209,1.062,0),(.33,.90,.14),(.20,.73,.33)],.017)
dial(r,(0,.73,.367),.084);label(r,'ROOT / HAND PRESSURE',(0,.46,.373),.45)

# MERIDIAN: archival civic objects and a recognizable disabled patrol machine.
r=root('ArchiveReelLibrary','Six-reel indexed archive library','plum','last-garden-meridian','Individual open reel cartridges rest in supported bays of a tall lockable archive frame.')
plinth(r,1.30,.68,.09)
for x in [-.58,.58]:B('Archive upright',(x,1.1,0),(.10,2.11,.59),P,r,True)
for y in [.32,.94,1.56,2.15]:B('Reel bay shelf',(0,y,0),(1.18,.07,.59),steel,r,True)
for y in [.63,1.25,1.86]:
 for x in [-.28,.28]:
  T('Closed archival spindle',(x,y,-.22),(x,y,.20),.115,dark,r,True)
  for z in [-.18,.17]:
   T('Perforated reel cheek',(x,y,z-.025),(x,y,z+.025),.245,S,r)
   T('Reel lock boss',(x,y,z+.02),(x,y,z+.05),.062,metal,r)
   for a in range(0,360,90):
    aa=math.radians(a);T('Reel index recess',(x+.16*math.cos(aa),y+.16*math.sin(aa),z+.026),(x+.16*math.cos(aa),y+.16*math.sin(aa),z+.031),.034,dark,r,N=20)
  B('Reel receiving shoe',(x,y-.275,0),(.30,.09,.44),P,r,True)
B('Archive identification cross stay',(0,.15,.30),(1.18,.13,.10),P,r)
label(r,'COMMON MEMORY / 6 REELS',(0,.15,.354),1.05)

r=root('PassengerBaggageTrolley','Abandoned passenger luggage trolley','umber','last-garden-meridian','Stacked civilian luggage is strapped to a connected two-wheel terminal trolley; no collectible promises.')
for x in [-.43,.43]:wheel(r,(x,.21,-.22),.21,.11)
for x in [-.34,.34]:
 B('Standing toe foot',(x,.035,.34),(.14,.07,.17),dark,r,True)
 T('Load-bearing standing toe stay',(x,.06,.34),(x,.19,.34),.028,metal,r,True)
 T('Trolley continuous rail',(x,.19,.37),(x,.19,-.26),.034,metal,r,True)
 T('Trolley back rail',(x,.19,-.26),(x,1.43,-.26),.034,metal,r,True)
T('Trolley push grip',(-.34,1.43,-.26),(.34,1.43,-.26),.042,dark,r)
B('Lower travel trunk',(0,.48,.02),(.80,.55,.60),P,r,True,.05)
B('Upper travel case',(-.05,.97,0),(.66,.42,.47),S,r,True,.05)
for x in [-.22,.22]:B('Continuous luggage retaining belt',(x,.70,.337),(.055,1.02,.024),dark,r)
for y in [.49,.95]:B('Cast luggage handle',(0,y,.338 if y<.7 else .25),(.19,.045,.041),metal,r)
label(r,'BERTH 07 / RETURN',(0,1.10,.246),.46)

r=root('DeadPatrolTorso','Disabled patrol torso recovery scene','slate','last-garden-meridian','An original mechanical patrol torso lies on a secured pallet with a detached leg laid beside it; static wreck, no enemy AI.')
for x in [-.57,.57]:B('Ground recovery skid',(x,.055,0),(.16,.11,1.55),steel,r,True)
for z in [-.64,-.21,.21,.64]:B('Recovery pallet slat',(0,.15,z),(1.42,.08,.26),S,r,True)
B('Fallen patrol chest',(0,.43,-.22),(.73,.45,.62),P,r,True,.09)
B('Closed segmented abdomen',(0,.35,.19),(.44,.25,.23),steel,r,True,.045)
T('Broken pelvic pin',(-.31,.34,.41),(.31,.34,.41),.085,metal,r,True)
B('Patrol head',(0,.44,-.69),(.31,.26,.27),P,r,True,.08)
B('Unlit directional visor',(0,.586,-.67),(.23,.03,.12),glass,r)
for x in [-.54,.54]:
 T('Shoulder bearing',(x*.63,.44,-.30),(x,.44,-.30),.115,metal,r)
 T('Laid-down upper arm',(x,.40,-.27),(x,.34,.08),.085,P,r,True)
 T('Laid-down lower arm',(x,.34,.08),(x*.8,.31,.32),.067,metal,r,True)
T('Detached recovered leg',(-.45,.29,.57),(.37,.29,.57),.086,P,r,True)
B('Recovered mechanical foot',(.48,.28,.57),(.25,.16,.30),steel,r,True,.035)
wire(r,[(0,.39,.25),(.14,.29,.34),(.26,.25,.43)],.023)
label(r,'PATROL / POWER ISOLATED',(0,.198,.778),1.01)

r=root('SignalVerificationGate','Walkable signal verification portal','heather','last-garden-meridian','Two differentiated receiver pylons join above a clear pedestrian opening; powered states remain story-controlled elsewhere.')
for x in [-1.40,1.40]:
 B('Portal foundation shoe',(x,.06,0),(.50,.12,.69),steel,r,True,.032)
 B('Receiver gate pylon',(x,1.40,0),(.33,2.70,.44),P,r,True,.075)
 B('Recessed sensor strip',(x,1.57,.239),(.16,1.57,.026),dark,r)
 for y in [.88,1.24,1.60,1.96,2.32]:B('Passive receiver element',(x,y,.261),(.11,.10,.018),S,r)
B('Gate top bridge',(0,2.72,0),(2.95,.24,.42),P,r,True,.055)
label(r,'MERIDIAN / VERIFY THEN WELCOME',(0,2.73,.222),2.38)
entry['clear_opening_m']={'width':2.47,'height':2.60}

# CIVIC / RECEIVING: purposeful domestic equipment, not only military hardware.
r=root('JourneyCartographyTable','Circular route cartography table','petrol','meridian-berth','A round chart table carries physical route grooves, pinned waypoints and a restrained mechanical azimuth dial.')
T('Circular anchored foot',(0,0,0),(0,.10,0),.49,steel,r,True,48)
T('Fluted map pedestal',(0,.10,0),(0,.89,0),.15,P,r,True)
T('Map table rim',(0,.86,0),(0,.97,0),.74,P,r,True,64)
T('Matte map inset',(0,.969,0),(0,.977,0),.678,S,r,N=64)
for j,rad in enumerate([.23,.41,.58]):ring('Etched range guide',(0,.980,0),rad,rad-.004,.002,dark,r,64)
pts=[(-.46,.987,.26),(-.26,.987,.12),(-.16,.987,-.12),(.13,.987,-.19),(.29,.987,-.35),(.48,.987,-.24)]
cable('Inlaid journey route',pts,.009,dark,r)
for j,at in enumerate(pts):T('Pinned named waypoint',at,(at[0],1.02,at[2]),.018,metal,r,N=16)
for a in range(0,360,30):
 aa=math.radians(a);T('Rim index',(math.cos(aa)*.66,.982,math.sin(aa)*.66),(math.cos(aa)*.69,.982,math.sin(aa)*.69),.005,cream,r,N=8)
label(r,'JOURNEY / COMMON ROUTE',(0,.74,.151),.26)

r=root('DormantStewardCradle','Dormant civic steward charging berth','celadon','meridian-berth','A small service robot rests in an unmistakable two-pad charging cradle, with folded arms and no active AI.')
plinth(r,.90,.81,.11)
B('Rear charging spine',(0,.69,-.30),(.44,1.16,.13),P,r,True,.035)
for x in [-.22,.22]:
 B('Steward broad foot',(x,.17,.05),(.25,.12,.35),dark,r,True,.04)
 T('Steward leg',(x,.23,0),(x,.58,0),.078,metal,r,True)
B('Rounded civic body',(0,.86,0),(.59,.59,.41),S,r,True,.11)
B('Steward sensor head',(0,1.30,.01),(.40,.25,.34),P,r,True,.095)
T('Head collar',(0,1.13,0),(0,1.22,0),.084,metal,r)
for x in [-.10,.10]:T('Unlit rounded optic',(x,1.31,.173),(x,1.31,.192),.044,glass,r)
for x in [-.35,.35]:
 T('Folded civic upper arm',(x*.80,.98,0),(x,.73,.03),.065,P,r,True)
 T('Folded civic lower arm',(x,.73,.03),(x*.44,.75,.25),.052,metal,r,True)
label(r,'STEWARD / REST 02',(0,.055,.411),.61)
wire(r,[(0,.95,-.24),(.15,.62,-.22),(0,.21,-.24)],.026)

r=root('CommunalGalleyModule','Compact communal hot-water galley','clay','glass-orchard','An original domestic service module combines a sheltered hot plate, connected kettle and six captured cup hooks.')
plinth(r,1.66,.66,.09);B('Galley cabinet',(0,.53,0),(1.55,.90,.58),P,r,True,.04)
B('Wipeable worktop',(0,1.01,0),(1.65,.08,.69),S,r,True,.025)
for x in [-.52,0,.52]:
 B('Inset galley door',(x,.54,.307),(.46,.72,.028),P,r)
 B('Galley drawer pull',(x,.84,.339),(.21,.023,.032),metal,r)
for x in [-.73,.73]:T('Splashback upright',(x,1.05,-.27),(x,1.85,-.27),.027,steel,r)
B('Hanging utensil crossbar',(0,1.76,-.26),(1.5,.10,.10),P,r,True)
for i in range(6):
 x=-.57+i*.225;wire(r,[(x,1.76,-.2),(x,1.67,-.18),(x,1.64,-.08)],.012)
 T('Captured cup',(x,1.52,-.07),(x,1.65,-.07),.056,S,r)
T('Hotplate',(0.41,1.05,0),(.41,1.08,0),.24,steel,r)
vessel(r,(.41,1.08,0),.16,.34,metal)
wire(r,[(.26,1.31,0),(.22,1.58,0),(.58,1.58,0),(.56,1.31,0)],.023)
B('Collective ration tin',(-.43,1.18,.04),(.38,.27,.32),S,r,True,.045)
label(r,'COMMON TABLE / SHARE WATER',(0,1.76,-.20),1.19)

r=root('MissionPlaqueRack','Civic work-order and dedication board','rose','meridian-berth','A freestanding civic board carries six individual engraved work plaques, supported by a splayed frame.')
for x in [-.47,.47]:
 B('Splayed sign foot',(x,.045,0),(.23,.09,.66),steel,r,True)
 T('Board support post',(x,.09,-.04),(x,1.75,-.04),.041,steel,r,True)
B('Work-order backing',(0,1.21,0),(1.07,1.10,.10),P,r,True,.04)
for i,txt in enumerate(['HOLD THE LINE','RETURN THE SEEDS','RESTORE THE RELAY','CARRY THE MEMORY','WELCOME THE LOST','KEEP MOVING']):
 y=1.62-i*.164;B('Individual civic plaque',(0,y,.064),(.93,.135,.029),S,r)
 engraving=text(txt,(0,y,.081),.035,r);engraving.data.materials[0]=steel
 for x in [-.43,.43]:bolt((x,y,.082),r,radius=.008)
B('Civic board lower cross stay',(0,.48,-.005),(1.00,.13,.085),P,r)
label(r,'COMMON WORK / 06',(0,.48,.04),.88)

r=root('WaterReclamationStill','Paired civic water reclamation still','verdigris','relay-foundry','Two physically connected vessels exchange condensate through a wound cooling coil and a supported collection spout.')
plinth(r,1.48,.81,.09);vessel(r,(-.40,.09,0),.29,1.13,P);vessel(r,(.42,.09,0),.24,.84,S)
T('Primary vapour riser',(-.40,1.25,0),(-.40,1.68,0),.042,metal,r,True)
wire(r,[(-.4,1.66,0),(-.2,1.78,0),(.40,1.78,0),(.40,1.64,0)],.043)
coil('Continuous condenser helix',(.42,1.05,0),.143,.073,7,.017,metal,r)
cable('Condenser inlet connection',[(.40,1.64,0),(.563,1.64,0),(.563,1.561,0)],.017,metal,r)
cable('Condenser outlet connection',[(.563,1.05,0),(.563,.97,0),(.42,.94,0)],.017,metal,r)
T('Cooling coil return',(.42,.93,0),(.42,1.64,0),.048,metal,r,True)
T('Collection spout',(.42,.35,.19),(.42,.35,.40),.034,metal,r)
for x in [-.40,.42]:dial(r,(x,.72,.296 if x<0 else .246),.067)
B('Water identification load rail',(0,.15,.37),(1.42,.14,.10),P,r)
label(r,'CLEAN RETURN / SHARED WATER',(0,.15,.419),1.21)

# Portable UVs, explicit tangent topology, grounded bounds and dimensional record.
assert len(roots)==25 and len({r.name for r in roots})==25
for o in [o for o in bpy.data.objects if o.type=='MESH']:
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001);bm.to_mesh(o.data);bm.free()
 if not o.data.uv_layers:
  bm=bmesh.new();bm.from_mesh(o.data);uv=bm.loops.layers.uv.new('Metre planar UV')
  for face in bm.faces:
   normal=face.normal;axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis]
   for loop in face.loops:loop[uv].uv=(loop.vert.co[axes[0]],loop.vert.co[axes[1]])
  bm.to_mesh(o.data);bm.free()
for r,e in zip(roots,manifest):
 meshes=[o for o in r.children_recursive if o.type=='MESH'];pts=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
 lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
 e['bounds_min']=[round(lo[0],5),round(lo[2],5),round(-hi[1],5)];e['bounds_max']=[round(hi[0],5),round(hi[2],5),round(-lo[1],5)]
 e['dimensions_m']=[round(e['bounds_max'][i]-e['bounds_min'][i],5) for i in range(3)]
 for o in meshes:o.data.calc_loop_triangles()
 e['triangles']=sum(len(o.data.loop_triangles) for o in meshes);e['editable_parts']=len(meshes);e['materials']=sorted({m.name for o in meshes for m in o.data.materials})
 e['collision']='authored compound primitives; open space and round silhouettes retained'
 if abs(e['bounds_min'][1])>.015:raise RuntimeError(e['id']+' is not grounded: '+str(e['bounds_min']))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Story200-editable.blend'),compress=True)
for r in roots:
 # Apply child-group transforms before joining so reflector orientation stays exact.
 children=[o for o in r.children_recursive if o.type=='MESH']
 for o in children:matrix=o.matrix_world.copy();o.parent=r;o.matrix_world=matrix
 for mat in bpy.data.materials:
  batch=[o for o in r.children if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
  if not batch:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in batch:o.select_set(True)
  bpy.context.view_layer.objects.active=batch[0]
  if len(batch)>1:bpy.ops.object.join()
  bpy.context.object.name=r.name+'__'+mat.name
for o in [o for o in bpy.data.objects if o.type=='MESH']:
 bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Portable tangent topology','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.select_all(action='SELECT')
target=ROOT/'godot/art/art200-story.glb'
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_animations=False,export_tangents=True,export_cameras=False,export_lights=False)
sys.path.insert(0,str(ROOT/'tools/art/native_enemies'));from repair_tangents import repair
print('REPAIRED_TANGENTS',repair(target),flush=True)
for e,r in zip(manifest,roots):e['runtime_meshes']=sum(o.type=='MESH' for o in r.children_recursive)
data={'count':25,'new':25,'refined':0,'units':'metres','palette':'assets/art200/palette.json','models':manifest}
(OUT/'manifest.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
(ROOT/'godot/art/art200-story-manifest.json').write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Story200-runtime.blend'),compress=True)
print('ART200_STORY_COMPLETE',len(roots),sum(e['triangles'] for e in manifest),flush=True)
