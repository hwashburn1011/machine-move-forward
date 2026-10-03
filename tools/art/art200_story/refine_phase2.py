"""Deliberate second-pass details for all 25 old and 25 new story assemblies.

Run with Blender --background --threads 4 --python ... -- new|old.
Phase-one sources are immutable inputs; repeated runs are deterministic.
"""
import bpy,bmesh,ast,json,math,sys,shutil
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[3];NEW=R/'assets/art200/story';OLD=R/'assets/art100/story-robots'
mode=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'new'
O=NEW if mode=='new' else OLD
base='Story200' if mode=='new' else 'StoryRobots'
baseline=O/('phase1' if mode=='new' else 'art200-before');baseline.mkdir(exist_ok=True)
for name in [base+'-editable.blend','manifest.json']:
 if not (baseline/name).exists():shutil.copy2(O/name,baseline/name)
bpy.ops.wm.open_mainfile(filepath=str(baseline/(base+'-editable.blend')));bpy.context.preferences.filepaths.save_version=0
if mode=='old':
 with bpy.data.libraries.load(str(NEW/'phase1/Story200-editable.blend'),link=False) as (source,target):target.materials=[n for n in source.materials if n.startswith('A200 ')]
data=json.loads((baseline/'manifest.json').read_text());entries={e['id']:e for e in data['models']}
def material(name):
 existing=bpy.data.materials.get('A200 '+name)
 if existing:return existing
 # Blender drops unreferenced palette swatches when saving the baseline.
 family,role=name.split(' ',1);entry=next(p for p in json.loads((R/'assets/art200/palette.json').read_text())['families'] if p['id']==family)
 key='secondary' if role=='service inset' else 'letter';color=entry[key]
 values=[int(color[i:i+2],16)/255 for i in [1,3,5]];values=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values]
 m=bpy.data.materials.new('A200 '+name);m.use_nodes=True;s=m.node_tree.nodes.get('Principled BSDF');s.inputs['Base Color'].default_value=(*values,1)
 s.inputs['Metallic'].default_value=.22 if key=='secondary' else 0;s.inputs['Roughness'].default_value=.67 if key=='secondary' else .78
 return m
steel=material('weathered load steel');metal=material('aged brushed alloy');dark=material('vulcanized rubber');glass=material('smoked instrument glazing');leaf=material('dormant grey sage foliage')
cream=material('stone ceramic stencil');cyan=material('unlit instrument ink');amber=material('ivory gauge needle')
paint=material('petrol enamel');ochre=material('clay enamel');red=material('oxblood enamel')
families={p['id']:p for p in json.loads((R/'assets/art200/palette.json').read_text())['families']}
old_families=dict(zip(entries,['denim','oxblood','celadon','plum','petrol','olive','slate','denim','plum','clay','oxblood','heather','olive','clay','petrol','umber','denim','slate','verdigris','denim','oxblood','olive','plum','clay','petrol'])) if mode=='old' else {}
tree=ast.parse((R/'tools/art/art100_story_robots/build.py').read_text())
shared={'xyz','empty','finish','box','tube','ring','profile','text','bolt','badge','panel','dial'}
for f in tree.body:
 if isinstance(f,ast.FunctionDef) and f.name in shared:exec(compile(ast.Module(body=[f],type_ignores=[]),'<geometry primitives>','exec'))
tree=ast.parse((R/'tools/art/art200_story/build.py').read_text())
for f in tree.body:
 if isinstance(f,ast.FunctionDef) and f.name in {'cable','coil'}:exec(compile(ast.Module(body=[f],type_ignores=[]),'<supported paths>','exec'))
def B(n,p,d,m=None):return box('P2 '+n,p,d,m or P,r,.004)
def T(n,a,b,rad,m=None,N=20):return tube('P2 '+n,a,b,rad,m or metal,r,N)
def F(at,axis='z',sign=1,rad=.010):
 at=Vector(at);d=Vector((1,0,0) if axis=='x' else (0,1,0) if axis=='y' else (0,0,1))*sign
 T('captured fastener washer',at,at+d*.003,rad*1.35,metal,16);T('hex service fastener',at+d*.003,at+d*.009,rad,steel,6)
