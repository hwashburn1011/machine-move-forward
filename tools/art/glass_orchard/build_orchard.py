"""Build the original greenhouse/archive destination in game metres."""
import sys, math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import common as c

r=c.empty('GlassOrchard');gangway=c.platform(r)
c.empty('Entry',(-8,0,0),r)

def greenhouse(cx,cz,damaged=False):
    # Two outer grow lanes and an open walking lane through the centre.
    for x in [cx-3,cx+3]:
        for z in [cz-3.4,cz,cz+3.4]:
            c.tube('Greenhouse upright',(x,0,z),(x,3.5,z),.075,c.ivory,r)
            c.tube('Ridge truss',(x,3.5,z),(cx,4.8,z),.065,c.bare,r)
        c.tube('Eave beam',(x,3.5,cz-3.4),(x,3.5,cz+3.4),.07,c.ivory,r)
    c.tube('Ridge cap',(cx,4.8,cz-3.4),(cx,4.8,cz+3.4),.08,c.ivory,r)
    for side in [-1,1]:
        for j in range(3):
            if damaged and (j+side)%2==0:continue
            z=cz-2.3+j*2.3
            c.box('Weathered side glass',(cx+side*3,2.2,z),(.025,2.45,2.23),c.glass,r,.004)
            # Roof sheets are sloped to meet the ridge, leaving selected missing panes.
            panel=c.box('Sloped greenhouse pane',(cx+side*1.5,4.14,z),(3.25,.025,2.23),c.glass,r,.004)
            panel.rotation_euler[1]=side*math.atan2(1.3,3)
    for dx in [-1,1]:
        c.bed((cx+dx*1.8,0,cz-.15),(1.25,4.9),r,not(damaged and dx>0))
    for z in [cz-3.4,cz+3.4]:
        for dx in [-2.1,2.1]:
            c.box('End frame glass',(cx+dx,2,z),(1.65,2.6,.025),c.glass,r,.004)
    for x in [cx-2.8,cx+2.8]:
        c.tube('Grow light fixture',(x,3.0,cz-2),(x,3.0,cz+2),.07,c.steel,r)
        c.tube('Warm grow light',(x,2.95,cz-1.9),(x,2.95,cz+1.9),.026,c.amber,r,12)
    c.cable('Overhead irrigation',[(cx-2.8,2.8,cz-3),(cx,3.1,cz),(cx+2.8,2.8,cz+3)],.035,c.dark,r)

greenhouse(-5,-5)
greenhouse(-5,5,True)

# The cold archive remains legible beside the warmer glasshouse.
c.box('Cold vault foundation',(5,.25,-7),(5.7,.5,4),c.steel,r,.08)
c.box('Cold archive housing',(5,2.15,-7),(5.5,3.8,3.8),c.ivory,r,.11)
c.box('Archive canopy',(5,4.2,-7),(6.2,.18,4.5),c.red,r,.04)
for x in [2.35,3.7,5,6.3,7.65]:
    c.box('Memory rack dark inset',(x,2.2,-5.06),(.7,2.7,.055),c.dark,r,.015)
    for y in [.95,1.45,1.95,2.45,2.95,3.45]:
        c.box('Cold archive status lamp',(x,y,-5.015),(.32,.035,.026),c.cyan,r,.004)
c.label('Memory vault title','ANNIKA // WITNESS ARCHIVE',(5,3.87,-5.04),.21,r)
for x in [2.1,7.9]:
    c.tube('Archive cooling trunk',(x,.2,-8.5),(x,4,-8.5),.17,c.bare,r,24)
    c.cable('Archive feed',[(x,.4,-8.5),(x,.3,-4),(x,1.2,-2)],.08,c.dark,r)

# Course machinery: a visible, brass-ringed vector governor on a service cradle.
c.box('Vector workbench',(5,.47,6.5),(5.8,.94,2.8),c.steel,r,.06)
c.box('Worn workbench top',(5,.98,6.5),(6,.10,3),c.bare,r,.025)
for x in [3,4,5,6,7]:
    c.tube('Hydraulic governor spindle',(x,1.3,6.1),(x,1.3,7.3),.23,c.bare,r,32)
    for z in [6.1,6.7,7.3]:c.tube('Governor brass bearing',(x,1.3,z-.06),(x,1.3,z+.06),.31,c.brass,r,32)
c.box('Control panel',(7.35,1.2,5.55),(.75,.35,.50),c.red,r)
c.label('Vector sign','VECTOR CONTROL // SERVICE',(5,1.58,5.12),.20,r)
for x in [3,7]:
    c.tube('Tool stand',(x,0,8.4),(x,2.8,8.4),.08,c.steel,r)
    c.cable('Service hose',[(x,2.7,8.4),(x-.35,1.4,7.9),(x,.7,7.1)],.035,c.dark,r)

# Physical interaction pedestals and distinct semantic anchors.
c.terminal('SeedBank',(-4,1.2,-5),r)
c.terminal('VectorGovernor',(5,1.2,5),r)
c.terminal('MemoryCore',(5,1.3,-5),r)
c.terminal('MemoryJournal',(3.8,1.2,-3),r)
c.terminal('CaretakerJournal',(-5,1.2,5),r)
c.terminal('EvacuationJournal',(0,1.2,-7),r)
for name,x in [('PortIsolator',-7.1),('StarboardIsolator',5)]:
    # Port hardware sits beside the greenhouse doorway, outside both walking lanes.
    # Keep the operating anchors and source colliders in src/data/story.ts aligned.
    c.box(name+' switch cabinet',(x,.65,1.45),(.8,1.3,.55),c.red,r,.05)
    c.box(name+' inset',(x,1.05,1.14),(.56,.45,.035),c.dark,r,.008)
    c.tube(name+' lever',(x,1.04,1.08),(x,1.31,1.01),.045,c.brass,r)
    c.box(name+' indicator',(x+.2,1.38,1.13),(.08,.05,.025),c.amber,r,.004)
    c.empty(name,(x,1.1,0),r)
    c.label(name+' marking','ARCHIVE BUS',(x,.73,1.1),.115,r)

c.box('Orchard entrance sign',(-5,3.4,-1.52),(5.3,.65,.13),c.steel,r)
c.label('Orchard identity','GLASS ORCHARD',(-5,3.24,-1.6),.4,r)
c.label('Orchard promise','EVERY SEED IS A PROMISE',(-5,2.98,-1.6),.15,r)
for x,z in [(-8,-9),(-8,9),(8,-9),(8,9),(0,9)]:
    c.tube('Walkway lamp',(x,0,z),(x,3.1,z),.07,c.steel,r)
    c.box('Lamp housing',(x,3.1,z),(.42,.28,.3),c.steel,r)
    c.box('Lamp diffuser',(x,2.92,z),(.32,.05,.22),c.amber,r,.007)
c.export('glass-orchard',r,[gangway])
