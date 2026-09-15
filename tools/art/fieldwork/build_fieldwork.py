"""Original L-12 Linekeeper, caretaker dock and field weapon attachments.
Run in a background Blender process. Coordinates are metres in runtime Y-up.
"""
import sys, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'tools/art/glass_orchard'))
import common as c
import bpy
c.OUT=ROOT/'assets/fieldwork';c.OUT.mkdir(exist_ok=True);(c.OUT/'exports').mkdir(exist_ok=True)
root=c.empty('FieldworkKit')
unit=c.empty('L12',parent=root)
preserve=[unit]
rubber=c.flat('Field_Rubber',(.024,.026,.025),rough=.92)
glass=c.flat('Field_LensGlass',(.055,.14,.13),metal=.4,rough=.18)
cloth=c.flat('Field_SavedCanvas',(.30,.25,.15),rough=.96)

# Low, wide chassis: rounded shoulder plates over a serviceable drive train.
c.box('Linekeeper belly',(0,.32,0),(.65,.30,.78),c.steel,unit,.08)
c.box('Recovered ivory shell',(0,.60,0),(.63,.39,.69),c.ivory,unit,.095)
c.box('Oxide front access panel',(0,.54,-.375),(.48,.23,.04),c.red,unit,.035)
c.label('Chassis identity','L-12',(0,.55,-.402),.095,unit)
c.label('Chassis purpose','LINEKEEPER',(0,.46,-.404),.036,unit)
for side in [-1,1]:
    x=side*.44
    drive=c.empty('L12DriveLeft' if side<0 else 'L12DriveRight',parent=unit);preserve.append(drive)
    c.box('Track suspension case',(x,.24,0),(.26,.28,.79),c.steel,drive,.055)
    # Stadium belt follows actual wheel arcs; individual broad cleats retain a smooth silhouette.
    points=[]
    for i in range(12):points.append((-.30+i*.60/12,.40))
    for i in range(12):
        a=math.pi/2-i*math.pi/12;points.append((.30+.17*math.cos(a),.23+.17*math.sin(a)))
    for i in range(12):points.append((.30-i*.60/12,.06))
    for i in range(12):
        a=-math.pi/2-i*math.pi/12;points.append((-.30+.17*math.cos(a),.23+.17*math.sin(a)))
    for i,(z,y) in enumerate(points):
        z2,y2=points[(i+1)%len(points)]
        cleat=c.box('Rounded track cleat',(x,y,z),(.31,.046,.069),rubber,drive,.009)
        cleat.rotation_euler.x=-math.atan2(y2-y,z2-z)
        if i%3==0:c.box('Track steel grip',(x,y+.012,z),(.16,.025,.03),c.bare,drive,.005)
    for z in [-.29,0,.29]:
        wheel=c.empty(('L12WheelL' if side<0 else 'L12WheelR')+str(z),at=(x,.23,z),parent=unit);preserve.append(wheel)
        c.tube('Drive wheel',(side*-.10,0,0),(side*.16,0,0),.143,c.bare,wheel,32)
        c.tube('Painted wheel hub',(side*.161,0,0),(side*.174,0,0),.083,c.red,wheel,24)
        c.tube('Axle cap',(side*.175,0,0),(side*.188,0,0),.034,c.brass,wheel,20)
        for i in range(6):
            a=i*math.pi/3
            c.tube('Wheel hub bolt',(side*.177,.06*math.sin(a),.06*math.cos(a)),(side*.185,.06*math.sin(a),.06*math.cos(a)),.009,c.steel,wheel,8)
    c.box('Ivory track fender',(x,.465,0),(.33,.065,.89),c.ivory,unit,.035)
    c.tube('Protective handle',(side*.33,.72,-.23),(side*.33,.72,.23),.022,c.brass,unit,20)
    for z in [-.26,.26]:c.tube('Fender rivet',(side*.5,.50,z),(side*.5,.51,z),.012,c.bare,unit,12)

# Telescoping neck, independently rotating head with two deliberately soft, legible eyes.
c.tube('Neck bellows',(0,.77,.08),(0,.94,.08),.086,rubber,unit,32)
for y in [.80,.84,.88,.92]:c.tube('Bellows rib',(0,y-.006,.08),(0,y+.006,.08),.094,c.bare,unit,32)
head=c.empty('L12Sensor',at=(0,1.04,.04),parent=unit);preserve.append(head)
c.box('Rounded sensor housing',(0,0,0),(.49,.25,.29),c.ivory,head,.075)
c.box('Dark binocular face',(0,.006,-.158),(.40,.16,.033),c.dark,head,.044)
for x in [-.108,.108]:
    c.tube('Eyecup alloy surround',(x,.012,-.16),(x,.012,-.191),.069,c.bare,head,40)
    c.tube('Warm optical aperture',(x,.012,-.193),(x,.012,-.199),.046,c.amber,head,40)
    c.tube('Optical glass',(x,.012,-.201),(x,.012,-.205),.034,glass,head,32)
    c.box('Eye glint',(x-.009,.022,-.21),(.012,.019,.004),c.cyan,head,.003)
c.label('Sensor service mark','SVC 12',(0,.089,-.158),.021,head)
c.tube('Radio stalk',(.21,.10,.08),(.21,.39,.08),.007,c.bare,head,12)
c.tube('Insulated antenna tip',(.21,.39,.08),(.21,.44,.08),.012,rubber,head,12)