def plate(at,w,h,title='',face=1):
 x,y,z=at;B('gasketed removable service plate',at,(w,h,.012),P)
 B('recessed identification field',(x,y,z+face*.007),(w*.86,h*.70,.003),dark)
 if title:
  o=text(title,(x,y,z+face*.010),min(.03,w/max(1,len(title))*1.2),r)
  if face<0:
   at=xyz((x,y,z-.010));o.matrix_world=Matrix.Translation(at)@Matrix.Rotation(math.pi,4,'Z')@Matrix.Translation(-at)@o.matrix_world
 for xx in [x-w*.40,x+w*.40]:
  for yy in [y-h*.34,y+h*.34]:F((xx,yy,z+face*.007),sign=face,rad=.007)
def letters(value,at,size=.028,horizontal=False):
 o=text(value,at,size,r);o.data.materials[0]=steel
 if horizontal:o.rotation_euler=(0,0,0)
 return o
def band_path(name,x,points,width=.05):
 coords=[Vector((x,y,z)) for y,z in points];vs=[];fs=[]
 for i,p in enumerate(coords):
  tangent=(coords[min(i+1,len(coords)-1)]-coords[max(i-1,0)]).normalized();normal=Vector((0,-tangent.z,tangent.y)).normalized()
  for sx,sn in [(-1,-1),(1,-1),(1,1),(-1,1)]:vs.append(xyz(p+Vector((sx*width/2,0,0))+normal*sn*.006))
 for i in range(len(coords)-1):
  for j in range(4):fs.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
 fs.extend([(3,2,1,0),tuple((len(coords)-1)*4+j for j in range(4))]);mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new('P2 '+name,mesh);bpy.context.collection.objects.link(o);return finish(o,o.name,dark,r,.002)
def caster_forks(xs,zs,hub_y,frame_y):
 for x in xs:
  for z in zs:
   inner=x-math.copysign(.072,x);B('cast caster support fork',(inner,(hub_y+frame_y)/2,z),(.045,frame_y-hub_y+.03,.10),steel)
   T('connected wheel bearing axle',(inner,hub_y,z),(x,hub_y,z),.029,metal)
def recolor_old():
 for obj in [o for o in r.children_recursive if o.type=='MESH']:
  for i,m in enumerate(obj.data.materials):
   n=m.name.lower()
   if 'maintenance enamel' in n or 'recovery ochre' in n:replacement=P
   elif 'oxide ceramic' in n:replacement=S
   elif 'ceramic lettering' in n:replacement=cream
   elif 'brushed alloy' in n:replacement=metal
   elif 'phosphated steel' in n:replacement=steel
   elif 'vulcanized seals' in n:replacement=dark
   elif 'inspection glass' in n:replacement=glass
   elif 'propagation leaves' in n:replacement=leaf
   elif 'low power cyan' in n or 'status amber' in n:replacement=cyan
   else:continue
   obj.data.materials[i]=replacement

