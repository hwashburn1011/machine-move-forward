"""Original Last Garden transmitter, seed refuge and archive in game metres."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from base import c
import bpy

r=c.empty('LastGardenMeridian');gangway=c.platform(r)
c.empty('Entry',(-8,0,0),r)
# A layered radio tower gives Meridian a distinct vertical silhouette.
c.box('Transmitter foundation',(5,.35,-6),(4.5,.7,4.5),c.ivory,r,.10)
for y,rad,height,mat in [(1.1,1.25,1.4,c.steel),(3,1.0,2.4,c.ivory),(5.4,.8,2.4,c.steel),(7.6,.62,2.0,c.ivory),(9.1,.44,1.2,c.red)]:
    c.tube('Transmitter housing',(5,y-height/2,-6),(5,y+height/2,-6),rad,mat,r,48)
    for sign in [-1,1]:c.tube('Service flange',(5,y+sign*(height/2)-.06,-6),(5,y+sign*(height/2)+.06,-6),rad+.14,c.brass,r,48)
for y,rad in [(1.4,1.29),(2.8,1.04),(4.8,.84),(6.8,.66),(8.8,.48)]:
    for i in range(12):
        a=2*math.pi*i/12
        c.box('Transmitter status strip',(5+rad*math.cos(a),y,-6+rad*math.sin(a)),(.09,.30,.09),c.cyan,r,.009)
for x,z in [(3.2,-7.8),(6.8,-7.8),(3.2,-4.2),(6.8,-4.2)]:
    c.tube('Tower leg',(x,.7,z),(5,7,-6),.075,c.bare,r,16)
c.tube('Beacon mast',(5,9.5,-6),(5,14,-6),.09,c.bare,r,24)
for y in [10.2,11.2,12.2,13.2]:
    c.tube('Signal crossarm',(3.5,y,-6),(6.5,y,-6),.045,c.bare,r)
    for x in [3.5,6.5]:c.tube('Antenna tine',(x,y-.15,-6),(x,y+.4,-6),.025,c.ivory,r)
c.box('Beacon crown',(5,14.05,-6),(.32,.35,.32),c.amber,r,.045)
# Parabolic dish with rolled rim, radial braces, feed receiver and bolt ring.
verts=[];faces=[];rings=15;segments=72
for j in range(rings):
    radius=.06+2.45*j/(rings-1)
    for i in range(segments):
        a=2*math.pi*i/segments
        verts.append(c.xyz((5+radius*math.cos(a),9.5+radius*math.sin(a),-5.7+.16*radius*radius)))
for j in range(rings-1):
    for i in range(segments):
        a=j*segments+i;b=j*segments+(i+1)%segments
        faces.append((a,b,b+segments,a+segments))
mesh=bpy.data.meshes.new('Parabolic reflector');mesh.from_pydata(verts,[],faces);mesh.update()
dish=bpy.data.objects.new('Parabolic reflector',mesh);bpy.context.collection.objects.link(dish);c.finish(dish,dish.name,c.ivory,r)
solid=dish.modifiers.new('Rolled reflector thickness','SOLIDIFY');solid.thickness=.035;bpy.context.view_layer.objects.active=dish;bpy.ops.object.modifier_apply(modifier=solid.name)
rim=[(5+2.52*math.cos(2*math.pi*i/72),9.5+2.52*math.sin(2*math.pi*i/72),-4.684) for i in range(73)]
c.cable('Reflector rim',rim,.065,c.brass,r)
for i in range(8):
    a=2*math.pi*i/8
    c.tube('Dish radial brace',(5,9.5,-5.6),(5+2.4*math.cos(a),9.5+2.4*math.sin(a),-4.8),.025,c.bare,r)
for i in range(3):
    a=2*math.pi*i/3
    c.tube('Receiver strut',(5+1.8*math.cos(a),9.5+1.8*math.sin(a),-5.15),(5,9.5,-3.5),.04,c.bare,r)
c.box('Low noise receiver',(5,9.5,-3.45),(.35,.4,.6),c.steel,r,.06)
c.box('Receiver pilot',(5,9.5,-3.13),(.14,.18,.025),c.cyan,r,.008)
# A small maintained garden beneath a curved translucent barrel roof.
for x in [-7.5,-2.5]:
    for z in [-8.5,-6,-3.5]:c.tube('Garden upright',(x,0,z),(x,3,z),.07,c.ivory,r)
    c.box('Garden side glass',(x,1.7,-6),(.035,2.6,5),c.glass,r,.006)
for z in [-8.5,-6,-3.5]:
    pts=[(-5+2.5*math.cos(math.pi*i/24),3+1.2*math.sin(math.pi*i/24),z) for i in range(25)]
    c.cable('Barrel roof frame',pts,.07,c.ivory,r)
roofverts=[];rooffaces=[]
for z in [-8.5,-3.5]:
    for i in range(33):
        a=math.pi*i/32;roofverts.append(c.xyz((-5+2.5*math.cos(a),3+1.2*math.sin(a),z)))
for i in range(32):rooffaces.append((i,i+1,i+34,i+33))
rm=bpy.data.meshes.new('Garden curved glazing');rm.from_pydata(roofverts,[],rooffaces);rm.update()
ro=bpy.data.objects.new('Garden curved glazing',rm);bpy.context.collection.objects.link(ro);c.finish(ro,ro.name,c.glass,r)
for x in [-6.65,-3.35]:c.bed((x,0,-6),(1.15,3.8),r)
for x in [-6.6,-3.4]:c.tube('Garden light',(x,2.8,-7.7),(x,2.8,-4.3),.035,c.amber,r)
c.label('Refuge garden sign','THE LAST GARDEN',(-5,2.8,-3.43),.32,r)
c.label('Refuge promise','KEEP A PLACE FOR THOSE STILL COMING',(-5,2.5,-3.43),.10,r)
# Twin service stations: an archive cradle and a navigation solution module.
for x,word in [(-4,'WITNESS ARCHIVE'),(4,'MERIDIAN BEARING')]:
    c.box('Service bench',(x,.5,6.5),(4.6,1,2),c.steel,r,.09)
    c.box('Bench top',(x,1.05,6.5),(4.8,.12,2.15),c.ivory,r,.035)
    c.label('Station label '+word,word,(x,.6,5.48),.24,r)
    for dx in [-1.5,-.75,0,.75,1.5]:
        c.box('Protected memory cartridge',(x+dx,1.4,6.5),(.44,.6,.9),c.red if x<0 else c.ivory,r,.07)
        c.box('Cartridge lit index',(x+dx,1.4,6.03),(.23,.035,.025),c.cyan,r,.004)
    c.cable('Shielded station feed',[(x-2,1,6.5),(x-2.5,.25,5.3),(x-1,.16,3)],.06,c.dark,r)
for name,at in [('TransmitterConsole',(2.4,1.2,-3.1)),('ArchiveCradle',(-4,1.2,4.5)),('MeridianSolution',(4,1.2,4.5)),('CommonJournal',(0,1.2,-6.8)),('CivilianJournal',(-4,1.2,-2.4)),('DefenseJournal',(5.8,1.2,.8))]:c.terminal(name,at,r)
for x,z in [(-8,-9),(-8,9),(8,-9),(8,9),(0,9)]:
    c.tube('Meridian deck lamp',(x,0,z),(x,3.2,z),.075,c.steel,r)
    c.box('Lamp hood',(x,3.25,z),(.45,.22,.35),c.ivory,r,.04)
    c.box('Warm diffuser',(x,3.1,z),(.35,.05,.28),c.amber,r,.009)
c.export('last-garden-meridian',r,[gangway])