# Two manipulator arms fold close to the chassis and have runtime-readable pivots.
for side in [-1,1]:
    arm=c.empty('L12ArmLeft' if side<0 else 'L12ArmRight',at=(side*.33,.71,-.08),parent=unit);preserve.append(arm)
    c.tube('Shoulder bearing',(-.055,0,0),(.055,0,0),.075,c.bare,arm,24)
    c.box('Arm segment',(side*.045,-.105,-.03),(.09,.23,.10),c.red,arm,.026)
    elbow=c.empty('L12ElbowLeft' if side<0 else 'L12ElbowRight',at=(side*.08,-.20,-.06),parent=arm);preserve.append(elbow)
    c.tube('Elbow bearing',(-.06,0,0),(.06,0,0),.06,c.brass,elbow,24)
    c.box('Forearm actuator',(0,.04,-.13),(.083,.10,.24),c.ivory,elbow,.022)
    c.tube('Wrist spindle',(0,.04,-.24),(0,.04,-.29),.035,c.bare,elbow,20)
    for sign in [-1,1]:
        c.box('Padded gripper',(sign*.035,.04,-.32),(.018,.045,.10),rubber,elbow,.008)
    c.cable('Braided servo cable',[(0,.04,.02),(side*.07,-.08,.04),(side*.07,-.16,-.04)],.01,rubber,arm)

# The rear is readable in third-person following view: battery, vents and a preserved drawing.
c.box('Battery backpack',(0,.59,.37),(.41,.30,.12),c.steel,unit,.04)
for i in range(7):c.box('Heat exchanger fin',(-.15+i*.05,.62,.445),(.02,.17,.03),c.bare,unit,.005)
c.box('Canvas keepsake pouch',(0,.45,.445),(.28,.10,.035),cloth,unit,.013)
c.label('Rear promise','KEEP THE BAY OPEN',(0,.44,.467),.019,unit).rotation_euler.z=0
c.box('Power indicator',(.22,.63,.40),(.025,.065,.025),c.cyan,unit,.006)
for x in [-.23,.23]:
    for y in [.46,.69]:c.tube('Front fastener',(x,y,-.368),(x,y,-.397),.011,c.brass,unit,12)

dock=c.empty('CaretakerDock',parent=root);preserve.append(dock)
c.box('Service dock floor',(0,.045,0),(1.28,.09,1.32),c.steel,dock,.05)
for x in [-.48,.48]:
    c.box('Drive guide',(x,.11,0),(.11,.12,1.10),c.brass,dock,.035)
    c.box('Guide status',(x,.18,-.41),(.06,.018,.25),c.cyan,dock,.006)
c.box('Charging cabinet',(0,.50,.49),(.70,.91,.25),c.ivory,dock,.055)
c.box('Cabinet dark inset',(0,.58,.343),(.50,.56,.028),c.steel,dock,.025)
for x in [-.20,.20]:
    c.tube('Charging contact',(x,.23,.33),(x,.23,.28),.035,c.brass,dock,20)
for i in range(5):c.box('Dock grille',(0,.44+i*.046,.324),(.40,.017,.016),c.bare,dock,.004)
c.box('Dock readout',(0,.77,.318),(.38,.095,.016),c.dark,dock,.013)
c.label('Dock voltage','L-12 / 3 kW',(0,.76,.305),.035,dock)
c.cable('Heavy charging lead',[(.31,.22,.54),(.50,.13,.59),(.56,.10,.40),(.57,.08,.21)],.02,rubber,dock)
c.empty('CaretakerRest',(0,.12,-.1),dock)

# Physical attachments are separate named anchors for the equipped weapon visual.
for name,kind in [('RifleStabilizer',0),('RifleBurstCam',1),('ShotgunChoke',2),('ShotgunScatterBrake',3)]:
    part=c.empty(name,parent=root);preserve.append(part)
    if kind==1:
        c.box('Burst selector housing',(0,0,0),(.14,.06,.08),c.steel,part,.014)
        c.box('Burst selector plate',(0,.034,0),(.10,.008,.055),c.ivory,part,.006)
        for i in [-1,0,1]:c.box('Burst witness marker',(i*.025,.042,0),(.009,.007,.024),c.amber,part,.002)
        c.tube('Selector lever',(.065,0,0),(.080,.035,0),.009,c.brass,part,12)
    else:
        radius=.038 if kind==0 else .047
        c.tube('Muzzle device body',(0,0,-.11),(0,0,.05),radius,c.bare,part,40)
        c.tube('Muzzle recessed bore',(0,0,-.115),(0,0,-.118),radius*.61,c.dark,part,40)
        for z in [-.07,-.025,.02]:
            c.tube('Machined collar',(0,0,z-.006),(0,0,z+.006),radius*1.12,c.steel,part,40)
            for side in [-1,1]:
                c.box('Directional exhaust port',(side*radius,.004,z),(.007,.021,.021),c.dark,part,.003)
        if kind==3:
            for side in [-1,1]:c.box('Scatter brake side wing',(side*.053,0,-.055),(.044,.040,.095),c.steel,part,.008)
for mat in bpy.data.materials:
    if mat.name.startswith('Array_'):mat.name=mat.name.replace('Array_','Field_',1)
for img in bpy.data.images:
    if max(img.size)>512:img.scale(512,512);img.pack()
c.export('fieldwork-kit',root,preserve)