for id,e in entries.items():
 r=bpy.data.objects[id];family=e['paint_family'] if mode=='new' else old_families[id]
 P=material(family+' enamel');S=material(family+' service inset');cream=material(family+' ceramic stencil')
 e['paint_family']=family;e['phase2_refined']=True
 if mode=='old':recolor_old()
 notes=[]
 if id=='Story2ScoutRepairStand':
  plate((0,.94,.264),.46,.14,'SCAN / SERVICE');plate((0,1.49,.155),.28,.082,'SWEEP')
  for x in [-.25,.25]:F((x,1.08,.334),rad=.009)
  notes=['Gasketed hull service panel, optical-head identity and shroud fasteners.']
 elif id=='Story2CargoManifestLectern':
  for i,x in enumerate([-.2,-.1,0,.1,.2]):letters(str(i+1),(x,1.27,-.175),.042)
  for x in [-.33,.33]:B('closed case latch',(x,.86,.315),(.06,.10,.024),metal)
  notes=['Numbered cargo leaves and connected case latches.']
 elif id=='Story2SplitDriveAxle':
  for side in [-1,1]:
   xx=side*1.164;T('stepped differential hub cover',(xx,.43,0),(xx+side*.016,.43,0),.12,P)
   for j in range(6):a=j*math.tau/6;F((xx,.43+.25*math.cos(a),.25*math.sin(a)),axis='x',sign=side,rad=.018)
  notes=['Stepped axle covers and six-point fastened hub flanges.']
 elif id=='Story2EmergencyShadeStation':
  cloth=P.copy();cloth.name='A200 denim weather canvas';bs=cloth.node_tree.nodes.get('Principled BSDF')
  for socket,value in [('Metallic',0),('Roughness',.9)]:
   for link in list(bs.inputs[socket].links):cloth.node_tree.links.remove(link)
   bs.inputs[socket].default_value=value
  for obj in r.children_recursive:
   if obj.type=='MESH' and 'weather cloth' in obj.name:obj.data.materials[0]=cloth
  for x in [-.78,0,.78]:cable('P2 sewn canopy seam',[(x,2.105,-.65),(x,2.225,-.33),(x,2.346,0),(x,2.225,.33),(x,2.105,.65)],.0035,steel,r)
  for x in [-1.15,1.15]:
   for z in [-.64,.64]:B('anchored cloth tie',(x,2.11,z),(.10,.025,.07),dark)
  notes=['Matte weather-canvas material, three sewn seams and anchored corner ties.']
 elif id=='Story2ServoPress':
  plate((-.49,1.78,.12),.22,.28,'R / 12');dial(r,(.98,.74,.207),.066)
  for x in [-.5,.5]:
   for z in [-.25,.28]:F((x,.732,z),axis='y',rad=.021)
  notes=['Reaction-bed fasteners, captive pressure gauge and column service cover.']
 elif id=='Story2LimbAssemblyJig':
  caster_forks([-.62,.62],[-.37,.37],.12,.28);plate((-.15,1.2,.149),.33,.125,'ACT / 02')
  for x in [-.42,.21]:F((x,1.361,.1),axis='y',rad=.013)
  notes=['Load-bearing caster forks and axles; bolted forearm access panel and hold-downs.']
 elif id=='Story2QuenchManifold':
  for x,rad in [(-.59,.23),(0,.26),(.61,.23)]:
   for sign in [-1,1]:B('tank band locking clamp',(x+sign*(rad-.004),.60,0),(.03,.15,.09),metal)
   letters('Q'+str(int((x+.6)*10)),(x,.25,rad+.005),.025)
  notes=['Vessel band clamps and individually indexed return vessels.']
 elif id=='Story2MagneticSortingDrum':
  for obj in r.children_recursive:
   if obj.type=='MESH' and ('FERROUS' in obj.name or 'identification plate' in obj.name.lower()):obj.location.y-=.022
  for side in [-1,1]:
   T('sealed drum bearing cover',(side*.605,1.16,0),(side*.625,1.16,0),.16,metal)
   for j in range(4):a=j*math.tau/4;F((side*.626,1.16+.12*math.cos(a),.12*math.sin(a)),axis='x',sign=side,rad=.012)
  notes=['Exposed leg-stay nameplate corrected; sealed bearing covers and torque fasteners.']
 elif id=='Story2AzimuthTrackingDish':
  q=next(o for o in r.children if o.type=='EMPTY' and 'gimbal' in o.name)
  for j in range(4):
   a=j*math.tau/4;cable('P2 reflector rear radial stiffener',[(0,-.195,0),(.4*math.cos(a),-.135,.4*math.sin(a)),(.8*math.cos(a),.105,.8*math.sin(a))],.016,metal,q)
  for side in [-1,1]:F((side*.643,2.06,-.03),axis='x',sign=side,rad=.037)
  notes=['Connected reflector rear ribs and locked elevation trunnions.']
 elif id=='Story2FerriteTuningBench':
  for x in [-.45,-.15,.15,.45]:
   cable('P2 ferrite coil lower terminal',[(x+.075,.91,-.06),(x+.075,.87,.11),(x+.075,.94,.193)],.010,metal,r)
   cable('P2 ferrite coil top terminal',[(x+.075,1.234,-.06),(x+.03,1.30,-.06),(x,1.30,-.06)],.010,metal,r)
  for x in [-.52,.52]:F((x,.99,.357),rad=.009)
  notes=['Continuous winding terminations connect coils to the comparison bridge.']
 elif id=='Story2ReceiverRepairBot':
  plate((0,.90,-.284),.28,.24,'C09 / SERVICE',-1)
  for x,z in [(-.45,.32),(.45,.32),(0,-.48)]:F((x,.071,z),axis='y',rad=.013)
  notes=['Rear service access hatch and locked tripod foot joints.']
 elif id=='Story2CableRoutingArch':
  for x in [-1.3,1.3]:
   B('anchored cable gland block',(x,.16,.29),(.20,.11,.27),S)
   for z in [.20,.265,.33,.395]:T('gland ferrule',(x,.19,z),(x,.23,z),.034,metal)
  notes=['Four individually retained cable glands terminate each supported bundle.']
 elif id=='Story2PneumaticSeedSorter':
  for x in [-.29,.29]:
   ring('P2 clamped hopper throat',(x,1.016,-.02),.099,.083,.037,metal,r,32)
   for xx in [x-.14,x+.14]:F((xx,.93,.422),rad=.009)
  letters('VIABLE',( -.27,.49,.44),.025);letters('HUSK',(.27,.49,.44),.025)
  notes=['Clamped hopper throats, display fasteners and explicit collection-drawer marks.']
 elif id=='Story2ClimateBellChamber':
  for j in range(4):
   a=j*math.tau/4;x=.4*math.cos(a);z=.4*math.sin(a);B('bell over-centre retaining clamp',(x,.67,z),(.055,.14,.055),metal)
  plate((0,.43,.352),.19,.085,'C / 17')
  notes=['Four physical bell latches and a sealed calibration plate.']
 elif id=='Story2FamilyMemorialTableau':
  for x in [-.68,.68]:
   for z in [-.18,0,.18]:F((x,.522,z),axis='y',rad=.008)
  for x in [-.36,-.02,.32]:T('visible keepsake potting soil',(x,.730,.02),(x,.734,.02),.113,dark)
  notes=['Bench slat fasteners and visible planted soil in each keepsake pot.']
 elif id=='Story2RootIrrigationCart':
  caster_forks([-.46,.46],[-.39,.39],.18,.30)
  T('threaded tank filling neck',(0,.89,-.31),(0,.97,-.31),.044,metal)
  T('knurled tank filler plug',(0,.964,-.31),(0,.985,-.31),.058,P)
  notes=['Connected cart axles/caster forks and a reachable sealed filling neck.']
 elif id=='Story2ArchiveReelLibrary':
  for row,y in enumerate([.63,1.25,1.86]):
   for col,x in enumerate([-.28,.28]):letters('%02d'%(row*2+col+1),(x,y-.12,.202),.045)
  for x in [-.57,.57]:
   for y in [.30,1.00,1.73]:F((x,y,.30),rad=.010)
  notes=['All six reels individually numbered; rail service fasteners.']
 elif id=='Story2PassengerBaggageTrolley':
  for obj in list(r.children_recursive):
   if 'Continuous luggage retaining belt' in obj.name:bpy.data.objects.remove(obj,do_unlink=True)
  for x in [-.22,.22]:
   band_path('continuous fitted luggage webbing',x,[(.21,.332),(.75,.332),(.79,.247),(1.19,.247),(1.19,-.27),(.21,-.27)])
   B('luggage belt buckle',(x,.50,.346),(.085,.09,.023),metal);B('buckle inset',(x,.50,.361),(.050,.047,.008),dark)
  notes=['Continuous fitted retaining webbing follows both suitcases; attached metal buckles.']
 elif id=='Story2DeadPatrolTorso':
  B('closed torso service cover',(0,.654,-.22),(.46,.024,.34),S)
  for x in [-.18,.18]:
   for z in [-.34,-.10]:F((x,.668,z),axis='y',rad=.012)
  for x in [-.54,.54]:T('protected elbow pin',(x-.037,.34,.08),(x+.037,.34,.08),.060,steel)
  notes=['Bolted power-isolated torso cover and retained elbow pins.']
 elif id=='Story2SignalVerificationGate':
  for x,title in [(-1.4,'RX / 01'),(1.4,'TX / 02')]:plate((x,.43,.22),.24,.25,title)
  for x in [-1.54,-1.26,1.26,1.54]:F((x,.121,.23),axis='y',rad=.017)
  notes=['Distinct receiver/transmitter service plates and foundation anchors.']
 elif id=='Story2JourneyCartographyTable':
  pts=[(-.46,.26),(-.26,.12),(-.16,-.12),(.13,-.19),(.29,-.35),(.48,-.24)]
  for i,(x,z) in enumerate(pts):letters('%02d'%(i+1),(x, .989,z+.045),.030,True)
  for j in range(6):a=j*math.tau/6;F((.39*math.cos(a),.101,.39*math.sin(a)),axis='y',rad=.012)
  notes=['Engraved numbered waypoints and a visibly anchored table pedestal.']
 elif id=='Story2DormantStewardCradle':
  plate((0,.86,.205),.34,.29,'CIVIC / 02')
  for x in [-.1,.1]:T('recessed optical bezel',(x,1.31,.170),(x,1.31,.183),.056,metal)
  for y in [.74,.80,.86,.92]:B('rear steward cooling seam',(0,y,-.209),(.29,.017,.010),dark)
  notes=['Removable civic chest cover, protected optical bezels and rear cooling seams.']
 elif id=='Story2CommunalGalleyModule':
  cable('P2 connected kettle spout',[(.56,1.26,.03),(.72,1.36,.03),(.75,1.49,.03)],.026,metal,r)
  ring('P2 open spout rolled lip',(.75,1.49,.03),.031,.023,.012,metal,r,24)
  for i in range(6):
   x=-.57+i*.225;cable('P2 attached cup handle',[(x+.048,1.63,-.07),(x+.105,1.63,-.07),(x+.11,1.55,-.07),(x+.048,1.55,-.07)],.009,S,r)
   T('cup dark interior',(x,1.65,-.07),(x,1.653,-.07),.046,dark)
  for x in [-.52,0,.52]:F((x,1.054,.28),axis='y',rad=.011)
  notes=['Connected open kettle spout, attached cup handles, visible cup interiors and worktop fasteners.']
 elif id=='Story2MissionPlaqueRack':
  for x in [-.47,.47]:
   for z in [-.22,.22]:F((x,.092,z),axis='y',rad=.012)
  T('rear civic board cross brace',(-.47,.70,-.074),(.47,1.70,-.074),.018,steel)
  notes=['Anchored foot plates and connected diagonal back brace behind the readable civic plaques.']
 elif id=='Story2WaterReclamationStill':
  T('captive pressure bypass',(-.40,.32,.18),(.42,.32,.18),.023,metal)
  T('bypass valve spindle',(0,.32,.18),(0,.44,.18),.019,metal)
  ring('P2 bypass handwheel',(0,.44,.18),.075,.054,.018,P,r,28)
  T('bypass cross spoke',(-.065,.44,.18),(.065,.44,.18),.009,P);T('bypass cross spoke',(0,.44,.115),(0,.44,.245),.009,P)
  notes=['Continuous vessel bypass and a connected manual isolation handwheel.']
 elif id=='BerthReferenceDesk':
  B('document retaining clip',(-.22,1.062,.055),(.25,.024,.04),metal)
  for x in [-.43,.43]:F((x, .990,.22),axis='y',rad=.010)
  notes=['Retained work papers, worktop fasteners and muted denim service finish.']
 elif id=='BerthReceivingCoupler':
  for x in [-.24,.24]:T('crimped coupler ferrule',(x,1.265,0),(x,1.303,0),.082,metal)
  plate((0,.24,.32),.36,.105,'B / RECEIVE')
  notes=['Locked contact ferrules and receiving-channel service identity.']
 elif id=='BerthSeedEnclosure':
  for x in [-.42,.42]:F((x,1.57,.276),rad=.009)
  for i,x in enumerate([-.34,-.17,0,.17,.34]):letters(str(i+1),(x,1.38,.073),.033)
  notes=['Fastened climate hood and individually numbered seed carriers.']
 elif id=='BerthArchiveReceiver':
  for x in [-.32,0,.32]:B('keyed extraction stop',(x,1.15,.29),(.075,.035,.055),steel)
  for i,x in enumerate([-.23,0,.23]):letters(str(i+1),(x,1.095,.253),.032)
  notes=['Physical extraction stops and keyed archive-drawer marks.']
 elif id=='BerthAccessTransmitter':
  for x in [-.24,0,.24]:
   for dx in [-.048,.048]:F((x+dx,.61,.378),rad=.006)
  plate((0,1.36,.0),.29,.086,'ACCESS')
  notes=['Meter retainers and service identity on the transmitter junction.']
 elif id=='SeedPropagationBench':
  for i in range(6):
   x=-1+i*.4;ring('P2 rolled seed cup lip',(x,1.066,0),.148,.133,.018,metal,r,32);letters(str(i+1),(x,.9,.298),.025)
  notes=['Rolled cup rims and numbered planting seats without closing cup gaps.']
 elif id=='PreservationReservoir':
  for x in [-.168,.168]:
   for z in [-.08,.08]:F((x,.121,z),axis='y',rad=.010)
  T('outlet compression collar',(0,.22,.295),(0,.22,.318),.051,metal)
  notes=['Foot anchoring fasteners and a supported outlet compression fitting.']
 elif id in ['OpenChannelMast','RelayChallengeMast']:
  for x in [-.16,.16]:
   for z in [-.16,.16]:F((x,.071,z),axis='y',rad=.018)
  if id=='OpenChannelMast':plate((0,3.60,.139),.090,.14,'O')
  else:plate((0,1.0,.153),.16,.17,'R')
  notes=['Bolted mast foundation and distinct open/relay service cover.']
 elif id=='IsolatorCabinet':
  plate((0,.23,.266),.48,.13,'ISOLATE / VERIFY')
  for x in [-.22,0,.22]:F((x,1.18,.36),rad=.010)
  notes=['Isolation safety engraving and captive fuse-terminal fasteners.']
 elif id=='ArchiveTransitCore':
  for x in [-.334,.334]:B('archive transport locking strap',(x,.3,0),(.020,.11,.30),metal)
  notes=['Captured side transport locks and a muted oxblood field finish.']
 elif id=='MemoryReader':
  B('continuous reader identification stay',(0,.68,.115),(.53,.14,.025),metal)
  T('display hinge axle',(-.18,.99,-.10),(.18,.99,-.10),.025,steel)
  notes=['A supported reader plaque and physical display pivot.']
 elif id=='SeedVault':
  T('continuous vault lock spindle',(0,.64,.36),(0,.64,.441),.024,steel)
  for y in [.44,.84]:B('vault door hinge pin',(-.284,y,.35),(.038,.14,.045),metal)
  notes=['Handwheel spindle reaches the door; retained vault door hinges.']
 elif id=='EmergencyFuelPump':
  cable('P2 nozzle guard',[(.235,.79,.36),(.235,.65,.40),(.33,.65,.40),(.33,.79,.36)],.009,steel,r)
  plate((0,.55,.29),.36,.13,'FUEL / HAND')
  notes=['Connected dispensing-nozzle guard and a readable manual-service plate.']
 elif id=='CourierChargeCradle':
  for x in [-.19,0,.19]:T('charge terminal collar',(x,.44,-.188),(x,.44,-.174),.049,metal)
  for x in [-.42,.42]:F((x,.091,.29),axis='y',rad=.011)
  notes=['Captured charge collars and grounded docking-pad anchors.']
 elif id=='RecoveryToolCart':
  caster_forks([-.31,.31],[-.24,.24],.095,.205)
  B('continuous cart identification stay',(0,.65,.21),(.61,.10,.065),steel)
  notes=['Connected caster forks and axles; supported recovery identification rail.']
 elif id=='NavGyroCradle':
  for sign in [-1,1]:F((sign*.366,.83,0),axis='x',sign=sign,rad=.025)
  for x in [-.31,.31]:F((x,.48,.21),axis='y',rad=.010)
  notes=['Retained trunnion fasteners and a bolted instrument plinth.']
 elif id=='FoundryPowerBus':
  for i,x in enumerate([-.37,0,.37]):letters(['2','1','0'][i],(x,1.15,.338),.045)
  for x in [-.49,.49]:F((x,.73,.301),rad=.014)
  notes=['Readable 2/1/0 circuit allocation marks and retained cassette frame.']
 elif id=='ArrayPhaseRack':
  for y in [.41,.81,1.21]:
   for x in [-.42,.42]:B('receiver cassette rack ear',(x,y,.27),(.036,.20,.033),metal);F((x,y+.06,.292),rad=.007)
  notes=['Serviceable receiver-rack ears and captured fasteners.']
 else:
  # Six complete combat characters: refinement of their fitted chest unit and
  # existing back-mounted service hardware stays inside the original envelope.
  kind=e['runtime_target'].split(':')[1]
  for x in [-.07,0,.07]:B('faction chest calibration slot',(x,1.419,.191),(.035,.013,.008),metal)
  if kind=='warden':
   for x in [-.145,.145]:T('rear optic retaining rim',(x,1.72,-.318),(x,1.72,-.326),.038,metal)
  elif kind=='revenant':
   for x in [-.085,.085]:T('pulse cartridge captive collar',(x,1.595,-.25),(x,1.624,-.25),.071,metal)
  elif kind=='bastion':
   for x in [-.17,.17]:F((x,1.700,-.25),axis='y',rad=.010)
  elif kind=='sovereign':
   for x in [-.15,.15]:B('armoured uplink service seam',(x,1.43,-.432),(.012,.29,.012),metal)
  elif kind=='raider':
   for x in [-.12,.12]:F((x,1.23,-.383),sign=-1,rad=.009)
  else:
   for x in [-.11,.11]:T('sample cartridge retaining collar',(x,1.41,-.34),(x,1.435,-.34),.056,metal)
  notes=['Fitted chest calibration slots and purpose-specific retained '+kind+' service hardware; muted '+family+' body/attachment faction finish.']
 e['phase2_notes']=notes
 print('PHASE2_REFINED',id,'|',' '.join(notes),flush=True)

