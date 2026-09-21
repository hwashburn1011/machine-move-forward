"""Original readable cargo, fuel, scanner and wrist hardware. Blender 5.1.

Isolated background authoring; does not modify the user's interactive scene.
All coordinates are game metres, Y up. Existing runtime IDs remain stable.
"""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools/art/glass_orchard'))
import common as c

OUT = ROOT / 'assets/nomad-foundations'
(OUT / 'exports').mkdir(parents=True, exist_ok=True)
(OUT / 'source').mkdir(exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0

def glow(name, color, strength=.8):
    m=c.flat(name,color,metal=.12,rough=.42)
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Emission Color'].default_value=(*color,1)
    bs.inputs['Emission Strength'].default_value=strength
    return m

signal=glow('Nomad_InformationCyan',(.015,.30,.42),1.2)
service=glow('Nomad_ServiceAmber',(.85,.28,.025),.8)
fuelpaint=c.flat('Nomad_FuelOchre',(.43,.22,.055),metal=.35,rough=.68)

# Small original PBR enamel atlas; packed in the source and every portable export.
import numpy as np
size=512;rng=np.random.default_rng(9247)
field=np.zeros((size,size),dtype=np.float32)
for cells,weight in [(8,.50),(32,.28),(128,.15),(512,.07)]:
    octave=np.repeat(np.repeat(rng.random((cells,cells)),size//cells,axis=0),size//cells,axis=1)
    for blur in range(max(1,size//cells//3)):
        octave=(octave+np.roll(octave,1,0)+np.roll(octave,-1,0)+np.roll(octave,1,1)+np.roll(octave,-1,1))/5
    field+=octave*weight
field=(field-field.min())/(field.max()-field.min())
chip=field>.79
color=np.ones((size,size,4),dtype=np.float32)
for i,v in enumerate([.59,.39,.15]):color[:,:,i]=v*(.85+.30*field)
for i,v in enumerate([.20,.17,.12]):color[:,:,i][chip]=v
orm=np.ones_like(color);orm[:,:,1]=.58+.19*field;orm[:,:,2]=.22
orm[:,:,1][chip]=.79;orm[:,:,2][chip]=.67
node=fuelpaint.node_tree;bs=node.nodes.get('Principled BSDF')
for label,data in [('Color',color),('ORM',orm)]:
    img=bpy.data.images.new('Nomad Original Fuel Enamel '+label,width=size,height=size)
    if label=='ORM':img.colorspace_settings.name='Non-Color'
    img.pixels.foreach_set(data.ravel());img.pack()
    tex=node.nodes.new('ShaderNodeTexImage');tex.image=img
    if label=='Color':node.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    else:
        split=node.nodes.new('ShaderNodeSeparateColor');node.links.new(tex.outputs['Color'],split.inputs['Color'])
        node.links.new(split.outputs['Green'],bs.inputs['Roughness']);node.links.new(split.outputs['Blue'],bs.inputs['Metallic'])

rubber=c.flat('Nomad_SealingRubber',(.022,.027,.029),rough=.85)

def ring(name,at,r,thickness,mat,parent,axis='z'):
    bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=8,
        location=c.xyz(at),major_radius=r,minor_radius=thickness)
    o=bpy.context.object
    if axis=='z':o.rotation_euler.x=math.pi/2
    if axis=='x':o.rotation_euler.y=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return c.finish(o,name,mat,parent)

def bolt(at,parent,r=.018):
    x,y,z=at
    c.tube('Recessed hex fixing',(x,y,z),(x,y,z-.012),r,c.bare,parent,6)

def panel(name,at,size,parent,mat=c.ivory):
    obj=c.box(name,at,size,mat,parent,.026)
    x,y,z=at;w,h,d=size
    for px in [-w*.41,w*.41]:
        for py in [-h*.39,h*.39]:bolt((x+px,y+py,z-d*.51),parent,.014)
    return obj

def cargo():
    r=c.empty('MMF_SalvageChest')
    c.box('Pressed freight body',(0,-.05,0),(1.44,.91,1.05),c.steel,r,.075)
    c.box('Sealed lid gasket',(0,.375,0),(1.49,.07,1.10),rubber,r,.025)
    c.box('Rolled ivory lid',(0,.47,0),(1.5,.15,1.10),c.ivory,r,.07)
    for x in [-.61,.61]:
        c.box('Reinforced corner runner',(x,-.52,0),(.17,.09,1.15),c.bare,r,.023)
        for z in [-.48,.48]:
            c.box('Stackable corner guard',(x,-.03,z),(.19,1.02,.14),c.bare,r,.035)
            bolt((x,.40,z-.075),r,.025)
    for x in [-.46,.46]:
        c.box('High visibility band',(x,-.04,0),(.09,.95,1.085),fuelpaint,r,.021)
        c.box('Latch recess',(x,.20,-.565),(.16,.25,.045),rubber,r,.018)
        c.box('Positive overcentre latch',(x,.23,-.596),(.095,.17,.025),c.bare,r,.018)
        c.tube('Latch pivot',(x-.055,.14,-.608),(x+.055,.14,-.608),.021,c.bare,r,20)
        c.tube('Lid rear hinge',(x-.08,.41,.557),(x+.08,.41,.557),.035,c.bare,r,24)
    panel('Tow identification plate',(0,-.01,-.55),(.61,.29,.025),r,c.ivory)
    c.label('Recoverable cargo stencil','CARGO',(0,.025,-.57),.103,r)
    c.label('Tow direction label','REEL / RECOVER',(0,-.075,-.57),.043,r)
    ring('Forged tow eye',(0,.27,-.603),.08,.022,c.bare,r)
    c.empty('TowPoint',(0,.27,-.63),r)
    for side in [-1,1]:
        x=side*.747
        c.cable('Recessed freight handle',[(x,.13,-.23),(side*.78,.02,-.19),(side*.78,.02,.19),(x,.13,.23)],.022,c.bare,r)
        c.box('Reflective corner marker',(side*.66,.49,-.556),(.115,.05,.017),service,r,.01)
    # Broad protected strips read from above; no tiny distant point light.
    for z in [-.35,.35]:
        c.box('Beacon recessed channel',(0,.554,z),(.80,.025,.09),rubber,r,.009)
        c.box('Recoverable cargo beacon',(0,.571,z),(.69,.012,.045),service,r,.008)
    return r

def canister():
    r=c.empty('NomadFuelCanister')
    c.box('Pressed fuel vessel',(0,.235,0),(.40,.45,.235),fuelpaint,r,.052)
    for y in [.055,.405]:c.box('Rolled protective seam',(0,y,0),(.417,.025,.248),c.bare,r,.012)
    for x in [-.13,.13]:
        c.box('Handle pillar',(x,.467,0),(.058,.135,.10),fuelpaint,r,.022)
    c.box('Open carry grip',(0,.532,0),(.315,.057,.10),rubber,r,.025)
    for side in [-1,1]:
        for slope in [-1,1]:
            low,high=(.08,.19) if side<0 else (.14,.34)
            a=(-.11,low,side*.121);b=(.11,high if slope>0 else low,side*.121)
            if slope<0:a=(-.11,high,side*.121)
            c.tube('Pressed diagonal stiffening rib',a,b,.012,fuelpaint,r,12)
    c.tube('Raised filler neck',(.135,.41,-.048),(.135,.488,-.048),.045,c.bare,r,32)
    c.tube('Knurled sealed filler cap',(.135,.485,-.048),(.135,.517,-.048),.052,rubber,r,32)
    for i in range(12):
        a=i*math.tau/12
        c.tube('Cap finger grip',(.135+math.cos(a)*.051,.49,-.048+math.sin(a)*.051),(.135+math.cos(a)*.051,.512,-.048+math.sin(a)*.051),.005,c.bare,r,6)
    c.box('Fuel identification plate',(0,.275,-.125),(.27,.135,.009),c.ivory,r,.008)
    c.label('Fuel can label','FUEL',(0,.287,-.132),.055,r)
    c.label('Fuel can subtitle','HEAVY DISTILLATE',(0,.251,-.132),.017,r)
    c.empty('Grip',(0,.534,0),r);c.empty('Spout',(.135,.516,-.048),r)
    return r

def generator():
    r=c.empty('MMF_Generator');r['pieceId']='generator'
    c.box('Isolated machine skid',(0,.075,0),(1.64,.15,1.38),c.steel,r,.045)
    for x in [-.70,.70]:
        for z in [-.55,.55]:c.box('Rubber vibration mount',(x,.17,z),(.15,.07,.15),rubber,r,.018)
    c.box('Sound insulated enclosure',(-.17,.66,.07),(1.06,.90,1.12),c.ivory,r,.074)
    c.box('Service lid rolled lip',(-.17,1.12,.07),(1.1,.07,1.16),c.bare,r,.027)
    panel('Service access door',(-.20,.66,-.51),(.91,.63,.03),r)
    c.box('Service latch',(.08,.66,-.544),(.045,.17,.027),rubber,r,.013)
    for y in [.50,.58,.66,.74,.82]:
        c.box('Recessed intake louvre',(-.39,y,-.54),(.36,.028,.018),c.dark,r,.006)
    # Fuel tank and protected refill assembly are unmistakably separate from storage.
    c.box('Reservoir',(.54,.60,.16),(.42,.80,.92),fuelpaint,r,.067)
    for z in [-.19,.47]:c.box('Reservoir restraint',(.54,.60,z),(.44,.79,.041),c.bare,r,.015)
    c.tube('Fuel filler neck',(.55,.93,-.36),(.55,1.13,-.36),.096,c.bare,r,40)
    c.tube('Fuel bayonet cap',(.55,1.125,-.36),(.55,1.185,-.36),.115,rubber,r,40)
    c.box('Cap pull handle',(.55,1.22,-.36),(.19,.05,.053),c.bare,r,.02)
    c.empty('FuelPort',(.55,1.20,-.36),r)
    c.cable('Protected fuel line',[(.54,.40,-.28),(.58,.31,-.48),(.25,.25,-.45),(.08,.37,-.43)],.024,rubber,r)
    panel('Refill instruction panel',(.54,.72,-.322),(.36,.23,.02),r,c.steel)
    c.label('Fuel port label','FUEL',(.54,.75,-.34),.070,r)
    c.label('Fuel service instruction','MANUAL FILL',(.54,.681,-.34),.027,r)
    c.box('Gauge recess',(.54,.46,-.325),(.25,.17,.018),rubber,r,.012)
    c.box('Gauge face',(.54,.46,-.34),(.213,.105,.012),c.ivory,r,.01)
    fill=c.empty('FuelGauge',(.448,.46,-.35),r)
    c.box('FuelGaugeFill',(.092,0,0),(.184,.04,.009),service,fill,.004)
    c.label('Generator equipment label','NOMAD / POWER 01',(-.18,1.01,-.516),.055,r)
    lamp=c.empty('PowerStatus',(-.39,.34,-.542),r)
    c.box('PowerStatusLight',(0,0,0),(.22,.045,.008),signal,lamp,.008)
    for x in [-.64,.24]:
        c.tube('Lifting hoop', (x,1.16,-.23),(x,1.23,-.23),.025,c.bare,r,20)
        c.tube('Lifting hoop',(x,1.23,-.23),(x,1.23,.32),.025,c.bare,r,20)
        c.tube('Lifting hoop',(x,1.23,.32),(x,1.16,.32),.025,c.bare,r,20)
    return r

def scanner():
    r=c.empty('MMF_SalvagedRadio')
    c.box('Scanner bolted pedestal',(0,.055,0),(.66,.11,.47),c.steel,r,.027)
    c.tube('Scanner post',(0,.11,0),(0,.79,0),.10,c.bare,r,32)
    for y in [.20,.65]:ring('Post clamp',(0,y,0),.105,.018,c.steel,r,'y')
    c.box('Instrument tray',(0,.84,0),(.91,.085,.52),c.steel,r,.032)
    c.box('Shielded scanner receiver',(0,1.15,0),(.92,.57,.45),c.ivory,r,.06)
    panel('Instrument face',(0,1.16,-.233),(.81,.46,.025),r,c.steel)
    c.box('Display seal',(-.14,1.23,-.251),(.47,.25,.013),rubber,r,.018)
    c.box('Display glass',(-.14,1.23,-.26),(.42,.207,.012),c.dark,r,.01)
    c.label('Scanner screen title','SCANNER',(-.14,1.265,-.27),.049,r)
    bar=c.empty('ScanProgress',(-.315,1.20,-.274),r)
    c.box('ScanProgressFill',(.175,0,0),(.35,.025,.008),signal,bar,.003)
    c.label('Scanner model title','NOMAD / RX-07',(-.14,1.027,-.257),.043,r)
    # The repair module has its own parent so runtime can expose the empty socket.
    c.box('Replacement module socket',(.275,1.17,-.255),(.19,.30,.027),rubber,r,.012)
    module=c.empty('ScannerModule',(.275,1.17,-.274),r)
    c.box('Shielded plug cartridge',(0,0,0),(.155,.25,.058),fuelpaint,module,.015)
    c.box('Module pull tab',(0,.087,-.038),(.088,.04,.026),c.bare,module,.008)
    for y in [-.075,-.025,.025]:c.box('Cartridge cooling slot',(0,y,-.032),(.10,.012,.008),c.dark,module,.002)
    c.empty('ScannerService',(.275,1.17,-.36),r)
    lamp=c.empty('SignalLamp',(.29,1.36,-.256),r)
    c.box('SignalStatus',(0,0,0),(.105,.027,.014),service,lamp,.006)
    for x in [-.31,-.02]:
        c.tube('Selector knob',(x,.975,-.25),(x,.975,-.29),.035,rubber,r,24)
    c.tube('Whip antenna',(-.35,1.42,.13),(-.35,1.87,.13),.012,c.bare,r,16)
    c.cable('Receiver power lead',[(.36,.91,.19),(.48,.66,.18),(.17,.28,.04)],.018,rubber,r)
    return r

def wrist():
    r=c.empty('NomadWristTerminal')
    c.box('Forearm curved housing',(0,.02,0),(.135,.052,.22),c.steel,r,.025)
    c.box('Protective screen frame',(0,.05,0),(.127,.028,.176),c.bare,r,.014)
    c.box('Recessed touchscreen',(0,.066,0),(.108,.009,.15),c.dark,r,.008)
    for z in [-.058,-.025,.008]:c.box('Electronic readout',(0,.072,z),(.084,.002,.006),signal,r,.001)
    for z in [-.083,.083]:
        c.box('Secured wrist strap',(0,-.023,z),(.15,.024,.037),rubber,r,.009)
    for z in [-.05,0,.05]:c.box('Rugged side key',(.073,.025,z),(.012,.015,.023),fuelpaint,r,.004)
    c.empty('ForearmMount',(0,-.035,0),r)
    return r


def workbench():
    r=c.empty('MMF_Workbench');r['pieceId']='workbench'
    for x in [-.76,.76]:
        for z in [-.32,.32]:
            c.box('Box section leg',(x,.43,z),(.085,.78,.085),c.steel,r,.01)
            c.box('Bolted foot',(x,.045,z),(.21,.09,.19),c.bare,r,.016)
    c.box('Lower parts shelf',(0,.24,0),(1.62,.065,.72),c.bare,r,.014)
    c.box('Worn assembly surface',(0,.865,0),(1.78,.11,.88),c.ivory,r,.027)
    c.box('Replaceable cutting mat',(-.15,.925,0),(.72,.008,.48),rubber,r,.004)
    for x in [-.42,-.28,-.14,0,.14]:
        c.box('Work mat grid',(x,.931,0),(.006,.002,.44),c.bare,r,.001)
    c.box('Vice sliding base',(.63,.941,-.13),(.30,.04,.24),c.steel,r,.008)
    for x in [.52,.71]:
        c.box('Vice jaw',(x,.985,-.13),(.045,.067,.25),c.bare,r,.006)
    c.tube('Vice lead screw',(.42,.962,-.13),(.79,.962,-.13),.022,c.bare,r,24)
    c.tube('Vice cross handle',(.80,.923,-.13),(.80,1.014,-.13),.013,c.bare,r,20)
    c.box('Parts tray',(-.65,.946,.09),(.26,.045,.49),c.steel,r,.015)
    for z in [-.09,.04,.17,.28]:
        c.tube('Sorted sockets',(-.65,.97,z),(-.65,.995,z),.028,c.bare,r,12)
    panel('Tool drawer',(0,.67,-.36),(1.18,.24,.045),r)
    c.box('Drawer pull',(0,.69,-.41),(.35,.037,.035),c.bare,r,.01)
    c.label('Workbench identification','ASSEMBLY / WORKBENCH',(0,.793,-.452),.050,r)
    c.label('Bench toolkit label','TOOLS / PARTS',(0,.59,-.388),.035,r)
    c.empty('ServiceAccess',(0,.90,-.48),r)
    return r

def refinery():
    r=c.empty('MMF_Refinery');r['pieceId']='refinery'
    c.box('Refinery isolated skid',(0,.07,0),(1.46,.14,1.44),c.steel,r,.035)
    c.box('Processing cabinet',(-.18,.69,.08),(1.02,1.1,1.05),c.ivory,r,.048)
    panel('Refinery service front',(-.18,.72,-.46),(.86,.69,.045),r)
    c.box('Scrap input hopper',(-.2,1.34,-.02),(.88,.25,.86),c.bare,r,.035)
    c.box('Dark hopper mouth',(-.2,1.474,-.02),(.68,.025,.64),rubber,r,.018)
    for x in [-.41,-.27,-.13,.01]:
        c.tube('Scrap sorting grate',(x,1.495,-.31),(x,1.495,.27),.017,c.bare,r,16)
    c.tube('Exhaust stack',(.49,.34,.40),(.49,1.83,.40),.105,c.steel,r,40)
    c.tube('Exhaust inlet coupling',(.24,.46,.40),(.49,.46,.40),.058,c.steel,r,24)
    c.box('Stack support bracket',(.375,1.11,.40),(.25,.055,.20),c.bare,r,.009)
    for y in [.49,.67,.85,1.03,1.21,1.39]:
        ring('Stack cooling collar',(.49,y,.40),.117,.016,c.bare,r,'y')
    c.tube('Rain cap stem',(.49,1.80,.40),(.49,1.88,.40),.039,c.bare,r,24)
    c.box('Rain cap',(.49,1.89,.40),(.36,.018,.32),c.bare,r,.01)
    c.box('Component output drawer',(-.18,.29,-.57),(.80,.20,.24),c.steel,r,.016)
    c.box('Output drawer pull',(-.18,.29,-.71),(.27,.04,.025),c.bare,r,.008)
    c.label('Refinery label','SCRAP REFINERY',(-.18,.98,-.491),.070,r)
    c.label('Output label','COMPONENT OUTPUT',(-.18,.35,-.702),.039,r)
    c.box('Inspection glass',(-.18,.72,-.49),(.54,.21,.012),rubber,r,.012)
    for x in [-.39,-.25,-.11,.03]:
        c.box('Inspection protective ribs',(x,.72,-.51),(.021,.20,.016),c.bare,r,.006)
    c.empty('ServiceAccess',(0,.94,-.76),r)
    return r

def storage():
    r=c.empty('MMF_Crate');r['pieceId']='crate'
    c.box('Sealed storage body',(0,.51,0),(1.31,.94,1.30),c.ivory,r,.052)
    c.box('Storage base rub strip',(0,.064,0),(1.39,.128,1.39),c.steel,r,.027)
    c.box('Storage gasket',(0,.973,0),(1.34,.027,1.33),rubber,r,.012)
    c.box('Reinforced lid',(0,1.018,0),(1.39,.073,1.39),c.bare,r,.028)
    for x in [-.54,.54]:
        c.box('Raised lid stiffener',(x,1.073,0),(.053,.039,1.22),c.steel,r,.008)
        for z in [-.635,.635]:
            c.box('Protected storage corner',(x,.53,z),(.065,.86,.045),c.steel,r,.012)
        c.box('Toggle lock',(x,.85,-.671),(.12,.21,.045),c.bare,r,.016)
        c.box('Recessed lock lever',(x,.855,-.70),(.048,.128,.016),rubber,r,.006)
    panel('Cargo inventory plaque',(0,.59,-.663),(.76,.30,.02),r,c.steel)
    c.label('Storage marking','STORAGE',(0,.63,-.68),.104,r)
    c.label('Storage access instruction','ONBOARD INVENTORY',(0,.53,-.68),.036,r)
    for x in [-.688,.688]:
        c.box('Recessed side grip',(x,.69,0),(.015,.13,.35),rubber,r,.014)
        c.tube('Grip crossbar',(x,.70,-.14),(x,.70,.14),.026,c.bare,r,24)
    c.empty('ServiceAccess',(0,.65,-.74),r)
    return r

assets=[('salvage-chest',cargo),('fuel-canister',canister),('generator-refined',generator),('salvaged-radio',scanner),('wrist-terminal',wrist),('workbench-refined',workbench),('refinery-refined',refinery),('storage-refined',storage)]
roots=[]
for name,factory in assets:
    obj=factory();obj['assetId']=name;roots.append((name,obj))

# Batch only siblings; functional moving/display groups keep their identities.
for parent in [o for _,root in roots for o in [root,*root.children_recursive] if o.type=='EMPTY']:
    for material in list(bpy.data.materials):
        meshes=[o for o in list(parent.children) if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==material]
        if len(meshes)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join()
        bpy.context.object.name=parent.name+'_'+material.name
for obj in [o for o in bpy.context.scene.objects if o.type=='MESH']:
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    if not obj.data.uv_layers:
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
    mod=obj.modifiers.new('Runtime triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
report=[]
for name,root in roots:
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root,*root.children_recursive]:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'exports'/f'{name}.glb'),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_tangents=True)
    bpy.context.view_layer.update()
    meshes=[o for o in root.children_recursive if o.type=='MESH']
    pts=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
    lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
    report.append({'id':name,'triangles':sum(len(o.data.polygons) for o in meshes),'meshes':len(meshes),'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]]})
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/NomadFoundations.blend'))
(OUT/'model-report.json').write_text(json.dumps(report,indent=2))
print('FOUNDATION_ASSETS',json.dumps(report),flush=True)
