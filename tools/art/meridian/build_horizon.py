"""Original distant maintained refuge. Silhouette asset, no collision or reward."""
import sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from base import c
r=c.empty('MeridianHorizon')
# Broad inhabited-looking infrastructure does not assert who maintains it.
c.box('Berm',(0,1,0),(92,2,32),c.dark,r,.5)
for x,h,w in [(-35,21,12),(-21,31,10),(20,27,13),(37,18,10)]:
    c.box('Refuge buttressed tower',(x,h/2,0),(w,h,14),c.ivory,r,.3)
    c.box('Weather cap',(x,h+.35,0),(w+1,.7,15),c.steel,r,.16)
    for side in [-1,1]:c.box('Tower rib',(x+side*(w/2-.4),h/2,-7.3),(.65,h,1),c.red,r,.09)
    for y in range(5,h-2,4):
        for dx in [-w*.28,0,w*.28]:
            c.box('Recessed window',(x+dx,y,-7.05),(1.6,1.7,.15),c.dark,r,.06)
            c.box('Maintained window light',(x+dx,y,-7.15),(1.1,.75,.06),c.amber,r,.025)
    c.tube('Roof aerial',(x,h+.5,0),(x,h+6,0),.09,c.bare,r)
c.box('Gate lintel',(0,17,0),(28,3,10),c.steel,r,.22)
for x in [-12,12]:
    c.box('Gate pier',(x,7.5,0),(3,15,10),c.ivory,r,.25)
    c.box('Navigation beacon',(x,13,-5.1),(.25,4,.08),c.cyan,r,.02)
c.box('Refuge header',(0,17,-5.1),(18,1.8,.16),c.red,r,.08)
c.label('Refuge name','MERIDIAN',(0,16.45,-5.22),1.3,r)
# A shaded greenhouse along the outer wall, repeated curved hoops.
for z in [8,12,16]:
    c.cable('Refuge greenhouse arch',[(8*math.cos(math.pi*i/16),3+4*math.sin(math.pi*i/16),z) for i in range(17)],.12,c.brass,r)
c.box('Greenhouse ground',(0,2,12),(16,.5,10),c.steel,r,.12)
for x in [-7,7]:c.box('Glass service wall',(x,4,12),(.08,4,10),c.glass,r,.02)
for x in [-5,0,5]:c.box('Greenhouse growing trough',(x,3,12),(3,1,8),c.ivory,r,.12)
# High signal pylon, a circular service marker and paired lights.
c.tube('Refuge signal mast',(-5,18,3),(-5,43,3),.16,c.bare,r,24)
for y in [30,35,40]:c.tube('Pylon crossarm',(-9,y,3),(-1,y,3),.08,c.bare,r)
c.cable('Horizon signal halo',[(-5+3*math.cos(2*math.pi*i/48),40+3*math.sin(2*math.pi*i/48),3) for i in range(49)],.10,c.cyan,r)
c.export('meridian-horizon',r,[])