def fix_surface_clearances():
 # Cabinet instruments need independent readable fields, and printed carrier
 # numbers must sit outside the curved cap surface rather than inside it.
 seed=bpy.data.objects.get('BerthSeedEnclosure')
 if seed and not seed.get('art200_surface_clearance'):
  for obj in seed.children_recursive:
   if obj.name.startswith('Recessed identification plate') or obj.name.startswith('Engraved ORCHARD / LIVING SEED'):obj.location.z=.61
   if obj.name.startswith('Engraved ') and abs(obj.location.z-1.38)<.001:obj.location.y=-.080
  seed['art200_surface_clearance']=True
 isolator=bpy.data.objects.get('IsolatorCabinet')
 if isolator and not isolator.get('art200_surface_clearance'):
  for obj in isolator.children_recursive:
   if obj.name.startswith('Recessed identification plate'):obj.location.z=1.475;obj.scale.z=.07/.11
   if obj.name.startswith('Engraved ARCHIVE / ISOLATOR'):obj.location.z=1.475
  isolator['art200_surface_clearance']=True
 vault=bpy.data.objects.get('SeedVault')
 if vault and not vault.get('art200_surface_clearance'):
  for obj in vault.children_recursive:
   if obj.name.startswith(('Cast instrument surround','Inset glazed display','Engraved display rule','Channel bar')):obj.location.z-=.12;obj.location.y-=.076
  vault['art200_surface_clearance']=True

