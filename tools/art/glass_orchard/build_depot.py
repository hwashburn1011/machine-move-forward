"""Original Linekeeper repair depot for earned wider course control."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import common as c

r=c.empty('Route_repair-depot');gangway=c.platform(r,12,10)
# Overhead gantry and suspended spare hydraulic leg suggest former walker service.
for x in [-4.7,4.7]:
    c.tube('Gantry upright',(x,0,2.8),(x,5.5,2.8),.18,c.ivory,r,24)
    for y in [1,2,3,4,5]:c.box('Gantry warning band',(x,y,2.8),(.41,.13,.41),c.red,r,.01)
c.box('Overhead hoist beam',(0,5.4,2.8),(10.3,.4,.5),c.ivory,r,.06)
c.box('Hoist motor',(1.3,5,2.8),(1.3,.6,.8),c.steel,r,.07)
c.tube('Hoist line',(1.3,4.75,2.8),(1.3,2.9,2.8),.028,c.dark,r)
c.tube('Suspended actuator',(1.3,1.2,2.8),(1.3,3.0,2.8),.32,c.bare,r,40)
c.tube('Actuator ram',(1.3,.55,2.8),(1.3,1.6,2.8),.16,c.bare,r,32)
for y in [1.25,2.3,2.9]:c.tube('Cylinder collar',(1.3,y-.10,2.8),(1.3,y+.10,2.8),.40,c.brass,r,32)
c.box('Repair workbench',(-3,.47,3.2),(3.4,.94,2),c.steel,r,.07)
c.box('Machined tabletop',(-3,1,3.2),(3.6,.13,2.2),c.bare,r,.025)
for x in [-4,-3.3,-2.6,-1.9]:
    c.tube('Spare cylinder',(x,1.22,2.8),(x,1.22,3.6),.14,c.ivory,r,24)
    c.tube('Tool grip',(x,1.22,3.55),(x,1.22,3.82),.095,c.dark,r,16)
for x in [3,4.5]:
    c.tube('Service gas bottle',(x,.15,-2.7),(x,1.8,-2.7),.28,c.red,r,32)
    c.tube('Valve stem',(x,1.8,-2.7),(x,2,-2.7),.065,c.brass,r)
    c.cable('Service hose',[(x,1.9,-2.7),(x+.3,.6,-1.8),(2.2,.1,-1.6)],.045,c.dark,r)
c.box('Repair kit locker',(-3,1.0,-2.6),(2,2,1.5),c.ivory,r,.08)
c.box('Locker inset',(-3,1.05,-3.38),(1.65,1.65,.04),c.steel,r,.02)
c.label('Repair locker sign','LINEKEEPERS',(-3,1.35,-3.41),.19,r)
c.label('Repair promise','NO ONE LEFT STILL',(-3,1.01,-3.41),.105,r)
c.terminal('Reward',(-2,1.2,1.5),r)
for x in [-5.5,5.5]:
    c.tube('Depot light',(x,0,-4.3),(x,3,-4.3),.07,c.steel,r)
    c.box('Depot diffuser',(x,3,-4.3),(.4,.2,.35),c.amber,r,.015)
c.export('route-repair-depot',r,[gangway])