if mode=='old':fix_surface_clearances()

def fix_mechanical_supports():
 courier=bpy.data.objects.get('CourierChargeCradle')
 if courier and not courier.get('art200_mechanical_support'):
  for x in [-.19,0,.19]:tube('P2 insulated charge feedthrough',(x,.44,-.235),(x,.44,-.172),.032,steel,courier,24)
  courier['art200_mechanical_support']=True
 bus=bpy.data.objects.get('FoundryPowerBus')
 if bus and not bus.get('art200_mechanical_support'):
  for x in [-.37,0,.37]:box('P2 captured circuit number plate',(x,1.15,.303),(.10,.067,.070),metal,bus,.004)
  for obj in bus.children_recursive:
   if obj.name.startswith('Engraved ') and abs(obj.location.z-1.15)<.001:obj.location.y=-.339
  bus['art200_mechanical_support']=True
 press=bpy.data.objects.get('Story2ServoPress')
 if press and not press.get('art200_mechanical_support'):
  for obj in press.children_recursive:
   if obj.name.startswith(('Instrument bezel','Dial face','Gauge index','Instrument needle')):obj.location.y+=.222
  tube('P2 connected pressure sensing tap',(.98,.74,-.10),(.98,.74,-.010),.024,metal,press,24)
  press['art200_mechanical_support']=True
 patrol=bpy.data.objects.get('Story2DeadPatrolTorso')
 if patrol and not patrol.get('art200_mechanical_support'):
  tube('P2 retained patrol neck spindle',(0,.44,-.60),(0,.44,-.48),.077,steel,patrol,32)
  patrol['art200_mechanical_support']=True

fix_mechanical_supports()

# Recompute all editable measurements, weld tiny duplicate vertices, preserve
# seed-state subroot and keep per-material runtime batching.
roots=[bpy.data.objects[e['id']] for e in data['models']]
for obj in [o for root in roots for o in root.children_recursive if o.type=='MESH']:
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001);bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001)
 if not bm.loops.layers.uv:
  uv=bm.loops.layers.uv.new('Metre UV')
  for face in bm.faces:
   axis=max(range(3),key=lambda k:abs(face.normal[k]));axes=[k for k in range(3) if k!=axis]
   for loop in face.loops:loop[uv].uv=(loop.vert.co[axes[0]],loop.vert.co[axes[1]])
 bm.to_mesh(obj.data);bm.free()
bpy.context.view_layer.update()
for e,r in zip(data['models'],roots):
 objects=[o for o in r.children_recursive if o.type=='MESH'];points=[o.matrix_world@Vector(v) for o in objects for v in o.bound_box]
 lo=[min(p[k] for p in points) for k in range(3)];hi=[max(p[k] for p in points) for k in range(3)]
 e['bounds_min']=[round(lo[0],5),round(lo[2],5),round(-hi[1],5)];e['bounds_max']=[round(hi[0],5),round(hi[2],5),round(-lo[1],5)];e['dimensions_m']=[round(e['bounds_max'][k]-e['bounds_min'][k],5) for k in range(3)]
 for obj in objects:obj.data.calc_loop_triangles()
 e['triangles']=sum(len(o.data.loop_triangles) for o in objects);e['editable_parts']=len(objects);e['materials']=sorted({m.name for o in objects for m in o.data.materials})
 if e['status']=='refined':e['authored_attachment_triangles']=e['triangles']
 if e['status']=='new' and abs(e['bounds_min'][1])>.015:raise RuntimeError(e['id']+' lost its grounded floor origin')
bpy.ops.wm.save_as_mainfile(filepath=str(O/(base+'-editable.blend')),compress=True)
for r in roots:
 for obj in list(r.children_recursive):
  if obj.type!='MESH' or obj.parent==r or obj.parent.name=='LivingSprouts':continue
  matrix=obj.matrix_world.copy();obj.parent=r;obj.matrix_world=matrix
parents=roots+[o for o in bpy.data.objects if o.name=='LivingSprouts']
for parent in parents:
 for mat in list(bpy.data.materials):
  batch=[o for o in parent.children if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==mat]
  if not batch:continue
  bpy.ops.object.select_all(action='DESELECT')
  for obj in batch:obj.select_set(True)
  bpy.context.view_layer.objects.active=batch[0]
  if len(batch)>1:bpy.ops.object.join()
  bpy.context.object.name=parent.name+'__'+mat.name
for obj in [o for o in bpy.data.objects if o.type=='MESH']:
 bpy.context.view_layer.objects.active=obj;mod=obj.modifiers.new('Portable tangent topology','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.ops.object.select_all(action='SELECT')
target=R/('godot/art/art200-story.glb' if mode=='new' else 'godot/art/art100-story-robots.glb')
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_animations=False,export_tangents=True,export_cameras=False,export_lights=False)
sys.path.insert(0,str(R/'tools/art/native_enemies'));from repair_tangents import repair
print('REPAIRED_TANGENTS',repair(target))
for e,r in zip(data['models'],roots):e['runtime_meshes']=sum(o.type=='MESH' for o in r.children_recursive)
data['phase2']='Blender detail, supported hardware, muted palette and graphics pass'
(O/'manifest.json').write_text(json.dumps(data,indent=2)+'\n')
if mode=='new':(R/'godot/art/art200-story-manifest.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(O/(base+'-runtime.blend')),compress=True)
print('PHASE2_EXPORTED',mode,len(roots),sum(e['triangles'] for e in data['models']),flush=True)
